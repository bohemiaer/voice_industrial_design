import type {
  BrainstormActionType,
  BranchTask,
  BranchTaskStatus,
  GenerationTask,
  Message,
  MessageKind,
  MessageRole,
  Session,
  TaskStatus,
  TreeNode,
  TreeNodeStatus,
  TreeOperation,
  VisualDirectionBrief
} from "@voice-industrial-design/shared";

export interface CreateSessionInput {
  ownerUserId: string;
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
}

export interface CreateTreeOperationInput {
  sessionId: string;
  taskId: string | null;
  type: TreeOperation["type"];
  targetNodeId: string;
  targetLayerVersion: number | null;
  affectedChildGroupId: string | null;
  insertedNodeIds: string[];
  deletedNodeIds: string[];
  supersededNodeIds: string[];
  restoredNodeIds: string[];
  undoOfOperationId: string | null;
  redoOfOperationId: string | null;
  payload: Record<string, unknown>;
}

export interface CreateTreeNodeInput {
  sessionId: string;
  parentNodeId: string | null;
  createdFromTaskId: string | null;
  childGroupId: string | null;
  depth: number;
  layerOrdinal: number;
  layerVersion: number;
  publicNodeNumber: number;
  displayName: string;
  label: string;
  voiceAliases: string[];
  intentSummary: string;
  formLanguage: string[];
  userNeedResponse: string[];
  inspirationHints: string[];
  suggestedFollowups: string[];
  imageUrl: string | null;
  status: TreeNodeStatus;
}

export interface CreateBranchTaskInput {
  generationTaskId: string;
  branchIndex: number;
  brief: VisualDirectionBrief;
  status: BranchTaskStatus;
  imageUrl: string | null;
  errorMessage: string | null;
}

export interface UpdateBranchTaskInput {
  branchTaskId: string;
  status: BranchTaskStatus;
  imageUrl?: string | null;
  persistedNodeId?: string | null;
  errorMessage?: string | null;
}

export interface UpdateGenerationTaskStatusInput {
  taskId: string;
  status: TaskStatus;
  errorMessage?: string | null;
}

export interface UpdateSessionAfterNodesInput {
  sessionId: string;
  nextPublicNodeNumber: number;
  goal?: string;
  currentSelectedNodeId?: string | null;
  lastExecutedTargetNodeId?: string | null;
  lastMentionedNodeId?: string | null;
}

export interface ServerRepositories {
  sessions: {
    create(input: CreateSessionInput): Promise<Session>;
    getById(sessionId: string): Promise<Session | null>;
    updateAfterNodesCreated(
      input: UpdateSessionAfterNodesInput
    ): Promise<Session | null>;
  };
  messages: {
    create(input: CreateMessageInput): Promise<Message>;
    listBySessionId(sessionId: string): Promise<Message[]>;
    getLatestMemorySummary(sessionId: string): Promise<Message | null>;
  };
  treeNodes: {
    listBySessionId(sessionId: string): Promise<TreeNode[]>;
    createMany(input: CreateTreeNodeInput[]): Promise<TreeNode[]>;
    markSuperseded(input: {
      nodeIds: string[];
      operationId: string;
    }): Promise<void>;
    restore(nodeIds: string[]): Promise<void>;
  };
  generationTasks: {
    create(input: CreateGenerationTaskInput): Promise<GenerationTask>;
    getById(taskId: string): Promise<GenerationTask | null>;
    getRunningBySessionId(sessionId: string): Promise<GenerationTask | null>;
    updateStatus(
      input: UpdateGenerationTaskStatusInput
    ): Promise<GenerationTask | null>;
  };
  branchTasks: {
    create(input: CreateBranchTaskInput): Promise<BranchTask>;
    update(input: UpdateBranchTaskInput): Promise<BranchTask | null>;
  };
  treeOperations: {
    create(input: CreateTreeOperationInput): Promise<TreeOperation>;
    getById(operationId: string): Promise<TreeOperation | null>;
    getByTaskId(taskId: string): Promise<TreeOperation | null>;
    getLatestBySessionId(sessionId: string): Promise<TreeOperation | null>;
    getLastUndoableBySessionId(sessionId: string): Promise<TreeOperation | null>;
  };
}

export interface AppServices {
  repositories: ServerRepositories;
  persistenceMode: "postgres" | "memory";
}

