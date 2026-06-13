import type {
  BrainstormActionType,
  ConfirmationStatus,
  GenerationTask,
  Message,
  MessageKind,
  MessageRole,
  Session,
  TaskStatus,
  TreeNode,
  TreeOperation
} from "@voice-industrial-design/shared";

export interface CreateSessionInput {
  title: string;
  goal: string;
}

export interface CreateMessageInput {
  sessionId: string;
  taskId: string | null;
  role: MessageRole;
  kind: MessageKind;
  content: string;
}

export interface CreateGenerationTaskInput {
  sessionId: string;
  targetNodeId: string;
  actionType: BrainstormActionType;
  branchCount: number;
  transcriptText: string;
  designIntentSummary: string;
  assistantReply: string;
  confirmationRequired: boolean;
  rewrittenIntentForConfirmation: string | null;
}

export interface UpdateTaskConfirmationInput {
  taskId: string;
  decision: "confirm" | "cancel";
}

export interface CreateTreeOperationInput {
  sessionId: string;
  taskId: string | null;
  type: TreeOperation["type"];
  targetNodeId: string;
  targetLayerVersion: number | null;
  insertedNodeIds: string[];
  supersededNodeIds: string[];
  restoredNodeIds: string[];
  payload: Record<string, unknown>;
}

export interface ServerRepositories {
  sessions: {
    create(input: CreateSessionInput): Promise<Session>;
    getById(sessionId: string): Promise<Session | null>;
  };
  messages: {
    create(input: CreateMessageInput): Promise<Message>;
    listBySessionId(sessionId: string): Promise<Message[]>;
  };
  treeNodes: {
    listBySessionId(sessionId: string): Promise<TreeNode[]>;
  };
  generationTasks: {
    create(input: CreateGenerationTaskInput): Promise<GenerationTask>;
    getById(taskId: string): Promise<GenerationTask | null>;
    updateConfirmation(
      input: UpdateTaskConfirmationInput
    ): Promise<GenerationTask | null>;
  };
  treeOperations: {
    create(input: CreateTreeOperationInput): Promise<TreeOperation>;
    getLastUndoableBySessionId(sessionId: string): Promise<TreeOperation | null>;
  };
}

export interface AppServices {
  repositories: ServerRepositories;
  persistenceMode: "postgres" | "memory";
}

export function resolveTaskStateAfterConfirmation(
  decision: "confirm" | "cancel"
): {
  status: TaskStatus;
  confirmationStatus: ConfirmationStatus;
} {
  if (decision === "confirm") {
    return {
      status: "generating",
      confirmationStatus: "confirmed"
    };
  }

  return {
    status: "cancelled",
    confirmationStatus: "cancelled"
  };
}
