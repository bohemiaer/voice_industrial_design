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
  transcriptText?: string;
  audio?: Buffer;
  mimeType?: string;
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
        transcriptText: input.transcriptText,
        audio: input.audio,
        mimeType: input.mimeType
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
        for (const [index, brief] of assistantOutput.directionBriefs.entries()) {
          await services.repositories.branchTasks.create({
            generationTaskId: task.id,
            branchIndex: index,
            brief,
            status: "queued",
            imageUrl: null,
            errorMessage: null
          });
        }

        return (await services.repositories.generationTasks.getById(task.id)) ?? task;
      }

      return persistGeneratedBranches({
        services,
        agentGateway,
        session,
        task,
        targetNode: targetContext.targetNode,
        treeNodes,
        actionType: assistantOutput.actionType,
        briefs: assistantOutput.directionBriefs
      });
    },

    async confirmTask(input: TaskDecisionInput): Promise<GenerationTask> {
      const pendingTask =
        await services.repositories.generationTasks.getById(input.taskId);

      if (!pendingTask) {
        throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
      }

      const task = await services.repositories.generationTasks.updateConfirmation({
        taskId: input.taskId,
        decision: "confirm"
      });

      if (!task) {
        throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
      }

      const session = await services.repositories.sessions.getById(task.sessionId);

      if (!session) {
        throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
      }

      const treeNodes = await services.repositories.treeNodes.listBySessionId(
        session.id
      );
      const targetNode =
        treeNodes.find((node) => node.id === task.targetNodeId) ?? null;

      if (task.targetNodeId !== session.id && !targetNode) {
        throw new ApiError(404, "TARGET_NODE_NOT_FOUND", "Target node not found");
      }

      return persistGeneratedBranches({
        services,
        agentGateway,
        session,
        task: {
          ...task,
          branchTasks: pendingTask.branchTasks
        },
        targetNode,
        treeNodes,
        actionType: task.actionType,
        briefs: pendingTask.branchTasks.map((branchTask) => branchTask.brief)
      });
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

async function persistGeneratedBranches(input: {
  services: AppServices;
  agentGateway: AgentGateway;
  session: Session;
  task: GenerationTask;
  targetNode: TreeNode | null;
  treeNodes: TreeNode[];
  actionType: BrainstormAssistantOutput["actionType"];
  briefs: VisualDirectionBrief[];
}): Promise<GenerationTask> {
  const isRefresh = input.actionType === "refresh_layer";
  const parentNodeId = isRefresh
    ? input.targetNode?.parentNodeId ?? null
    : input.targetNode?.id ?? null;
  const depth = isRefresh
    ? input.targetNode?.depth ?? 0
    : input.targetNode
      ? input.targetNode.depth + 1
      : 0;
  const existingSiblings = input.treeNodes.filter(
    (node) => node.parentNodeId === parentNodeId
  );
  const supersededNodeIds = isRefresh
    ? existingSiblings.map((node) => node.id)
    : [];
  const nextLayerVersion = isRefresh
    ? Math.max(0, ...existingSiblings.map((node) => node.layerVersion)) + 1
    : 1;
  const successfulBranches: Array<{
    branchTaskId: string;
    brief: VisualDirectionBrief;
    sketch: SketchGenerationOutput;
  }> = [];

  for (const [index, brief] of input.briefs.entries()) {
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

    try {
      const sketch = await input.agentGateway.generateSketch(
        buildSketchInput(brief, depth, input.briefs)
      );
      await input.services.repositories.branchTasks.update({
        branchTaskId: branchTask.id,
        status: "completed",
        imageUrl: sketch.imageUrl
      });
      successfulBranches.push({
        branchTaskId: branchTask.id,
        brief,
        sketch
      });
    } catch (error) {
      await input.services.repositories.branchTasks.update({
        branchTaskId: branchTask.id,
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Sketch generation failed"
      });
    }
  }

  if (successfulBranches.length === 0) {
    const failedTask = await input.services.repositories.generationTasks.updateStatus({
      taskId: input.task.id,
      status: "failed"
    });

    if (!failedTask) {
      throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
    }

    return failedTask;
  }

  const firstPublicNodeNumber = input.session.nextPublicNodeNumber;
  const nodes = await input.services.repositories.treeNodes.createMany(
    successfulBranches.map(({ brief, sketch }, index) => ({
      sessionId: input.session.id,
      parentNodeId,
      createdFromTaskId: input.task.id,
      depth,
      layerOrdinal: isRefresh ? index + 1 : existingSiblings.length + index + 1,
      layerVersion: nextLayerVersion,
      publicNodeNumber: firstPublicNodeNumber + index,
      displayName: brief.displayName,
      label: brief.label,
      voiceAliases: [
        brief.displayName,
        `${firstPublicNodeNumber + index}号`,
        `第${isRefresh ? index + 1 : existingSiblings.length + index + 1}个方向`
      ],
      intentSummary: brief.intentSummary,
      formLanguage: brief.formLanguage,
      userNeedResponse: brief.userNeedResponse,
      inspirationHints: brief.inspirationHints,
      imageUrl: sketch.imageUrl,
      status: "ready"
    }))
  );

  for (const [index, branch] of successfulBranches.entries()) {
    await input.services.repositories.branchTasks.update({
      branchTaskId: branch.branchTaskId,
      status: "completed",
      imageUrl: branch.sketch.imageUrl,
      persistedNodeId: nodes[index].id
    });
  }

  await input.services.repositories.treeOperations.create({
    sessionId: input.session.id,
    taskId: input.task.id,
    type: input.actionType,
    targetNodeId: input.task.targetNodeId,
    targetLayerVersion: nextLayerVersion,
    insertedNodeIds: nodes.map((node) => node.id),
    supersededNodeIds,
    restoredNodeIds: [],
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
