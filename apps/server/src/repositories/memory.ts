import { randomUUID } from "node:crypto";

import type { BranchTask, GenerationTask, Message, Session, TreeNode, TreeOperation } from "@voice-industrial-design/shared";

import type {
  AppServices,
  CreateGenerationTaskInput,
  CreateBranchTaskInput,
  CreateMessageInput,
  CreateSessionInput,
  CreateTreeNodeInput,
  CreateTreeOperationInput,
  ServerRepositories,
  UpdateBranchTaskInput,
  UpdateGenerationTaskStatusInput,
  UpdateSessionAfterNodesInput
} from "./types.js";

interface MemoryStore {
  sessions: Map<string, Session>;
  messages: Message[];
  treeNodes: TreeNode[];
  supersededNodeIds: Set<string>;
  generationTasks: Map<string, GenerationTask>;
  branchTasks: Map<string, BranchTask>;
  treeOperations: TreeOperation[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function createStore(): MemoryStore {
  return {
    sessions: new Map(),
    messages: [],
    treeNodes: [],
    supersededNodeIds: new Set(),
    generationTasks: new Map(),
    branchTasks: new Map(),
    treeOperations: []
  };
}

export function createMemoryServices(seedStore?: Partial<MemoryStore>): AppServices {
  const store: MemoryStore = {
    ...createStore(),
    ...seedStore,
    sessions: seedStore?.sessions ?? new Map(),
    messages: seedStore?.messages ?? [],
    treeNodes: seedStore?.treeNodes ?? [],
    supersededNodeIds: seedStore?.supersededNodeIds ?? new Set(),
    generationTasks: seedStore?.generationTasks ?? new Map(),
    branchTasks: seedStore?.branchTasks ?? new Map(),
    treeOperations: seedStore?.treeOperations ?? []
  };

  const repositories: ServerRepositories = {
    sessions: {
      async create(input: CreateSessionInput): Promise<Session> {
        const timestamp = nowIso();
        const session: Session = {
          id: randomUUID(),
          ownerUserId: input.ownerUserId,
          title: input.title,
          goal: input.goal,
          productDomain: "industrial_design",
          currentSelectedNodeId: null,
          lastExecutedTargetNodeId: null,
          pendingNodeId: null,
          lastMentionedNodeId: null,
          nextPublicNodeNumber: 1,
          createdAt: timestamp,
          updatedAt: timestamp
        };

        store.sessions.set(session.id, session);
        return session;
      },
      async getById(sessionId: string): Promise<Session | null> {
        return store.sessions.get(sessionId) ?? null;
      },
      async updateAfterNodesCreated(
        input: UpdateSessionAfterNodesInput
      ): Promise<Session | null> {
        const current = store.sessions.get(input.sessionId);

        if (!current) {
          return null;
        }

        const updated: Session = {
          ...current,
          goal: input.goal ?? current.goal,
          nextPublicNodeNumber: input.nextPublicNodeNumber,
          currentSelectedNodeId:
            input.currentSelectedNodeId ?? current.currentSelectedNodeId,
          lastExecutedTargetNodeId:
            input.lastExecutedTargetNodeId ?? current.lastExecutedTargetNodeId,
          lastMentionedNodeId:
            input.lastMentionedNodeId ?? current.lastMentionedNodeId,
          updatedAt: nowIso()
        };

        store.sessions.set(updated.id, updated);
        return updated;
      }
    },
    messages: {
      async create(input: CreateMessageInput): Promise<Message> {
        const message: Message = {
          id: randomUUID(),
          sessionId: input.sessionId,
          taskId: input.taskId,
          role: input.role,
          kind: input.kind,
          content: input.content,
          createdAt: nowIso()
        };

        store.messages.push(message);
        return message;
      },
      async listBySessionId(sessionId: string): Promise<Message[]> {
        return store.messages
          .filter((message) => message.sessionId === sessionId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      },
      async getLatestMemorySummary(sessionId: string): Promise<Message | null> {
        return (
          store.messages
            .filter(
              (message) =>
                message.sessionId === sessionId &&
                message.kind === "memory_summary"
            )
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ??
          null
        );
      }
    },
    treeNodes: {
      async listBySessionId(sessionId: string): Promise<TreeNode[]> {
        return store.treeNodes.filter(
          (node) =>
            node.sessionId === sessionId && !store.supersededNodeIds.has(node.id)
        );
      },
      async createMany(input: CreateTreeNodeInput[]): Promise<TreeNode[]> {
        const timestamp = nowIso();
        const nodes = input.map((nodeInput) => {
          const node: TreeNode = {
            id: randomUUID(),
            sessionId: nodeInput.sessionId,
            parentNodeId: nodeInput.parentNodeId,
            childGroupId: nodeInput.childGroupId,
            depth: nodeInput.depth,
            displayName: nodeInput.displayName,
            label: nodeInput.label,
            publicNodeNumber: nodeInput.publicNodeNumber,
            layerOrdinal: nodeInput.layerOrdinal,
            layerVersion: nodeInput.layerVersion,
            voiceAliases: nodeInput.voiceAliases,
            intentSummary: nodeInput.intentSummary,
            formLanguage: nodeInput.formLanguage,
            userNeedResponse: nodeInput.userNeedResponse,
            inspirationHints: nodeInput.inspirationHints,
            suggestedFollowups: nodeInput.suggestedFollowups,
            imageUrl: nodeInput.imageUrl,
            status: nodeInput.status,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          return node;
        });

        store.treeNodes.push(...nodes);
        return nodes;
      },
      async markSuperseded(input: {
        nodeIds: string[];
        operationId: string;
      }): Promise<void> {
        for (const nodeId of input.nodeIds) {
          store.supersededNodeIds.add(nodeId);
        }
      },
      async restore(nodeIds: string[]): Promise<void> {
        for (const nodeId of nodeIds) {
          store.supersededNodeIds.delete(nodeId);
        }
      }
    },
    generationTasks: {
      async create(input: CreateGenerationTaskInput): Promise<GenerationTask> {
        const timestamp = nowIso();
        const task: GenerationTask = {
          id: randomUUID(),
          sessionId: input.sessionId,
          actionType: input.actionType,
          targetNodeId: input.targetNodeId,
          status: "queued",
          branchCount: input.branchCount,
          transcriptText: input.transcriptText,
          designIntentSummary: input.designIntentSummary,
          branchTasks: [],
          createdAt: timestamp,
          updatedAt: timestamp
        };

        store.generationTasks.set(task.id, task);
        return task;
      },
      async getById(taskId: string): Promise<GenerationTask | null> {
        return store.generationTasks.get(taskId) ?? null;
      },
      async getRunningBySessionId(sessionId: string): Promise<GenerationTask | null> {
        return (
          [...store.generationTasks.values()]
            .reverse()
            .find(
              (task) =>
                task.sessionId === sessionId &&
                (task.status === "queued" ||
                  task.status === "transcribing" ||
                  task.status === "reasoning" ||
                  task.status === "generating")
            ) ?? null
        );
      },
      async updateStatus(
        input: UpdateGenerationTaskStatusInput
      ): Promise<GenerationTask | null> {
        const current = store.generationTasks.get(input.taskId);

        if (!current) {
          return null;
        }

        const updated: GenerationTask = {
          ...current,
          status: input.status,
          updatedAt: nowIso()
        };

        store.generationTasks.set(updated.id, updated);
        return updated;
      }
    },
    branchTasks: {
      async create(input: CreateBranchTaskInput): Promise<BranchTask> {
        const timestamp = nowIso();
        const branchTask: BranchTask = {
          id: randomUUID(),
          generationTaskId: input.generationTaskId,
          brief: input.brief,
          status: input.status,
          imageUrl: input.imageUrl,
          errorMessage: input.errorMessage,
          createdAt: timestamp,
          updatedAt: timestamp
        };

        store.branchTasks.set(branchTask.id, branchTask);
        const generationTask = store.generationTasks.get(input.generationTaskId);

        if (generationTask) {
          store.generationTasks.set(generationTask.id, {
            ...generationTask,
            branchTasks: [...generationTask.branchTasks, branchTask],
            updatedAt: timestamp
          });
        }

        return branchTask;
      },
      async update(input: UpdateBranchTaskInput): Promise<BranchTask | null> {
        const current = store.branchTasks.get(input.branchTaskId);

        if (!current) {
          return null;
        }

        const updated: BranchTask = {
          ...current,
          status: input.status,
          imageUrl: input.imageUrl ?? current.imageUrl,
          errorMessage: input.errorMessage ?? current.errorMessage,
          updatedAt: nowIso()
        };

        store.branchTasks.set(updated.id, updated);
        const generationTask = store.generationTasks.get(updated.generationTaskId);

        if (generationTask) {
          store.generationTasks.set(generationTask.id, {
            ...generationTask,
            branchTasks: generationTask.branchTasks.map((branchTask) =>
              branchTask.id === updated.id ? updated : branchTask
            ),
            updatedAt: updated.updatedAt
          });
        }

        return updated;
      }
    },
    treeOperations: {
      async create(input: CreateTreeOperationInput): Promise<TreeOperation> {
        const operation: TreeOperation = {
          id: randomUUID(),
          sessionId: input.sessionId,
          taskId: input.taskId,
          type: input.type,
          targetNodeId: input.targetNodeId,
          targetLayerVersion: input.targetLayerVersion,
          affectedChildGroupId: input.affectedChildGroupId,
          insertedNodeIds: input.insertedNodeIds,
          deletedNodeIds: input.deletedNodeIds,
          supersededNodeIds: input.supersededNodeIds,
          restoredNodeIds: input.restoredNodeIds,
          undoOfOperationId: input.undoOfOperationId,
          redoOfOperationId: input.redoOfOperationId,
          payload: input.payload,
          createdAt: nowIso()
        };

        store.treeOperations.push(operation);
        return operation;
      },
      async getById(operationId: string): Promise<TreeOperation | null> {
        return (
          store.treeOperations.find((operation) => operation.id === operationId) ?? null
        );
      },
      async getByTaskId(taskId: string): Promise<TreeOperation | null> {
        return (
          [...store.treeOperations]
            .reverse()
            .find((operation) => operation.taskId === taskId) ?? null
        );
      },
      async getLastUndoableBySessionId(
        sessionId: string
      ): Promise<TreeOperation | null> {
        const latestOperation = [...store.treeOperations]
          .reverse()
          .find((operation) => operation.sessionId === sessionId);

        if (!latestOperation || latestOperation.type === "undo") {
          return null;
        }

        return latestOperation;
      },
      async getLatestBySessionId(sessionId: string): Promise<TreeOperation | null> {
        return (
          [...store.treeOperations]
            .reverse()
            .find((operation) => operation.sessionId === sessionId) ?? null
        );
      }
    }
  };

  return {
    repositories,
    persistenceMode: "memory"
  };
}
