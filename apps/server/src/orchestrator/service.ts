import { randomUUID } from "node:crypto";

import {
  BrainstormAssistantOutputSchema,
  MemorySummarizerOutputSchema,
  type BrainstormAssistantInput,
  type BrainstormAssistantOutput,
  type ChatAssistantInput,
  type GenerationTask,
  type MemorySummarizerOutput,
  type Message,
  type Session,
  type SketchGenerationInput,
  type SketchGenerationOutput,
  type TreeNode,
  type TreeOperation,
  type VisualDirectionBrief
} from "@voice-industrial-design/shared";

import type {
  AgentGateway,
  RuntimeApiKeys,
  TranscribeAudioInput,
  TranscribeAudioOutput
} from "../agents/types.js";
import type { AppConfig } from "../config.js";
import { ApiError } from "../errors.js";
import { recordAgentObservation } from "../observability/agent-observation.js";
import type { AppServices } from "../repositories/types.js";

const MEMORY_TRIGGER_TURN_COUNT = 6;

export interface ProcessVoiceTurnInput {
  sessionId: string;
  transcriptText?: string;
  audio?: Buffer;
  mimeType?: string;
  targetNodeId: string | null;
  runtimeApiKeys?: RuntimeApiKeys;
}

export interface ProcessVoiceTurnResult {
  task: GenerationTask | null;
  operation: TreeOperation | null;
}

export interface SessionOperationInput {
  sessionId: string;
  operationId?: string | null;
  taskId?: string | null;
}

export interface Orchestrator {
  transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioOutput>;
  processVoiceTurn(input: ProcessVoiceTurnInput): Promise<ProcessVoiceTurnResult>;
  undoSession(input: SessionOperationInput): Promise<TreeOperation>;
  redoSession(input: SessionOperationInput): Promise<TreeOperation>;
}

export function createOrchestrator(
  services: AppServices,
  config: AppConfig,
  agentGateway: AgentGateway
): Orchestrator {
  return {
    async transcribeAudio(
      input: TranscribeAudioInput
    ): Promise<TranscribeAudioOutput> {
      return agentGateway.transcribeAudio(input);
    },
    async processVoiceTurn(
      input: ProcessVoiceTurnInput
    ): Promise<ProcessVoiceTurnResult> {
      const session = await services.repositories.sessions.getById(input.sessionId);

      if (!session) {
        throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
      }

      const transcriptText = input.transcriptText?.trim();
      const transcript = transcriptText
        ? { transcriptText }
          : await agentGateway.transcribeAudio({
            transcriptText: input.transcriptText,
            audio: input.audio,
            mimeType: input.mimeType,
            runtimeApiKeys: input.runtimeApiKeys
          });
      const runningTask = await services.repositories.generationTasks.getRunningBySessionId(
        input.sessionId
      );

      if (runningTask) {
        throw new ApiError(
          409,
          "SESSION_BUSY",
          "Another generation task is still running"
        );
      }

      const treeNodes = await services.repositories.treeNodes.listBySessionId(
        input.sessionId
      );
      const sessionMessages = await services.repositories.messages.listBySessionId(
        input.sessionId
      );
      const latestMemory =
        await services.repositories.messages.getLatestMemorySummary(session.id);
      const conversationMemory = parseMemorySummaryMessage(latestMemory);
      const turnIntent = resolveTurnIntent(transcript.transcriptText);

      if (turnIntent === "delete") {
        await createUserTranscriptMessage(
          services,
          session.id,
          null,
          transcript.transcriptText
        );

        return {
          task: null,
          operation: await executeDeleteOperation({
            services,
            session,
            treeNodes,
            targetNodeId: resolveSelectedNodeId(
              session,
              treeNodes,
              input.targetNodeId,
              transcript.transcriptText
            )
          })
        };
      }

      if (turnIntent === "undo") {
        await createUserTranscriptMessage(
          services,
          session.id,
          null,
          transcript.transcriptText
        );

        return {
          task: null,
          operation: await executeUndoSession({
            services,
            sessionId: input.sessionId,
            operationId: null,
            taskId: null
          })
        };
      }

      if (turnIntent === "redo") {
        await createUserTranscriptMessage(
          services,
          session.id,
          null,
          transcript.transcriptText
        );

        return {
          task: null,
          operation: await executeRedoSession({
            services,
            sessionId: input.sessionId
          })
        };
      }

      const targetContext = resolveTargetContext(
        session,
        treeNodes,
        input.targetNodeId,
        transcript.transcriptText
      );
      const chatType = resolveChatType(transcript.transcriptText);

      if (chatType) {
        return executeChatTurn({
          services,
          agentGateway,
          session,
          transcriptText: transcript.transcriptText,
          runtimeApiKeys: input.runtimeApiKeys,
          chatType,
          targetNode: targetContext.targetNode,
          treeNodes,
          sessionMessages,
          conversationMemory
        });
      }

      const assistantInput = buildBrainstormInput({
        session,
        transcriptText: transcript.transcriptText,
        targetNode: targetContext.targetNode,
        selectedNodeId: targetContext.selectedNodeId,
        sessionMessages,
        treeNodes,
        config,
        conversationMemory,
        actionType: turnIntent
      });
      recordAgentObservation("brainstorm_assistant.input", {
        sessionId: session.id,
        selectedNodeId: targetContext.selectedNodeId,
        transcriptText: transcript.transcriptText,
        assistantInput
      });
      const rawAssistantOutput =
        await agentGateway.runBrainstormAssistant({
          ...assistantInput,
          runtimeApiKeys: input.runtimeApiKeys
        });
      recordAgentObservation("brainstorm_assistant.output", {
        sessionId: session.id,
        selectedNodeId: targetContext.selectedNodeId,
        rawAssistantOutput
      });
      const assistantOutput = BrainstormAssistantOutputSchema.parse(
        normalizeAssistantOutput(
          rawAssistantOutput,
          transcript.transcriptText,
          config,
          assistantInput.constraints.defaultBranchCount
        )
      );
      validateAssistantOutput({
        output: assistantOutput,
        selectedNodeId: targetContext.selectedNodeId,
        config,
        transcriptText: transcript.transcriptText,
        defaultBranchCount: assistantInput.constraints.defaultBranchCount
      });
      recordAgentObservation("prompt_router.input", {
        sessionId: session.id,
        selectedNodeId: targetContext.selectedNodeId,
        transcriptText: transcript.transcriptText,
        assistantOutput
      });

      const task = await services.repositories.generationTasks.create({
        sessionId: session.id,
        targetNodeId: assistantOutput.targetNodeId,
        actionType: assistantOutput.actionType,
        branchCount: assistantOutput.branchCount,
        transcriptText: transcript.transcriptText,
        designIntentSummary: assistantOutput.designIntentSummary,
        assistantReply: assistantOutput.assistantReply
      });

      const userTranscriptMessage = await createUserTranscriptMessage(
        services,
        session.id,
        task.id,
        transcript.transcriptText
      );

      const assistantSummaryMessage = await createAssistantSummaryMessage(
        services,
        session.id,
        task.id,
        assistantOutput.assistantReply
      );

      await maybeCreateConversationMemory({
        services,
        agentGateway,
        session,
        targetNode: targetContext.targetNode,
        messages: [
          ...sessionMessages,
          userTranscriptMessage,
          assistantSummaryMessage
        ]
      });

      const branchTasks = [];
      for (const [index, brief] of assistantOutput.directionBriefs.entries()) {
        branchTasks.push(await services.repositories.branchTasks.create({
          generationTaskId: task.id,
          branchIndex: index,
          brief,
          status: "queued",
          imageUrl: null,
          errorMessage: null
        }));
      }

      const queuedTask = {
        ...task,
        branchTasks
      };
      recordAgentObservation("prompt_router.output", {
        sessionId: session.id,
        taskId: queuedTask.id,
        actionType: assistantOutput.actionType,
        targetNodeId: assistantOutput.targetNodeId,
        branchTasks: queuedTask.branchTasks.map((branchTask, branchIndex) => ({
          id: branchTask.id,
          branchIndex,
          status: branchTask.status,
          brief: branchTask.brief
        }))
      });

      void executeTaskGeneration({
        services,
        agentGateway,
        config,
        session,
        task: queuedTask,
        targetNode: targetContext.targetNode,
        treeNodes,
        conversationHistory: buildConversationHistory([
          ...sessionMessages,
          userTranscriptMessage,
          assistantSummaryMessage
        ]),
        actionType: assistantOutput.actionType,
        briefs: branchTasks.map((branchTask) => branchTask.brief),
        runtimeApiKeys: input.runtimeApiKeys
      });

      return {
        task: queuedTask,
        operation: null
      };
    },

    async undoSession(input: SessionOperationInput): Promise<TreeOperation> {
      return executeUndoSession({
        services,
        sessionId: input.sessionId,
        operationId: input.operationId ?? null,
        taskId: input.taskId ?? null
      });
    },

    async redoSession(input: SessionOperationInput): Promise<TreeOperation> {
      return executeRedoSession({
        services,
        sessionId: input.sessionId
      });
    }
  };
}

async function executeChatTurn(input: {
  services: AppServices;
  agentGateway: AgentGateway;
  session: Session;
  transcriptText: string;
  runtimeApiKeys?: RuntimeApiKeys;
  chatType: ChatAssistantInput["chatType"];
  targetNode: TreeNode | null;
  treeNodes: TreeNode[];
  sessionMessages: Message[];
  conversationMemory: MemorySummarizerOutput | undefined;
}): Promise<ProcessVoiceTurnResult> {
  const userTranscriptMessage = await createUserTranscriptMessage(
    input.services,
    input.session.id,
    null,
    input.transcriptText
  );

  const chatOutput = await input.agentGateway.runChatAssistant({
    userIntentText: input.transcriptText,
    chatType: input.chatType,
    sessionGoal: input.session.goal,
    conversationMemory: input.conversationMemory,
    conversationHistory: buildConversationHistory(input.sessionMessages),
    selectedNode: input.targetNode
      ? {
          nodeId: input.targetNode.id,
          displayName: input.targetNode.displayName,
          intentSummary: input.targetNode.intentSummary
        }
      : undefined,
    visibleNodeSummaries: input.treeNodes.slice(-12).map((node) => ({
      nodeId: node.id,
      displayName: node.displayName,
      intentSummary: node.intentSummary
    })),
    runtimeApiKeys: input.runtimeApiKeys
  });

  const assistantMessage = await input.services.repositories.messages.create({
    sessionId: input.session.id,
    taskId: null,
    role: "assistant",
    kind: input.chatType === "casual" ? "chat" : "node_explanation",
    content: chatOutput.assistantReply
  });

  await maybeCreateConversationMemory({
    services: input.services,
    agentGateway: input.agentGateway,
    session: input.session,
    targetNode: input.targetNode,
    runtimeApiKeys: input.runtimeApiKeys,
    messages: [
      ...input.sessionMessages,
      userTranscriptMessage,
      assistantMessage
    ]
  });

  return {
    task: null,
    operation: null
  };
}

function resolveTargetContext(
  session: Session,
  treeNodes: TreeNode[],
  requestedTargetNodeId: string | null,
  transcriptText: string
): { selectedNodeId: string; targetNode: TreeNode | null } {
  const selectedNodeId = resolveSelectedNodeId(
    session,
    treeNodes,
    requestedTargetNodeId,
    transcriptText
  );
  const targetNode =
    treeNodes.find((node) => node.id === selectedNodeId) ?? null;

  if (selectedNodeId !== session.id && !targetNode) {
    throw new ApiError(404, "TARGET_NODE_NOT_FOUND", "Target node not found");
  }

  return {
    selectedNodeId,
    targetNode
  };
}

function resolveSelectedNodeId(
  session: Session,
  treeNodes: TreeNode[],
  requestedTargetNodeId: string | null,
  transcriptText: string
): string {
  const referencedTargetNodeId = resolveReferencedTargetNodeId(
    transcriptText,
    treeNodes
  );

  return (
    referencedTargetNodeId ??
    requestedTargetNodeId ??
    session.currentSelectedNodeId ??
    session.id
  );
}

async function executeTaskGeneration(input: {
  services: AppServices;
  agentGateway: AgentGateway;
  config: AppConfig;
  session: Session;
  task: GenerationTask;
  targetNode: TreeNode | null;
  treeNodes: TreeNode[];
  conversationHistory: BrainstormAssistantInput["conversationHistory"];
  actionType: BrainstormAssistantOutput["actionType"];
  briefs: VisualDirectionBrief[];
  runtimeApiKeys?: RuntimeApiKeys;
}): Promise<void> {
  try {
    await persistGeneratedBranches(input);
  } catch {
    await input.services.repositories.generationTasks.updateStatus({
      taskId: input.task.id,
      status: "failed"
    });
  }
}

function resolveReferencedTargetNodeId(
  transcriptText: string,
  treeNodes: TreeNode[]
): string | null {
  const normalizedTranscript = normalizeNodeReferenceText(transcriptText);
  const normalizedTranscriptWithArabicNodeNumbers =
    normalizeNodeReferenceText(rewriteNodeReferenceChineseNumbers(transcriptText));
  const publicNodeNumberMatch =
    normalizedTranscriptWithArabicNodeNumbers.match(/节点([0-9]+)/) ??
    normalizedTranscriptWithArabicNodeNumbers.match(/([0-9]+)号节点/) ??
    normalizedTranscriptWithArabicNodeNumbers.match(/node([0-9]+)/i);

  if (publicNodeNumberMatch) {
    const publicNodeNumber = Number(publicNodeNumberMatch[1]);
    const matchedByNumber = treeNodes.find(
      (node) => node.publicNodeNumber === publicNodeNumber
    );

    if (matchedByNumber) {
      return matchedByNumber.id;
    }
  }

  const aliasCandidates = treeNodes
    .flatMap((node) => [node.displayName, ...node.voiceAliases].map((alias) => ({
      nodeId: node.id,
      alias: normalizeNodeReferenceText(alias)
    })))
    .filter((candidate) => candidate.alias.length > 0)
    .sort((left, right) => right.alias.length - left.alias.length);

  const matchedAlias = aliasCandidates.find((candidate) =>
    normalizedTranscript.includes(candidate.alias)
  );

  return matchedAlias?.nodeId ?? null;
}

function rewriteNodeReferenceChineseNumbers(value: string): string {
  return value
    .replace(
      /节点\s*([零〇一二两三四五六七八九十百千万]+)/g,
      (_match, rawNumber) => {
        const parsedNumber = parseChineseInteger(rawNumber);
        return parsedNumber === null ? _match : `节点 ${parsedNumber}`;
      }
    )
    .replace(
      /([零〇一二两三四五六七八九十百千万]+)\s*号节点/g,
      (_match, rawNumber) => {
        const parsedNumber = parseChineseInteger(rawNumber);
        return parsedNumber === null ? _match : `${parsedNumber}号节点`;
      }
    );
}

function normalizeNodeReferenceText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。、“”"'‘’：:；;（）()【】\[\]、,.!?！？-]/g, "");
}

function parseChineseInteger(value: string): number | null {
  const normalized = value.replace(/两/g, "二").replace(/[〇零]/g, "零");

  if (/^[一二三四五六七八九]$/.test(normalized)) {
    return simpleChineseDigitMap[normalized] ?? null;
  }

  if (normalized === "十") {
    return 10;
  }

  const tenMatch = normalized.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);

  if (tenMatch) {
    const tens = tenMatch[1] ? (simpleChineseDigitMap[tenMatch[1]] ?? 0) : 1;
    const ones = tenMatch[2] ? (simpleChineseDigitMap[tenMatch[2]] ?? 0) : 0;
    return tens * 10 + ones;
  }

  if (/^[0-9]+$/.test(normalized)) {
    return Number(normalized);
  }

  return null;
}

const simpleChineseDigitMap: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
};

function buildBrainstormInput(input: {
  session: Session;
  transcriptText: string;
  selectedNodeId: string;
  targetNode: TreeNode | null;
  sessionMessages: Message[];
  treeNodes: TreeNode[];
  config: AppConfig;
  conversationMemory: MemorySummarizerOutput | undefined;
  actionType: BrainstormAssistantOutput["actionType"];
}): BrainstormAssistantInput {
  const selectedNodeSummary = input.targetNode
    ? {
        publicNodeNumber: input.targetNode.publicNodeNumber,
        displayName: input.targetNode.displayName,
        label: input.targetNode.label,
        intentSummary: input.targetNode.intentSummary,
        formLanguage: input.targetNode.formLanguage,
        userNeedResponse: input.targetNode.userNeedResponse,
        inspirationHints: input.targetNode.inspirationHints
      }
    : {
        publicNodeNumber: 1,
        displayName: input.session.title,
        label: input.session.goal,
        intentSummary: input.session.goal,
        formLanguage: [],
        userNeedResponse: [],
        inspirationHints: []
      };

  const siblingSummaries = input.treeNodes
    .filter((node) => node.parentNodeId === (input.targetNode?.parentNodeId ?? null))
    .map((node) => ({
      nodeId: node.id,
      label: node.label,
      intentSummary: node.intentSummary,
      formLanguage: node.formLanguage
    }));

  return {
    sessionGoal: input.session.goal,
    transcriptText: input.transcriptText,
    selectedNodeId: input.selectedNodeId,
    selectedNodeSummary,
    ancestorPath: buildAncestorPath(input.targetNode, input.treeNodes),
    conversationHistory: buildConversationHistory(input.sessionMessages),
    conversationMemory: input.conversationMemory,
    siblingSummaries,
    constraints: {
      minBranchCount: 3,
      maxBranchCount: input.config.maxBranchCount,
      defaultBranchCount: resolveDefaultBranchCount({
        actionType: input.actionType,
        targetNode: input.targetNode,
        treeNodes: input.treeNodes,
        config: input.config
      }),
      productDomain: "industrial_design",
      sketchStage: "early",
      inputMode: "voice_only"
    }
  };
}

function resolveDefaultBranchCount(input: {
  actionType: BrainstormAssistantOutput["actionType"];
  targetNode: TreeNode | null;
  treeNodes: TreeNode[];
  config: AppConfig;
}): number {
  if (input.actionType === "diverge") {
    return 3;
  }

  const parentNodeId = input.targetNode?.id ?? null;
  const latestGroupId = input.treeNodes
    .filter((node) => node.parentNodeId === parentNodeId && node.childGroupId)
    .sort((left, right) => right.layerVersion - left.layerVersion)[0]?.childGroupId;

  if (!latestGroupId) {
    return 3;
  }

  const groupSize = input.treeNodes.filter(
    (node) => node.childGroupId === latestGroupId
  ).length;

  return Math.min(Math.max(groupSize, 3), input.config.maxBranchCount);
}

async function maybeCreateConversationMemory(input: {
  services: AppServices;
  agentGateway: AgentGateway;
  session: Session;
  targetNode: TreeNode | null;
  runtimeApiKeys?: RuntimeApiKeys;
  messages: Message[];
}): Promise<void> {
  if (countDialogueTurns(input.messages) <= MEMORY_TRIGGER_TURN_COUNT) {
    return;
  }

  const latestMemory =
    await input.services.repositories.messages.getLatestMemorySummary(
      input.session.id
    );
  const latestMemoryCreatedAt = latestMemory?.createdAt ?? "";
  const messagesAfterMemory = input.messages.filter(
    (message) =>
      message.role === "user" && message.createdAt > latestMemoryCreatedAt
  );

  if (latestMemory && messagesAfterMemory.length <= MEMORY_TRIGGER_TURN_COUNT) {
    return;
  }

  const previousMemory = parseMemorySummaryMessage(latestMemory);
  const memory = await input.agentGateway.runMemorySummarizer({
    sessionGoal: input.session.goal,
    selectedNode: input.targetNode
      ? {
          nodeId: input.targetNode.id,
          intentSummary: input.targetNode.intentSummary
        }
      : undefined,
    recentMessages: selectRecentDialogueMessages(input.messages).map(
      (message) => ({
        role: message.role,
        kind: message.kind,
        content: message.content
      })
    ),
    previousMemory
  });

  await input.services.repositories.messages.create({
    sessionId: input.session.id,
    taskId: null,
    role: "system",
    kind: "memory_summary",
    content: JSON.stringify(memory)
  });
}

function countDialogueTurns(messages: Message[]): number {
  return messages.filter((message) => message.role === "user").length;
}

function selectRecentDialogueMessages(messages: Message[]): Message[] {
  return messages
    .filter(
      (message) =>
        message.kind === "transcript" ||
        message.kind === "intent" ||
        message.kind === "summary" ||
        message.kind === "chat" ||
        message.kind === "node_explanation"
    )
    .slice(-(MEMORY_TRIGGER_TURN_COUNT * 2));
}

function parseMemorySummaryMessage(
  message: Message | null
): MemorySummarizerOutput | undefined {
  if (!message) {
    return undefined;
  }

  try {
    return MemorySummarizerOutputSchema.parse(JSON.parse(message.content));
  } catch {
    return undefined;
  }
}

function buildConversationHistory(
  messages: Message[]
): BrainstormAssistantInput["conversationHistory"] {
  return messages
    .filter((message) => message.kind === "transcript" || message.kind === "summary")
    .slice(-8)
    .map((message) => ({
      role: message.role,
      kind: message.kind,
      content: message.content
    }));
}

function buildAncestorPath(
  targetNode: TreeNode | null,
  treeNodes: TreeNode[]
): BrainstormAssistantInput["ancestorPath"] {
  const byId = new Map(treeNodes.map((node) => [node.id, node]));
  const path: BrainstormAssistantInput["ancestorPath"] = [];
  let currentParentId = targetNode?.parentNodeId ?? null;

  while (currentParentId) {
    const ancestor = byId.get(currentParentId);

    if (!ancestor) {
      break;
    }

    path.unshift({
      nodeId: ancestor.id,
      label: ancestor.label,
      intentSummary: ancestor.intentSummary
    });
    currentParentId = ancestor.parentNodeId;
  }

  return path;
}

function validateAssistantOutput(input: {
  output: BrainstormAssistantOutput;
  selectedNodeId: string;
  config: AppConfig;
  transcriptText: string;
  defaultBranchCount: number;
}): void {
  if (input.output.targetNodeId !== input.selectedNodeId) {
    throw new ApiError(
      422,
      "AGENT_TARGET_MISMATCH",
      "Agent output target does not match selected node"
    );
  }

  if (input.output.branchCount > input.config.maxBranchCount) {
    throw new ApiError(
      422,
      "AGENT_BRANCH_COUNT_INVALID",
      "Agent output branch count exceeds configured maximum"
    );
  }

  if (
    !hasExplicitQuantity(input.transcriptText) &&
    input.output.branchCount !== input.defaultBranchCount
  ) {
    throw new ApiError(
      422,
      "BRANCH_COUNT_MISMATCH",
      "Branch count must match the default count when the user did not request a quantity"
    );
  }

  for (const [index, brief] of input.output.directionBriefs.entries()) {
    if (brief.suggestedFollowups.length !== 3) {
      throw new ApiError(
        422,
        "AGENT_SUGGESTED_FOLLOWUPS_INVALID",
        `Direction brief ${index + 1} must include exactly 3 suggested followups`
      );
    }
  }
}

function normalizeAssistantOutput(
  output: unknown,
  transcriptText: string,
  config: AppConfig,
  defaultBranchCount: number
): unknown {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }

  const normalized = {
    ...output
  } as Record<string, unknown> & {
    actionType?: unknown;
    directionBriefs?: unknown;
  };

  if (normalized.actionType === "refresh_layer") {
    normalized.actionType = "refresh";
  }

  if (
    normalized.actionType === "expand_branches" ||
    normalized.actionType === "branch_deeper"
  ) {
    normalized.actionType = "diverge";
  }

  if (
    Array.isArray(normalized.directionBriefs) &&
    normalized.directionBriefs.length > 0
  ) {
    const explicitRequestedCount = resolveExplicitBranchCount(transcriptText);
    const maxAllowedCount = config.maxBranchCount;
    const briefCount = Math.min(normalized.directionBriefs.length, maxAllowedCount);
    const expectedCount = explicitRequestedCount
      ? Math.min(explicitRequestedCount, maxAllowedCount)
      : Math.min(defaultBranchCount, maxAllowedCount);
    const finalCount = Math.min(briefCount, expectedCount);

    return {
      ...normalized,
      branchCount: finalCount,
      directionBriefs: normalized.directionBriefs.slice(0, finalCount)
    };
  }

  const branchCount = Math.min(defaultBranchCount, config.maxBranchCount);

  return {
    ...normalized,
    branchCount,
    directionBriefs: []
  };
}

function hasExplicitQuantity(transcriptText: string): boolean {
  return resolveExplicitBranchCount(transcriptText) !== null;
}

type TurnIntent = "diverge" | "refresh" | "delete" | "undo" | "redo";

function resolveTurnIntent(transcriptText: string): TurnIntent {
  if (/撤回|撤销/.test(transcriptText)) {
    return "undo";
  }

  if (/重做|恢复上一轮/.test(transcriptText)) {
    return "redo";
  }

  if (/删除|删掉|去掉/.test(transcriptText)) {
    return "delete";
  }

  if (/刷新|重来|换一版|替换/.test(transcriptText)) {
    return "refresh";
  }

  return "diverge";
}

function resolveChatType(
  transcriptText: string
): ChatAssistantInput["chatType"] | null {
  if (!/不要生成|不用生成|先别生成|不改变画布|不改画布|只聊|先聊/.test(transcriptText)) {
    return null;
  }

  if (/节点|这个方向|当前方向|这条/.test(transcriptText)) {
    return "explain_node";
  }

  if (/画布|整体|全局|现在有什么|当前有什么|树/.test(transcriptText)) {
    return "explain_canvas";
  }

  return "casual";
}

function resolveExplicitBranchCount(transcriptText: string): number | null {
  const arabicMatch = transcriptText.match(/([0-9]+)\s*(个|种|条|组)/);

  if (arabicMatch) {
    return Number(arabicMatch[1]);
  }

  const chineseMatch = transcriptText.match(/([一二两三四五六七八九十])\s*(个|种|条|组)/);

  if (!chineseMatch) {
    return null;
  }

  const chineseNumberMap: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };

  return chineseNumberMap[chineseMatch[1]] ?? null;
}

async function persistGeneratedBranches(input: {
  services: AppServices;
  agentGateway: AgentGateway;
  config: AppConfig;
  session: Session;
  task: GenerationTask;
  targetNode: TreeNode | null;
  treeNodes: TreeNode[];
  conversationHistory: BrainstormAssistantInput["conversationHistory"];
  actionType: BrainstormAssistantOutput["actionType"];
  briefs: VisualDirectionBrief[];
  runtimeApiKeys?: RuntimeApiKeys;
}): Promise<GenerationTask> {
  const generatingTask = await input.services.repositories.generationTasks.updateStatus({
    taskId: input.task.id,
    status: "generating"
  });

  if (!generatingTask) {
    throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
  }

  const isRefresh = input.actionType === "refresh";
  const parentNodeId = input.targetNode?.id ?? null;
  const depth = input.targetNode ? input.targetNode.depth + 1 : 0;
  const existingChildren = input.treeNodes.filter(
    (node) => node.parentNodeId === parentNodeId
  );
  const latestChildGroupNodes = isRefresh
    ? resolveLatestChildGroupNodes(existingChildren)
    : [];
  const supersededNodeIds = latestChildGroupNodes.map((node) => node.id);
  const currentLayerVersion = Math.max(
    0,
    ...existingChildren.map((node) => node.layerVersion)
  );
  const nextLayerVersion = isRefresh ? currentLayerVersion + 1 : 1;
  const firstPublicNodeNumber = input.session.nextPublicNodeNumber;
  const childGroupId = randomUUID();
  const baseLayerOrdinal = isRefresh
    ? Math.min(...latestChildGroupNodes.map((node) => node.layerOrdinal))
    : existingChildren.length + 1;
  const branchResults = await Promise.all(
    input.briefs.map(async (brief, index) => {
      const branchTask =
        input.task.branchTasks[index] ??
        (await input.services.repositories.branchTasks.create({
          generationTaskId: input.task.id,
          branchIndex: index,
          brief,
          status: "generating",
          imageUrl: null,
          errorMessage: null
        }));

      await input.services.repositories.branchTasks.update({
        branchTaskId: branchTask.id,
        status: "generating"
      });

      if (!isImageGenerationEnabled(input.config)) {
        await input.services.repositories.branchTasks.update({
          branchTaskId: branchTask.id,
          status: "completed",
          imageUrl: null,
          errorMessage: null
        });

        return {
          branchTaskId: branchTask.id,
          brief,
          branchTaskStatus: "completed" as const,
          sketch: null
        };
      }

      try {
        const sketch = await input.agentGateway.generateSketch(
          {
            ...buildSketchInput({
            brief,
            depth,
            siblingBriefs: input.briefs,
            sessionGoal: input.session.goal,
            conversationHistory: input.conversationHistory,
            targetNode: input.targetNode,
            treeNodes: input.treeNodes
            }),
            runtimeApiKeys: input.runtimeApiKeys
          }
        );
        await input.services.repositories.branchTasks.update({
          branchTaskId: branchTask.id,
          status: "completed",
          imageUrl: sketch.imageUrl
        });

        return {
          branchTaskId: branchTask.id,
          brief,
          branchTaskStatus: "completed" as const,
          sketch
        };
      } catch (error) {
        await input.services.repositories.branchTasks.update({
          branchTaskId: branchTask.id,
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Sketch generation failed"
        });

        return {
          branchTaskId: branchTask.id,
          brief,
          branchTaskStatus: "failed" as const,
          sketch: null
        };
      }
    })
  );
  const successfulBranches = branchResults.filter(
    (branch): branch is typeof branch & { sketch: SketchGenerationOutput } =>
      branch.sketch !== null
  );

  const nodes = await input.services.repositories.treeNodes.createMany(
    branchResults.map(({ brief, sketch }, index) => ({
      sessionId: input.session.id,
      parentNodeId,
      createdFromTaskId: input.task.id,
      childGroupId,
      depth,
      layerOrdinal: baseLayerOrdinal + index,
      layerVersion: nextLayerVersion,
      publicNodeNumber: firstPublicNodeNumber + index,
      displayName: brief.displayName,
      label: brief.label,
      voiceAliases: [
        brief.displayName,
        `${firstPublicNodeNumber + index}号`,
        `第${baseLayerOrdinal + index}个方向`
      ],
      intentSummary: brief.intentSummary,
      formLanguage: brief.formLanguage,
      userNeedResponse: brief.userNeedResponse,
      inspirationHints: brief.inspirationHints,
      suggestedFollowups: brief.suggestedFollowups,
      imageUrl: sketch?.imageUrl ?? null,
      status: "ready"
    }))
  );

  for (const [index, branch] of branchResults.entries()) {
    await input.services.repositories.branchTasks.update({
      branchTaskId: branch.branchTaskId,
      status: branch.branchTaskStatus,
      imageUrl: branch.sketch?.imageUrl ?? null,
      persistedNodeId: nodes[index].id
    });
  }

  await input.services.repositories.treeOperations.create({
    sessionId: input.session.id,
    taskId: input.task.id,
    type: input.actionType,
    targetNodeId: input.task.targetNodeId,
    targetLayerVersion: nextLayerVersion,
    affectedChildGroupId: childGroupId,
    insertedNodeIds: nodes.map((node) => node.id),
    deletedNodeIds: [],
    supersededNodeIds,
    restoredNodeIds: [],
    undoOfOperationId: null,
    redoOfOperationId: null,
    payload: {
      branchCount: nodes.length
    }
  });

  const operation =
    await input.services.repositories.treeOperations.getLastUndoableBySessionId(
      input.session.id
    );

  if (operation && supersededNodeIds.length > 0) {
    await input.services.repositories.treeNodes.markSuperseded({
      nodeIds: supersededNodeIds,
      operationId: operation.id
    });
  }

  await input.services.repositories.sessions.updateAfterNodesCreated({
    sessionId: input.session.id,
    nextPublicNodeNumber: firstPublicNodeNumber + nodes.length,
    currentSelectedNodeId: input.task.targetNodeId,
    lastExecutedTargetNodeId: input.task.targetNodeId,
    lastMentionedNodeId: nodes.at(-1)?.id ?? null
  });

  const completedTask = await input.services.repositories.generationTasks.updateStatus({
    taskId: input.task.id,
    status: "completed"
  });

  if (!completedTask) {
    throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
  }

  return completedTask;
}

function isImageGenerationEnabled(config: AppConfig): boolean {
  return Boolean(config.siliconFlowImageModel?.trim());
}

function buildSketchInput(input: {
  brief: VisualDirectionBrief;
  depth: number;
  siblingBriefs: VisualDirectionBrief[];
  sessionGoal: string;
  conversationHistory: BrainstormAssistantInput["conversationHistory"];
  targetNode: TreeNode | null;
  treeNodes: TreeNode[];
}): SketchGenerationInput {
  const lineageSummary = [
    input.sessionGoal,
    ...buildAncestorPath(input.targetNode, input.treeNodes).map(
      (ancestor) => ancestor.intentSummary
    ),
    input.targetNode?.intentSummary
  ]
    .filter(Boolean)
    .join(" -> ");
  const siblingAxes = input.siblingBriefs
    .map((sibling) => `${sibling.displayName}:${sibling.variationAxis}`)
    .join(" | ");
  const recentConversationHistory = input.conversationHistory
    .map((item) => `${item.role === "user" ? "用户" : "助手"}(${item.kind})：${item.content}`)
    .join(" | ");

  return {
    brief: {
      ...input.brief,
      promptIntent: [
        input.brief.promptIntent,
        `主需求：${input.sessionGoal}`,
        lineageSummary ? `线路上下文：${lineageSummary}` : null,
        input.targetNode
          ? `当前延展节点：${input.targetNode.displayName} - ${input.targetNode.intentSummary}`
          : "当前延展节点：root 总需求",
        recentConversationHistory
          ? `最近对话历史：${recentConversationHistory}`
          : null,
        siblingAxes ? `同轮差异轴：${siblingAxes}` : null
      ]
        .filter(Boolean)
        .join("\n")
    },
    sessionStyle: {
      sketchTone: "loose",
      detailLevel: "early",
      productDomain: "industrial_design"
    },
    depthContext: {
      depth: input.depth,
      branchStage: input.depth === 0 ? "first_layer" : "deeper_layer"
    },
    siblingContext: input.siblingBriefs.map((sibling) => ({
      briefId: sibling.briefId,
      label: sibling.label,
      variationAxis: sibling.variationAxis,
      formLanguage: sibling.formLanguage
    }))
  };
}

function resolveLatestChildGroupNodes(nodes: TreeNode[]): TreeNode[] {
  const groups = new Map<string, TreeNode[]>();

  for (const node of nodes) {
    const groupId = node.childGroupId ?? `legacy-${node.layerVersion}`;
    const group = groups.get(groupId) ?? [];
    group.push(node);
    groups.set(groupId, group);
  }

  const latestGroup = [...groups.values()].sort((left, right) => {
    const leftTime = Math.max(...left.map((node) => Date.parse(node.createdAt)));
    const rightTime = Math.max(...right.map((node) => Date.parse(node.createdAt)));
    return rightTime - leftTime;
  })[0];

  return latestGroup ?? [];
}

async function executeDeleteOperation(input: {
  services: AppServices;
  session: Session;
  treeNodes: TreeNode[];
  targetNodeId: string;
}): Promise<TreeOperation> {
  if (input.targetNodeId === input.session.id) {
    throw new ApiError(409, "ROOT_DELETE_FORBIDDEN", "Root node cannot be deleted");
  }

  const targetNode = input.treeNodes.find((node) => node.id === input.targetNodeId);

  if (!targetNode) {
    throw new ApiError(404, "TARGET_NODE_NOT_FOUND", "Target node not found");
  }

  const deletedNodeIds = collectSubtreeNodeIds(input.treeNodes, targetNode.id);
  const operation = await input.services.repositories.treeOperations.create({
    sessionId: input.session.id,
    taskId: null,
    type: "delete",
    targetNodeId: targetNode.id,
    targetLayerVersion: targetNode.layerVersion,
    affectedChildGroupId: targetNode.childGroupId,
    insertedNodeIds: [],
    deletedNodeIds,
    supersededNodeIds: [],
    restoredNodeIds: [],
    undoOfOperationId: null,
    redoOfOperationId: null,
    payload: {
      deletedNodeCount: deletedNodeIds.length
    }
  });

  await input.services.repositories.treeNodes.markSuperseded({
    nodeIds: deletedNodeIds,
    operationId: operation.id
  });

  await input.services.repositories.sessions.updateAfterNodesCreated({
    sessionId: input.session.id,
    nextPublicNodeNumber: input.session.nextPublicNodeNumber,
    currentSelectedNodeId: targetNode.parentNodeId ?? input.session.id,
    lastExecutedTargetNodeId: targetNode.id,
    lastMentionedNodeId: targetNode.parentNodeId ?? null
  });

  await createAssistantSummaryMessage(
    input.services,
    input.session.id,
    null,
    buildDeleteOperationMessage(targetNode, deletedNodeIds.length)
  );

  return operation;
}

async function executeUndoSession(input: {
  services: AppServices;
  sessionId: string;
  operationId: string | null;
  taskId: string | null;
}): Promise<TreeOperation> {
  const session = await input.services.repositories.sessions.getById(input.sessionId);

  if (!session) {
    throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
  }

  const requestedOperation = input.operationId
    ? await input.services.repositories.treeOperations.getById(input.operationId)
    : input.taskId
      ? await input.services.repositories.treeOperations.getByTaskId(input.taskId)
      : null;
  const latestUndoableOperation =
    await input.services.repositories.treeOperations.getLastUndoableBySessionId(
      input.sessionId
    );
  const operation =
    requestedOperation?.sessionId === input.sessionId &&
    requestedOperation.type !== "undo" &&
    requestedOperation.type !== "redo" &&
    requestedOperation.id === latestUndoableOperation?.id
      ? requestedOperation
      : latestUndoableOperation;

  if (!operation) {
    throw new ApiError(
      409,
      "UNDO_NOT_AVAILABLE",
      "No tree operation is available to undo"
    );
  }

  if (operation.insertedNodeIds.length > 0) {
    await input.services.repositories.treeNodes.markSuperseded({
      nodeIds: operation.insertedNodeIds,
      operationId: operation.id
    });
  }

  const restoreNodeIds =
    operation.type === "delete"
      ? operation.deletedNodeIds
      : operation.supersededNodeIds;

  if (restoreNodeIds.length > 0) {
    await input.services.repositories.treeNodes.restore(restoreNodeIds);
  }

  const undoOperation = await input.services.repositories.treeOperations.create({
    sessionId: input.sessionId,
    taskId: null,
    type: "undo",
    targetNodeId: operation.targetNodeId,
    targetLayerVersion: operation.targetLayerVersion,
    affectedChildGroupId: operation.affectedChildGroupId,
    insertedNodeIds: [],
    deletedNodeIds: [],
    supersededNodeIds: operation.insertedNodeIds,
    restoredNodeIds: restoreNodeIds,
    undoOfOperationId: operation.id,
    redoOfOperationId: null,
    payload: {
      undoTargetOperationId: operation.id
    }
  });

  await input.services.repositories.sessions.updateAfterNodesCreated({
    sessionId: input.sessionId,
    nextPublicNodeNumber: session.nextPublicNodeNumber,
    currentSelectedNodeId: operation.targetNodeId,
    lastExecutedTargetNodeId: operation.targetNodeId
  });

  await createAssistantSummaryMessage(
    input.services,
    input.sessionId,
    null,
    buildUndoOperationMessage(operation)
  );

  return undoOperation;
}

async function executeRedoSession(input: {
  services: AppServices;
  sessionId: string;
}): Promise<TreeOperation> {
  const session = await input.services.repositories.sessions.getById(input.sessionId);

  if (!session) {
    throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
  }

  const latestOperation =
    await input.services.repositories.treeOperations.getLatestBySessionId(
      input.sessionId
    );

  if (!latestOperation || latestOperation.type !== "undo" || !latestOperation.undoOfOperationId) {
    throw new ApiError(
      409,
      "REDO_NOT_AVAILABLE",
      "No tree operation is available to redo"
    );
  }

  const targetOperation = await input.services.repositories.treeOperations.getById(
    latestOperation.undoOfOperationId
  );

  if (!targetOperation) {
    throw new ApiError(404, "TREE_OPERATION_NOT_FOUND", "Redo target not found");
  }

  if (targetOperation.type === "delete") {
    await input.services.repositories.treeNodes.markSuperseded({
      nodeIds: targetOperation.deletedNodeIds,
      operationId: latestOperation.id
    });
  } else {
    if (targetOperation.supersededNodeIds.length > 0) {
      await input.services.repositories.treeNodes.markSuperseded({
        nodeIds: targetOperation.supersededNodeIds,
        operationId: latestOperation.id
      });
    }

    if (targetOperation.insertedNodeIds.length > 0) {
      await input.services.repositories.treeNodes.restore(
        targetOperation.insertedNodeIds
      );
    }
  }

  const redoOperation = await input.services.repositories.treeOperations.create({
    sessionId: input.sessionId,
    taskId: null,
    type: "redo",
    targetNodeId: targetOperation.targetNodeId,
    targetLayerVersion: targetOperation.targetLayerVersion,
    affectedChildGroupId: targetOperation.affectedChildGroupId,
    insertedNodeIds: targetOperation.insertedNodeIds,
    deletedNodeIds: targetOperation.deletedNodeIds,
    supersededNodeIds: targetOperation.supersededNodeIds,
    restoredNodeIds: [],
    undoOfOperationId: null,
    redoOfOperationId: targetOperation.id,
    payload: {
      redoTargetOperationId: targetOperation.id
    }
  });

  await input.services.repositories.sessions.updateAfterNodesCreated({
    sessionId: input.sessionId,
    nextPublicNodeNumber: session.nextPublicNodeNumber,
    currentSelectedNodeId: targetOperation.targetNodeId,
    lastExecutedTargetNodeId: targetOperation.targetNodeId
  });

  await createAssistantSummaryMessage(
    input.services,
    input.sessionId,
    null,
    buildRedoOperationMessage(targetOperation)
  );

  return redoOperation;
}

async function createUserTranscriptMessage(
  services: AppServices,
  sessionId: string,
  taskId: string | null,
  content: string
): Promise<Message> {
  return services.repositories.messages.create({
    sessionId,
    taskId,
    role: "user",
    kind: "transcript",
    content
  });
}

async function createAssistantSummaryMessage(
  services: AppServices,
  sessionId: string,
  taskId: string | null,
  content: string
): Promise<Message> {
  return services.repositories.messages.create({
    sessionId,
    taskId,
    role: "assistant",
    kind: "summary",
    content
  });
}

function buildDeleteOperationMessage(targetNode: TreeNode, deletedNodeCount: number): string {
  const childNodeCount = Math.max(deletedNodeCount - 1, 0);
  return childNodeCount > 0
    ? `已删除节点${targetNode.publicNodeNumber}“${targetNode.displayName}”及其 ${childNodeCount} 个下级节点。`
    : `已删除节点${targetNode.publicNodeNumber}“${targetNode.displayName}”。`;
}

function buildUndoOperationMessage(operation: TreeOperation): string {
  if (operation.type === "delete") {
    return "已撤回上一次删除操作，相关节点已恢复。";
  }

  if (operation.type === "refresh") {
    return "已撤回上一次刷新操作，恢复到上一版方向分支。";
  }

  return "已撤回上一次发散操作，移除刚生成的方向分支。";
}

function buildRedoOperationMessage(operation: TreeOperation): string {
  if (operation.type === "delete") {
    return "已重做删除操作，相关节点再次移除。";
  }

  if (operation.type === "refresh") {
    return "已重做刷新操作，重新应用最新一版方向分支。";
  }

  return "已重做发散操作，重新应用刚才的方向分支。";
}

function collectSubtreeNodeIds(treeNodes: TreeNode[], targetNodeId: string): string[] {
  const byParent = new Map<string | null, TreeNode[]>();

  for (const node of treeNodes) {
    const siblings = byParent.get(node.parentNodeId) ?? [];
    siblings.push(node);
    byParent.set(node.parentNodeId, siblings);
  }

  const result: string[] = [];
  const queue = [targetNodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (!currentId) {
      continue;
    }

    result.push(currentId);
    const children = byParent.get(currentId) ?? [];
    for (const child of children) {
      queue.push(child.id);
    }
  }

  return result;
}
