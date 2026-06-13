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
  UpdateSessionAfterNodesInput,
  UpdateTaskConfirmationInput
} from "./types.js";
import { resolveTaskStateAfterConfirmation } from "./types.js";

interface MemoryStore {
  sessions: Map<string, Session>;
  messages: Message[];
  treeNodes: TreeNode[];
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
          title: input.title,
          goal: input.goal,
          productDomain: "industrial_design",
          activeNodeId: null,
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
          nextPublicNodeNumber: input.nextPublicNodeNumber,
          activeNodeId: input.activeNodeId ?? current.activeNodeId,
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
      }
    },
    treeNodes: {
      async listBySessionId(sessionId: string): Promise<TreeNode[]> {
        return store.treeNodes.filter((node) => node.sessionId === sessionId);
      },
      async createMany(input: CreateTreeNodeInput[]): Promise<TreeNode[]> {
        const timestamp = nowIso();
        const nodes = input.map((nodeInput) => {
          const node: TreeNode = {
            id: randomUUID(),
            sessionId: nodeInput.sessionId,
            parentNodeId: nodeInput.parentNodeId,
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
            imageUrl: nodeInput.imageUrl,
            status: nodeInput.status,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          return node;
        });

        store.treeNodes.push(...nodes);
        return nodes;
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
          status: input.confirmationRequired ? "awaiting_confirmation" : "queued",
          confirmationRequired: input.confirmationRequired,
          confirmationStatus: input.confirmationRequired
            ? "awaiting_confirmation"
            : "not_required",
          rewrittenIntentForConfirmation: input.rewrittenIntentForConfirmation,
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
      },
      async updateConfirmation(
        input: UpdateTaskConfirmationInput
      ): Promise<GenerationTask | null> {
        const current = store.generationTasks.get(input.taskId);

        if (!current) {
          return null;
        }

        const nextState = resolveTaskStateAfterConfirmation(input.decision);
        const updated: GenerationTask = {
          ...current,
          status: nextState.status,
          confirmationStatus: nextState.confirmationStatus,
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
          supersededNodeIds: input.supersededNodeIds,
          restoredNodeIds: input.restoredNodeIds,
          createdAt: nowIso()
        };

        store.treeOperations.push(operation);
        return operation;
      },
      async getLastUndoableBySessionId(
        sessionId: string
      ): Promise<TreeOperation | null> {
        const operations = store.treeOperations.filter(
          (operation) => operation.sessionId === sessionId && operation.type !== "undo"
        );
        return operations.at(-1) ?? null;
      }
    }
  };

  return {
    repositories,
    persistenceMode: "memory"
  };
}
