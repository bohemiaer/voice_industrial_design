import type {
  GenerationTask,
  Message,
  Session,
  TreeNode,
  TreeOperation
} from "@voice-industrial-design/shared";

export type NodePalette = "teal" | "amber" | "blue" | "sand" | "mist" | "ghost";

export type RecordingState = "idle" | "listening" | "processing";

export type MessageDecoration = {
  summary?: string;
  details?: string;
  actionType?: GenerationTask["actionType"];
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
  apiSessionId: string | null;
  apiStatus: "idle" | "loading" | "ready" | "error";
  apiError: string | null;
  expandedSystemMessageIds: string[];
  recordingState: RecordingState;
  liveTranscriptText: string | null;
  currentTargetNodeId: string | null;
  pendingAction: PendingAction | null;
  lastActionSummary: string | null;
  isThinking: boolean;
};
