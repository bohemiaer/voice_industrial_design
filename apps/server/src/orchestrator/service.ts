import {
  BrainstormAssistantOutputSchema,
  type BrainstormAssistantInput,
  type BrainstormAssistantOutput,
  type GenerationTask,
  type Session,
  type SketchGenerationInput,
  type SketchGenerationOutput,
  type TreeNode,
  type VisualDirectionBrief
} from "@voice-industrial-design/shared";

import type { AgentGateway } from "../agents/types.js";
import type { AppConfig } from "../config.js";
import { ApiError } from "../errors.js";
import type { AppServices } from "../repositories/types.js";

export interface ProcessVoiceTurnInput {
  sessionId: string;
  transcriptText: string;
  targetNodeId: string | null;
}

export interface TaskDecisionInput {
  taskId: string;
}

export interface Orchestrator {
  processVoiceTurn(input: ProcessVoiceTurnInput): Promise<GenerationTask>;
  confirmTask(input: TaskDecisionInput): Promise<GenerationTask>;
  cancelTask(input: TaskDecisionInput): Promise<GenerationTask>;
}

export function createOrchestrator(
  services: AppServices,
  config: AppConfig,
  agentGateway: AgentGateway
): Orchestrator {
  return {
    async processVoiceTurn(input: ProcessVoiceTurnInput): Promise<GenerationTask> {
      const session = await services.repositories.sessions.getById(input.sessionId);

      if (!session) {
        throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
      }

      const transcript = await agentGateway.transcribeAudio({
        transcriptText: input.transcriptText
      });
      const treeNodes = await services.repositories.treeNodes.listBySessionId(
        input.sessionId
      );
      const targetContext = resolveTargetContext(
        session,
        treeNodes,
        input.targetNodeId
      );
      const assistantInput = buildBrainstormInput({
        session,
        transcriptText: transcript.transcriptText,
        targetNode: targetContext.targetNode,
        selectedNodeId: targetContext.selectedNodeId,
        treeNodes,
        config
      });
      const assistantOutput = BrainstormAssistantOutputSchema.parse(
        await agentGateway.runBrainstormAssistant(assistantInput)
      );
      validateAssistantOutput(assistantOutput, targetContext.selectedNodeId, config);

      const task = await services.repositories.generationTasks.create({
        sessionId: session.id,
        targetNodeId: assistantOutput.targetNodeId,
        actionType: assistantOutput.actionType,
        branchCount: assistantOutput.branchCount,
        transcriptText: transcript.transcriptText,
        designIntentSummary: assistantOutput.designIntentSummary,
        assistantReply: assistantOutput.assistantReply,
        confirmationRequired: assistantOutput.confirmationRequired,
        rewrittenIntentForConfirmation:
          assistantOutput.rewrittenIntentForConfirmation ?? null
      });

      await services.repositories.messages.create({
        sessionId: session.id,
        taskId: task.id,
        role: "user",
        kind: "transcript",
        content: transcript.transcriptText
      });

      await services.repositories.messages.create({
        sessionId: session.id,
        taskId: task.id,
        role: "assistant",
        kind: assistantOutput.confirmationRequired ? "confirmation" : "summary",
        content:
          assistantOutput.rewrittenIntentForConfirmation ??
          assistantOutput.assistantReply
      });

      if (assistantOutput.confirmationRequired) {
        return task;
      }

      if (assistantOutput.actionType !== "expand_branches") {
        return task;
      }

      return persistExpandBranches({
        services,
        agentGateway,
        session,
        task,
        targetNode: targetContext.targetNode,
        treeNodes,
        assistantOutput
      });
    },

    async confirmTask(input: TaskDecisionInput): Promise<GenerationTask> {
      const task = await services.repositories.generationTasks.updateConfirmation({
        taskId: input.taskId,
        decision: "confirm"
      });

      if (!task) {
        throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
      }

      return task;
    },

    async cancelTask(input: TaskDecisionInput): Promise<GenerationTask> {
      const task = await services.repositories.generationTasks.updateConfirmation({
        taskId: input.taskId,
        decision: "cancel"
      });

      if (!task) {
        throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
      }

      return task;
    }
  };
}

function resolveTargetContext(
  session: Session,
  treeNodes: TreeNode[],
  requestedTargetNodeId: string | null
): { selectedNodeId: string; targetNode: TreeNode | null } {
  const selectedNodeId =
    requestedTargetNodeId ??
    session.activeNodeId ??
    session.lastMentionedNodeId ??
    session.id;
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

function buildBrainstormInput(input: {
  session: Session;
  transcriptText: string;
  selectedNodeId: string;
  targetNode: TreeNode | null;
  treeNodes: TreeNode[];
  config: AppConfig;
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
    ancestorPath: [],
    siblingSummaries,
    constraints: {
      minBranchCount: 3,
      maxBranchCount: input.config.maxBranchCount,
      productDomain: "industrial_design",
      sketchStage: "early",
      inputMode: "voice_only"
    }
  };
}

function validateAssistantOutput(
  output: BrainstormAssistantOutput,
  selectedNodeId: string,
  config: AppConfig
): void {
  if (output.targetNodeId !== selectedNodeId) {
    throw new ApiError(
      422,
      "AGENT_TARGET_MISMATCH",
      "Agent output target does not match selected node"
    );
  }

  if (output.branchCount > config.maxBranchCount) {
    throw new ApiError(
      422,
      "AGENT_BRANCH_COUNT_INVALID",
      "Agent output branch count exceeds configured maximum"
    );
  }
}

async function persistExpandBranches(input: {
  services: AppServices;
  agentGateway: AgentGateway;
  session: Session;
  task: GenerationTask;
  targetNode: TreeNode | null;
  treeNodes: TreeNode[];
  assistantOutput: BrainstormAssistantOutput;
}): Promise<GenerationTask> {
  const parentNodeId = input.targetNode?.id ?? null;
  const depth = input.targetNode ? input.targetNode.depth + 1 : 0;
  const existingSiblings = input.treeNodes.filter(
    (node) => node.parentNodeId === parentNodeId
  );
  const branchTasks = [];
  const generatedSketches: SketchGenerationOutput[] = [];

  for (const [index, brief] of input.assistantOutput.directionBriefs.entries()) {
    const branchTask = await input.services.repositories.branchTasks.create({
      generationTaskId: input.task.id,
      branchIndex: index,
      brief,
      status: "generating",
      imageUrl: null,
      errorMessage: null
    });
    const sketch = await input.agentGateway.generateSketch(
      buildSketchInput(brief, depth, input.assistantOutput.directionBriefs)
    );
    await input.services.repositories.branchTasks.update({
      branchTaskId: branchTask.id,
      status: "completed",
      imageUrl: sketch.imageUrl
    });
    branchTasks.push(branchTask);
    generatedSketches.push(sketch);
  }

  const firstPublicNodeNumber = input.session.nextPublicNodeNumber;
  const nodes = await input.services.repositories.treeNodes.createMany(
    input.assistantOutput.directionBriefs.map((brief, index) => ({
      sessionId: input.session.id,
      parentNodeId,
      createdFromTaskId: input.task.id,
      depth,
      layerOrdinal: existingSiblings.length + index + 1,
      layerVersion: 1,
      publicNodeNumber: firstPublicNodeNumber + index,
      displayName: brief.displayName,
      label: brief.label,
      voiceAliases: [
        brief.displayName,
        `${firstPublicNodeNumber + index}号`,
        `第${existingSiblings.length + index + 1}个方向`
      ],
      intentSummary: brief.intentSummary,
      formLanguage: brief.formLanguage,
      userNeedResponse: brief.userNeedResponse,
      inspirationHints: brief.inspirationHints,
      imageUrl: generatedSketches[index].imageUrl,
      status: "ready"
    }))
  );

  for (const [index, branchTask] of branchTasks.entries()) {
    await input.services.repositories.branchTasks.update({
      branchTaskId: branchTask.id,
      status: "completed",
      imageUrl: generatedSketches[index].imageUrl,
      persistedNodeId: nodes[index].id
    });
  }

  await input.services.repositories.treeOperations.create({
    sessionId: input.session.id,
    taskId: input.task.id,
    type: "expand_branches",
    targetNodeId: input.task.targetNodeId,
    targetLayerVersion: 1,
    insertedNodeIds: nodes.map((node) => node.id),
    supersededNodeIds: [],
    restoredNodeIds: [],
    payload: {
      branchCount: nodes.length
    }
  });

  await input.services.repositories.sessions.updateAfterNodesCreated({
    sessionId: input.session.id,
    nextPublicNodeNumber: firstPublicNodeNumber + nodes.length,
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

function buildSketchInput(
  brief: VisualDirectionBrief,
  depth: number,
  siblingBriefs: VisualDirectionBrief[]
): SketchGenerationInput {
  return {
    brief,
    sessionStyle: {
      sketchTone: "loose",
      detailLevel: "early",
      productDomain: "industrial_design"
    },
    depthContext: {
      depth,
      branchStage: depth === 0 ? "first_layer" : "deeper_layer"
    },
    siblingContext: siblingBriefs.map((sibling) => ({
      briefId: sibling.briefId,
      label: sibling.label,
      variationAxis: sibling.variationAxis,
      formLanguage: sibling.formLanguage
    }))
  };
}
