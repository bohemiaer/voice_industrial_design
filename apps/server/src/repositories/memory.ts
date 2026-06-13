import { randomUUID } from "node:crypto";

import type { GenerationTask, Message, Session, TreeNode, TreeOperation } from "@voice-industrial-design/shared";

import type {
  AppServices,
  CreateGenerationTaskInput,
  CreateMessageInput,
  CreateSessionInput,
  CreateTreeOperationInput,
  ServerRepositories,
  UpdateTaskConfirmationInput
} from "./types.js";
import { resolveTaskStateAfterConfirmation } from "./types.js";

interface MemoryStore {
  sessions: Map<string, Session>;
  messages: Message[];
  treeNodes: TreeNode[];
  generationTasks: Map<string, GenerationTask>;
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
