import type {
  BrainstormActionType,
  GenerationTask,
  Message,
  Session,
  TreeNode,
  TreeOperation
} from "@voice-industrial-design/shared";

export type NodePalette = "teal" | "amber" | "blue" | "sand" | "mist" | "ghost";

export type RecordingState = "idle" | "listening" | "processing";

export type WorkbenchDataMode = "api" | "fixture";

export type WorkbenchScenarioId =
  | "first-layer"
  | "branch-review"
  | "deeper-layer"
  | "refresh-layer"
  | "undo-review";

export type MessageDecoration = {
  summary?: string;
  details?: string;
  actionType?: BrainstormActionType;
  defaultOpen?: boolean;
};

export type PendingAction =
  | {
      kind: "task_confirmation";
      taskId: string;
      title: string;
      description: string;
      confirmLabel: string;
      cancelLabel: string;
    }
  | {
      kind: "undo";
      operationId: string;
      title: string;
      description: string;
      confirmLabel: string;
      cancelLabel: string;
    };

export type NodeUiMeta = {
  palette: NodePalette;
  prompts: string[];
  position: {
    x: number;
    y: number;
  };
};

export type WorkbenchServerState = {
  session: Session;
  nodes: TreeNode[];
  messages: Message[];
  generationTasks: GenerationTask[];
  treeOperations: TreeOperation[];
};

export type WorkbenchUiState = {
  selectedNodeId: string;
  activeScenarioId: WorkbenchScenarioId;
  dataMode: WorkbenchDataMode;
  apiSessionId: string | null;
  apiStatus: "idle" | "loading" | "ready" | "fallback" | "error";
  apiError: string | null;
  expandedSystemMessageIds: string[];
  recordingState: RecordingState;
  currentTargetNodeId: string | null;
  pendingAction: PendingAction | null;
  lastActionSummary: string | null;
};

export type WorkbenchFixture = {
  id: WorkbenchScenarioId;
  label: string;
  description: string;
  serverState: WorkbenchServerState;
  nodeUiMeta: Record<string, NodeUiMeta>;
  messageDecorations: Record<string, MessageDecoration>;
  uiDefaults: Omit<
    WorkbenchUiState,
    "activeScenarioId" | "dataMode" | "apiSessionId" | "apiStatus" | "apiError"
  >;
};
