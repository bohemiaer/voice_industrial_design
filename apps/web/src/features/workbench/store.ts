import type {
  GenerationTask,
  Message,
  Session,
  TreeOperation
} from "@voice-industrial-design/shared";
import { create } from "zustand";

import {
  createWorkbenchSession,
  getGenerationTask,
  isSessionNotFoundError,
  loadWorkbenchSessionState,
  requestSessionRedo,
  requestSessionUndo,
  submitVoiceTurn as submitVoiceTurnToApi,
  transcribeVoiceRecording
} from "./api";
import { DEFAULT_ROOT_REQUIREMENT, DEFAULT_SESSION_TITLE } from "./copy";
import type {
  RecordingState,
  WorkbenchServerState,
  WorkbenchUiState
} from "./types";

type WorkbenchStore = {
  serverState: WorkbenchServerState;
  uiState: WorkbenchUiState;
  initializeApiSession: () => Promise<void>;
  startNewApiSession: () => Promise<void>;
  selectNode: (nodeId: string) => void;
  toggleSystemMessage: (messageId: string) => void;
  setRecordingState: (recordingState: RecordingState) => void;
  cycleRecordingState: () => void;
  transcribeAudioTurn: (audio: Blob) => Promise<{ transcriptText: string } | null>;
  submitVoiceTurn: (transcriptText: string, recovered?: boolean) => Promise<void>;
  submitAudioTurn: (audio: Blob, recovered?: boolean) => Promise<void>;
  requestUndo: () => Promise<void>;
  requestRedo: () => Promise<void>;
};

const initialTimestamp = "2026-06-14T00:00:00.000+08:00";
const initialServerState: WorkbenchServerState = {
  session: {
    id: "pending-api-session",
    ownerUserId: "pending-auth-user",
    title: DEFAULT_SESSION_TITLE,
    goal: DEFAULT_ROOT_REQUIREMENT,
    productDomain: "industrial_design",
    currentSelectedNodeId: null,
    lastExecutedTargetNodeId: null,
    pendingNodeId: null,
    lastMentionedNodeId: null,
    nextPublicNodeNumber: 1,
    createdAt: initialTimestamp,
    updatedAt: initialTimestamp
  },
  nodes: [],
  messages: [],
  generationTasks: [],
  treeOperations: []
};

const initialState = {
  serverState: initialServerState,
  uiState: {
    currentNodeId: "",
    apiSessionId: null,
    apiStatus: "idle" as const,
    apiError: null,
    expandedSystemMessageIds: [],
    recordingState: "idle" as const,
    liveTranscriptText: null,
    latestGeneratedNodeIds: [],
    lastActionSummary: "正在连接真实 API。",
    isThinking: false,
    canRedo: false
  }
};

function mergeTask(
  tasks: GenerationTask[],
  task: GenerationTask
): GenerationTask[] {
  const exists = tasks.some((candidate) => candidate.id === task.id);

  if (!exists) {
    return [...tasks, task];
  }

  return tasks.map((candidate) => (candidate.id === task.id ? task : candidate));
}

function findLastUndoableTreeOperation(
  operations: TreeOperation[]
): TreeOperation | null {
  const latestOperation = operations.at(-1);

  if (
    !latestOperation ||
    latestOperation.type === "undo" ||
    latestOperation.type === "redo"
  ) {
    return null;
  }

  return latestOperation;
}

function isUndoTranscript(transcriptText: string): boolean {
  const normalized = transcriptText.replace(/\s+/g, "");
  const undoCommands = [
    "撤回上一步",
    "撤销上一步",
    "撤回上一轮",
    "撤销上一轮",
    "撤回",
    "撤销"
  ];

  return undoCommands.includes(normalized);
}

function canRedoTreeOperation(operations: TreeOperation[]): boolean {
  const latestOperation = operations.at(-1);
  return Boolean(latestOperation?.type === "undo" && latestOperation.undoOfOperationId);
}

function createOptimisticUserMessage(
  sessionId: string,
  transcriptText: string
): Message {
  return {
    id: `optimistic-user-${Date.now()}`,
    sessionId,
    taskId: null,
    role: "user",
    kind: "transcript",
    content: transcriptText,
    createdAt: new Date().toISOString()
  };
}

function resolveTaskResolvedNodeId(input: {
  serverState: WorkbenchServerState;
  task: GenerationTask | null;
}): string | null {
  const taskResolvedNodeId = input.task?.targetNodeId;
  const visibleNodeIds = new Set([
    input.serverState.session.id,
    ...input.serverState.nodes.map((node) => node.id)
  ]);

  if (taskResolvedNodeId && visibleNodeIds.has(taskResolvedNodeId)) {
    return taskResolvedNodeId;
  }

  return null;
}

function resolveCurrentNodeId(input: {
  serverState: WorkbenchServerState;
  previous: WorkbenchUiState;
  task: GenerationTask | null;
}): string {
  const previousCurrentNodeId = input.previous.currentNodeId;
  const taskResolvedNodeId = resolveTaskResolvedNodeId({
    serverState: input.serverState,
    task: input.task
  });

  if (taskResolvedNodeId) {
    return taskResolvedNodeId;
  }

  if (previousCurrentNodeId === input.serverState.session.id) {
    return input.serverState.session.id;
  }

  if (
    previousCurrentNodeId &&
    input.serverState.nodes.some((node) => node.id === previousCurrentNodeId)
  ) {
    return previousCurrentNodeId;
  }

  return (
    input.serverState.session.currentSelectedNodeId ??
    input.serverState.nodes[0]?.id ??
    input.serverState.session.id
  );
}

function resolveActionSummary(input: {
  task: GenerationTask | null;
  operation: TreeOperation | null;
  previousSummary: string | null;
}): string | null {
  if (input.task?.status === "completed") {
    return input.task.actionType === "refresh"
      ? "已完成当前节点最近一组子节点的刷新。"
      : "已完成本轮设计发散。";
  }

  if (input.task?.status === "generating") {
    return "正在生成本轮方向草图。";
  }

  if (input.operation?.type === "delete") {
    return "已删除当前节点及其整棵子树。";
  }

  if (input.operation?.type === "undo") {
    return "已撤回上一轮树操作，画布恢复到上一状态。";
  }

  if (input.operation?.type === "redo") {
    return "已重做刚刚撤回的树操作。";
  }

  return input.previousSummary;
}

async function pollGenerationTask(
  taskId: string,
  attempts = 80,
  intervalMs = 500
): Promise<GenerationTask> {
  let latestTask = await getGenerationTask(taskId);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (latestTask.status === "completed" || latestTask.status === "failed") {
      return latestTask;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
    latestTask = await getGenerationTask(taskId);
  }

  return latestTask;
}

function resolveApiUiState(input: {
  previous: WorkbenchUiState;
  previousServerState: WorkbenchServerState;
  serverState: WorkbenchServerState;
  task: GenerationTask | null;
  operation: TreeOperation | null;
  apiSessionId: string;
  apiStatus?: WorkbenchUiState["apiStatus"];
  apiError?: string | null;
}): WorkbenchUiState {
  const currentNodeId = resolveCurrentNodeId({
    serverState: input.serverState,
    previous: input.previous,
    task: input.task
  });
  const latestGeneratedNodeIds = resolveLatestGeneratedNodeIds({
    previousNodes: input.previousServerState.nodes,
    nextNodes: input.serverState.nodes,
    task: input.task
  });

  return {
    ...input.previous,
    apiSessionId: input.apiSessionId,
    apiStatus: input.apiStatus ?? "ready",
    apiError: input.apiError ?? null,
    currentNodeId,
    recordingState: "idle",
    latestGeneratedNodeIds,
    isThinking: false,
    canRedo: canRedoTreeOperation(input.serverState.treeOperations),
    lastActionSummary: resolveActionSummary({
      task: input.task,
      operation: input.operation,
      previousSummary: input.previous.lastActionSummary
    })
  };
}

function resolveLatestGeneratedNodeIds(input: {
  previousNodes: WorkbenchServerState["nodes"];
  nextNodes: WorkbenchServerState["nodes"];
  task: GenerationTask | null;
}): string[] {
  if (input.task?.status !== "completed") {
    return [];
  }

  const previousNodeIds = new Set(input.previousNodes.map((node) => node.id));

  return input.nextNodes
    .filter((node) => !previousNodeIds.has(node.id))
    .map((node) => node.id);
}

function createFreshApiSessionState(
  previous: WorkbenchUiState,
  session: Session
): {
  serverState: WorkbenchServerState;
  uiState: WorkbenchUiState;
} {
  return {
    serverState: {
      session,
      nodes: [],
      messages: [],
      generationTasks: [],
      treeOperations: []
    },
    uiState: {
      ...previous,
      apiSessionId: session.id,
      apiStatus: "ready",
      apiError: null,
      currentNodeId: session.id,
      expandedSystemMessageIds: [],
      recordingState: "idle",
      liveTranscriptText: null,
      latestGeneratedNodeIds: [],
      lastActionSummary: "请用语音描述产品、功能、人群、关键需求和风格。",
      isThinking: false,
      canRedo: false
    }
  };
}

async function refreshApiState(input: {
  sessionId: string;
  generationTasks: GenerationTask[];
  treeOperations: TreeOperation[];
}): Promise<WorkbenchServerState> {
  return loadWorkbenchSessionState(
    input.sessionId,
    input.generationTasks,
    input.treeOperations
  );
}

async function recoverStaleApiSession(
  previous: WorkbenchUiState
): Promise<{
  serverState: WorkbenchServerState;
  uiState: WorkbenchUiState;
}> {
  const session = await createWorkbenchSession();
  const recovered = createFreshApiSessionState(previous, session);

  return {
    ...recovered,
    uiState: {
      ...recovered.uiState,
      lastActionSummary: "后端会话已重置，正在重新提交真实请求。"
    }
  };
}

export const useWorkbenchStore = create<WorkbenchStore>((set, get) => ({
  ...initialState,
  initializeApiSession: async () => {
    const current = get();

    if (current.uiState.apiStatus === "loading" || current.uiState.apiSessionId) {
      return;
    }

    set((state) => ({
      uiState: {
        ...state.uiState,
        apiStatus: "loading",
        apiError: null,
        recordingState: "processing",
        isThinking: false
      }
    }));

    try {
      const session = await createWorkbenchSession();

      set((state) => createFreshApiSessionState(state.uiState, session));
    } catch (error) {
      set((state) => ({
        uiState: {
          ...state.uiState,
          apiStatus: "error",
          apiError:
            error instanceof Error
              ? error.message
              : "真实 API 暂不可用，请检查后端、DeepSeek 和 SiliconFlow 配置。",
          recordingState: "idle",
          lastActionSummary: "真实 API 初始化失败。",
          isThinking: false
        }
      }));
    }
  },
  startNewApiSession: async () => {
    set((state) => ({
      uiState: {
        ...state.uiState,
        apiStatus: "loading",
        apiError: null,
        recordingState: "processing",
        lastActionSummary: "正在创建新的真实 API 测试会话。",
        isThinking: false
      }
    }));

    try {
      const session = await createWorkbenchSession();

      set((state) => createFreshApiSessionState(state.uiState, session));
    } catch (error) {
      set((state) => ({
        uiState: {
          ...state.uiState,
          apiStatus: "error",
          apiError:
            error instanceof Error
              ? error.message
              : "真实 API 暂不可用，请检查后端、DeepSeek 和 SiliconFlow 配置。",
          recordingState: "idle",
          lastActionSummary: "新的真实 API 测试会话创建失败。",
          isThinking: false
        }
      }));
    }
  },
  selectNode: (nodeId) => {
    set((state) => ({
      uiState: {
        ...state.uiState,
        currentNodeId: nodeId
      }
    }));
  },
  toggleSystemMessage: (messageId) => {
    set((state) => {
      const expanded = new Set(state.uiState.expandedSystemMessageIds);

      if (expanded.has(messageId)) {
        expanded.delete(messageId);
      } else {
        expanded.add(messageId);
      }

      return {
        uiState: {
          ...state.uiState,
          expandedSystemMessageIds: Array.from(expanded)
        }
      };
    });
  },
  setRecordingState: (recordingState) => {
    set((state) => ({
      uiState: {
        ...state.uiState,
        recordingState
      }
    }));
  },
  cycleRecordingState: () => {
    set((state) => {
      const nextState: Record<RecordingState, RecordingState> = {
        idle: "listening",
        listening: "processing",
        processing: "idle"
      };

      return {
        uiState: {
          ...state.uiState,
          recordingState: nextState[state.uiState.recordingState]
        }
      };
    });
  },
  transcribeAudioTurn: async (audio) => {
    set((current) => ({
      uiState: {
        ...current.uiState,
        recordingState: "processing",
        apiError: null,
        liveTranscriptText: null,
        lastActionSummary: "正在转文字。",
        isThinking: false
      }
    }));

    try {
      const transcript = await transcribeVoiceRecording(audio);

      if (transcript.transcriptText.trim().length === 0) {
        set((current) => ({
          uiState: {
            ...current.uiState,
            recordingState: "idle",
            apiError: "未识别到语音，请再试一次。",
            lastActionSummary: "这次没有识别到有效语音内容。",
            isThinking: false
          }
        }));
        return null;
      }

      set((current) => ({
        uiState: {
          ...current.uiState,
          liveTranscriptText: transcript.transcriptText,
          lastActionSummary: `已识别语音：${transcript.transcriptText}`,
          isThinking: false
        }
      }));

      return transcript;
    } catch (error) {
      set((current) => ({
        uiState: {
          ...current.uiState,
          apiStatus: "error",
          apiError:
            error instanceof Error ? error.message : "真实录音转文字失败。",
          recordingState: "idle",
          isThinking: false
        }
      }));
      return null;
    }
  },
  submitVoiceTurn: async (transcriptText, recovered = false) => {
    const state = get();
    const trimmed = transcriptText.trim();

    if (!state.uiState.apiSessionId) {
      state.setRecordingState("listening");
      return;
    }

    if (state.uiState.isThinking) {
      return;
    }

    if (isUndoTranscript(trimmed)) {
      await get().requestUndo();
      return;
    }

    const previousMessages = state.serverState.messages;
    const optimisticUserMessage = createOptimisticUserMessage(
      state.uiState.apiSessionId,
      trimmed
    );

    set((current) => ({
      serverState: {
        ...current.serverState,
        messages: [...current.serverState.messages, optimisticUserMessage]
      },
      uiState: {
        ...current.uiState,
        recordingState: "processing",
        apiError: null,
        liveTranscriptText: trimmed,
        lastActionSummary: "正在通过真实 API 处理语音意图。",
        isThinking: true
      }
    }));

    try {
      const submittedTurn = await submitVoiceTurnToApi({
        sessionId: state.uiState.apiSessionId,
        transcriptText: trimmed,
        targetNodeId:
          state.uiState.currentNodeId === state.serverState.session.id
            ? null
            : state.uiState.currentNodeId
      });
      const generationTask = submittedTurn.task
        ? await pollGenerationTask(submittedTurn.task.id)
        : null;
      const generationTasks = generationTask
        ? mergeTask(state.serverState.generationTasks, generationTask)
        : state.serverState.generationTasks;
      const treeOperations = submittedTurn.operation
        ? [...state.serverState.treeOperations, submittedTurn.operation]
        : state.serverState.treeOperations;
      const serverState = await refreshApiState({
        sessionId: state.uiState.apiSessionId,
        generationTasks,
        treeOperations
      });

      set((current) => ({
        serverState,
        uiState: resolveApiUiState({
          previous: current.uiState,
          previousServerState: state.serverState,
          serverState,
          task: generationTask,
          operation: submittedTurn.operation,
          apiSessionId: state.uiState.apiSessionId as string
        })
      }));
    } catch (error) {
      if (!recovered && isSessionNotFoundError(error)) {
        set((current) => ({
          serverState: {
            ...current.serverState,
            messages: previousMessages
          },
          uiState: {
            ...current.uiState,
            apiStatus: "loading",
            apiError: null,
            recordingState: "processing",
            lastActionSummary: "后端会话已重置，正在重新提交真实请求。",
            isThinking: true
          }
        }));

        try {
          const recoveredState = await recoverStaleApiSession(get().uiState);
          set(recoveredState);
          await get().submitVoiceTurn(transcriptText, true);
          return;
        } catch (recoveryError) {
          error = recoveryError;
        }
      }

      set((current) => ({
        serverState: {
          ...current.serverState,
          messages: previousMessages
        },
        uiState: {
          ...current.uiState,
          apiStatus: "error",
          apiError:
            error instanceof Error ? error.message : "语音意图提交失败。",
          recordingState: "idle",
          isThinking: false
        }
      }));
    }
  },
  submitAudioTurn: async (audio, recovered = false) => {
    const state = get();

    if (!state.uiState.apiSessionId) {
      state.setRecordingState("idle");
      return;
    }

    if (state.uiState.isThinking) {
      return;
    }

    try {
      const transcript = await get().transcribeAudioTurn(audio);

      if (!transcript) {
        return;
      }

      await get().submitVoiceTurn(transcript.transcriptText);
    } catch (error) {
      if (!recovered && isSessionNotFoundError(error)) {
        set((current) => ({
          uiState: {
            ...current.uiState,
            apiStatus: "loading",
            apiError: null,
            recordingState: "processing",
            lastActionSummary: "后端会话已重置，正在重新上传真实录音。",
            isThinking: false
          }
        }));

        try {
          const recoveredState = await recoverStaleApiSession(get().uiState);
          set(recoveredState);
          await get().submitAudioTurn(audio, true);
          return;
        } catch (recoveryError) {
          error = recoveryError;
        }
      }

      set((current) => ({
        uiState: {
          ...current.uiState,
          apiStatus: "error",
          apiError:
            error instanceof Error ? error.message : "真实录音上传失败。",
          recordingState: "idle",
          isThinking: false
        }
      }));
    }
  },
  requestUndo: async () => {
    const state = get();

    if (!state.uiState.apiSessionId || state.uiState.isThinking) {
      return;
    }

    set((current) => ({
      uiState: {
        ...current.uiState,
        apiError: null,
        recordingState: "processing",
        lastActionSummary: "正在撤回上一轮设计操作。",
        isThinking: true
      }
    }));

    try {
      const undoTarget = findLastUndoableTreeOperation(
        state.serverState.treeOperations
      );
      const operation = await requestSessionUndo(
        state.uiState.apiSessionId,
        undoTarget?.id ?? null,
        undoTarget?.taskId ?? null
      );
      const treeOperations = [...state.serverState.treeOperations, operation];
      const serverState = await refreshApiState({
        sessionId: state.uiState.apiSessionId,
        generationTasks: state.serverState.generationTasks,
        treeOperations
      });

      set((current) => ({
        serverState,
        uiState: {
          ...current.uiState,
          apiStatus: "ready",
          currentNodeId:
            serverState.session.currentSelectedNodeId ?? serverState.session.id,
          latestGeneratedNodeIds: [],
          recordingState: "idle",
          lastActionSummary: "真实 API 已完成撤回，画布已恢复到上一轮状态。",
          isThinking: false,
          canRedo: canRedoTreeOperation(serverState.treeOperations)
        }
      }));
    } catch (error) {
      set((current) => ({
        uiState: {
          ...current.uiState,
          apiStatus: "error",
          apiError:
            error instanceof Error ? error.message : "撤销请求失败。",
          recordingState: "idle",
          isThinking: false
        }
      }));
    }
  },
  requestRedo: async () => {
    const state = get();

    if (!state.uiState.apiSessionId || state.uiState.isThinking || !state.uiState.canRedo) {
      return;
    }

    set((current) => ({
      uiState: {
        ...current.uiState,
        apiError: null,
        recordingState: "processing",
        lastActionSummary: "正在重做刚刚撤回的树操作。",
        isThinking: true
      }
    }));

    try {
      const operation = await requestSessionRedo(state.uiState.apiSessionId);
      const treeOperations = [...state.serverState.treeOperations, operation];
      const serverState = await refreshApiState({
        sessionId: state.uiState.apiSessionId,
        generationTasks: state.serverState.generationTasks,
        treeOperations
      });

      set((current) => ({
        serverState,
        uiState: {
          ...current.uiState,
          apiStatus: "ready",
          currentNodeId:
            serverState.session.currentSelectedNodeId ?? serverState.session.id,
          latestGeneratedNodeIds: [],
          recordingState: "idle",
          lastActionSummary: "真实 API 已完成重做，画布已切回目标状态。",
          isThinking: false,
          canRedo: canRedoTreeOperation(serverState.treeOperations)
        }
      }));
    } catch (error) {
      set((current) => ({
        uiState: {
          ...current.uiState,
          apiStatus: "error",
          apiError:
            error instanceof Error ? error.message : "重做请求失败。",
          recordingState: "idle",
          isThinking: false
        }
      }));
    }
  }
}));
