import type {
  GenerationTask,
  Message,
  Session,
  TreeOperation
} from "@voice-industrial-design/shared";
import { create } from "zustand";

import {
  cancelGenerationTask,
  confirmGenerationTask,
  createWorkbenchSession,
  isApiConnectionInterruptedError,
  isSessionNotFoundError,
  loadWorkbenchMessages,
  loadWorkbenchSessionState,
  loadWorkbenchTree,
  requestSessionUndo,
  submitVoiceRecording,
  submitVoiceTurn as submitVoiceTurnToApi,
  transcribeVoiceRecording
} from "./api";
import type {
  PendingAction,
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
  confirmPendingAction: (confirmationText?: string) => Promise<void>;
  cancelPendingAction: () => Promise<void>;
  requestUndo: () => Promise<void>;
};

const initialTimestamp = "2026-06-14T00:00:00.000+08:00";
const initialServerState: WorkbenchServerState = {
  session: {
    id: "pending-api-session",
    title: "AI 语音工业设计脑暴",
    goal: "围绕桌面智能设备生成早期工业设计方向",
    productDomain: "industrial_design",
    activeNodeId: null,
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
    selectedNodeId: "",
    apiSessionId: null,
    apiStatus: "idle" as const,
    apiError: null,
    expandedSystemMessageIds: [],
    recordingState: "idle" as const,
    liveTranscriptText: null,
    currentTargetNodeId: null,
    pendingAction: null,
    lastActionSummary: "正在连接真实 API。",
    isThinking: false
  }
};

function derivePendingAction(task: GenerationTask | null): PendingAction | null {
  if (!task || task.status !== "awaiting_confirmation") {
    return null;
  }

  const actionTitle: Record<GenerationTask["actionType"], string> = {
    expand_branches: "确认生成新方向",
    refresh_layer: "确认刷新当前层",
    branch_deeper: "确认继续下钻"
  };

  return {
    kind: "task_confirmation",
    taskId: task.id,
    title: actionTitle[task.actionType],
    description:
      task.rewrittenIntentForConfirmation ??
      `确认后将执行 ${task.actionType}，生成 ${task.branchCount} 个方向。`,
    confirmLabel: "确认执行",
    cancelLabel: "取消"
  };
}

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

function createThinkingMessage(sessionId: string): Message {
  return {
    id: `optimistic-thinking-${Date.now()}`,
    sessionId,
    taskId: null,
    role: "assistant",
    kind: "status",
    content: "思考中...",
    createdAt: new Date().toISOString()
  };
}

function isConfirmationText(transcriptText: string): boolean {
  return transcriptText.replace(/[。！!？?,，、\s"'“”‘’]+/g, "") === "确认";
}

function resolveSelectedNodeId(
  serverState: WorkbenchServerState,
  previousSelectedNodeId: string | null
): string {
  if (previousSelectedNodeId === serverState.session.id) {
    return serverState.session.id;
  }

  if (
    previousSelectedNodeId &&
    serverState.nodes.some((node) => node.id === previousSelectedNodeId)
  ) {
    return previousSelectedNodeId;
  }

  return (
    serverState.session.activeNodeId ??
    serverState.nodes[0]?.id ??
    serverState.session.id
  );
}

function resolveApiUiState(input: {
  previous: WorkbenchUiState;
  serverState: WorkbenchServerState;
  task: GenerationTask | null;
  apiSessionId: string;
  apiStatus?: WorkbenchUiState["apiStatus"];
  apiError?: string | null;
}): WorkbenchUiState {
  const selectedNodeId = resolveSelectedNodeId(
    input.serverState,
    input.previous.selectedNodeId
  );
  const resolvedTargetNodeId = input.task?.targetNodeId ?? selectedNodeId;

  return {
    ...input.previous,
    apiSessionId: input.apiSessionId,
    apiStatus: input.apiStatus ?? "ready",
    apiError: input.apiError ?? null,
    selectedNodeId: resolvedTargetNodeId,
    currentTargetNodeId: input.task?.targetNodeId ?? selectedNodeId,
    pendingAction: derivePendingAction(input.task),
    recordingState: "idle",
    isThinking: false,
    lastActionSummary:
      input.task?.status === "completed"
        ? "已确认并完成本轮设计扩展。"
        : input.task?.status === "awaiting_confirmation"
          ? "已整理需求，等待你确认后再更新画布。"
        : input.previous.lastActionSummary
  };
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
      selectedNodeId: session.id,
      currentTargetNodeId: session.id,
      pendingAction: null,
      expandedSystemMessageIds: [],
      recordingState: "idle",
      liveTranscriptText: null,
      lastActionSummary: "请用语音描述产品、功能、人群、关键需求和风格。",
      isThinking: false
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

async function refreshMessagesOnly(input: {
  current: WorkbenchServerState;
  sessionId: string;
}): Promise<WorkbenchServerState> {
  const messages = await loadWorkbenchMessages(input.sessionId);

  return {
    session: input.current.session,
    nodes: input.current.nodes,
    messages: messages.messages,
    generationTasks: input.current.generationTasks,
    treeOperations: input.current.treeOperations
  };
}

async function refreshTreeOnly(input: {
  current: WorkbenchServerState;
  sessionId: string;
}): Promise<WorkbenchServerState> {
  const tree = await loadWorkbenchTree(input.sessionId);

  return {
    session: tree.session,
    nodes: tree.nodes,
    messages: input.current.messages,
    generationTasks: input.current.generationTasks,
    treeOperations: input.current.treeOperations
  };
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
              : "真实 API 暂不可用，请检查后端和硅基配置。",
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
        pendingAction: null,
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
              : "真实 API 暂不可用，请检查后端和硅基配置。",
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
        selectedNodeId: nodeId,
        currentTargetNodeId: nodeId
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

    if (
      isConfirmationText(trimmed) &&
      state.uiState.pendingAction?.kind === "task_confirmation"
    ) {
      await state.confirmPendingAction(trimmed);
      return;
    }

    if (!state.uiState.apiSessionId) {
      state.setRecordingState("listening");
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
      const task = await submitVoiceTurnToApi({
        sessionId: state.uiState.apiSessionId,
        transcriptText: trimmed,
        targetNodeId:
          state.uiState.currentTargetNodeId === state.serverState.session.id
            ? null
            : state.uiState.currentTargetNodeId
      });
      const generationTasks = mergeTask(state.serverState.generationTasks, task);
      const serverState =
        task.status === "awaiting_confirmation"
          ? await refreshMessagesOnly({
              current: {
                ...state.serverState,
                generationTasks
              },
              sessionId: state.uiState.apiSessionId
            })
          : await refreshApiState({
              sessionId: state.uiState.apiSessionId,
              generationTasks,
              treeOperations: state.serverState.treeOperations
            });

      set((current) => ({
        serverState,
        uiState: resolveApiUiState({
          previous: current.uiState,
          serverState,
          task,
          apiSessionId: state.uiState.apiSessionId as string
        })
      }));
    } catch (error) {
      if (
        !recovered &&
        (isSessionNotFoundError(error) || isApiConnectionInterruptedError(error))
      ) {
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

    try {
      const transcript = await get().transcribeAudioTurn(audio);

      if (!transcript) {
        return;
      }

      await get().submitVoiceTurn(transcript.transcriptText);
    } catch (error) {
      if (
        !recovered &&
        (isSessionNotFoundError(error) || isApiConnectionInterruptedError(error))
      ) {
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
  confirmPendingAction: async (confirmationText = "确认") => {
    const state = get();
    const pending = state.uiState.pendingAction;

    if (!pending) {
      return;
    }

    if (pending.kind === "task_confirmation") {
      const pendingTask = state.serverState.generationTasks.find(
        (task) => task.id === pending.taskId
      );
      const previousGoal = state.serverState.session.goal;
      const optimisticUserMessage =
        state.uiState.apiSessionId
          ? createOptimisticUserMessage(state.uiState.apiSessionId, confirmationText)
          : null;

      set((current) => ({
        serverState: {
          ...(pendingTask
            ? {
                ...current.serverState,
                session: {
                  ...current.serverState.session,
                  goal: pendingTask.designIntentSummary
                }
              }
            : current.serverState),
          messages: optimisticUserMessage
            ? [...current.serverState.messages, optimisticUserMessage]
            : current.serverState.messages
        },
        uiState: {
          ...current.uiState,
          recordingState: "processing",
          apiError: null,
          isThinking: false
        }
      }));

      try {
        const task = await confirmGenerationTask(pending.taskId);
        const generationTasks = mergeTask(state.serverState.generationTasks, task);
        const serverState = await refreshTreeOnly({
          current: {
            ...state.serverState,
            session: pendingTask
              ? {
                  ...state.serverState.session,
                  goal: pendingTask.designIntentSummary
                }
              : state.serverState.session,
            messages: optimisticUserMessage
              ? [...state.serverState.messages, optimisticUserMessage]
              : state.serverState.messages,
            generationTasks
          },
          sessionId: state.uiState.apiSessionId as string
        });

        set((current) => ({
          serverState,
          uiState: {
            ...resolveApiUiState({
              previous: current.uiState,
              serverState,
              task,
              apiSessionId: state.uiState.apiSessionId as string
            }),
            pendingAction: null,
            lastActionSummary: "已确认需求，画布已按新意图更新。",
            isThinking: false
          }
        }));
      } catch (error) {
        set((current) => ({
          serverState: pendingTask
            ? {
                ...current.serverState,
                session: {
                  ...current.serverState.session,
                  goal: previousGoal
                }
              }
            : current.serverState,
          uiState: {
            ...current.uiState,
            apiStatus: "error",
            apiError:
              error instanceof Error ? error.message : "确认任务失败。",
            recordingState: "idle",
            isThinking: false
          }
        }));
      }
      return;
    }
  },
  cancelPendingAction: async () => {
    const state = get();
    const pending = state.uiState.pendingAction;

    if (!pending) {
      return;
    }

    if (pending.kind === "task_confirmation") {
      try {
        const task = await cancelGenerationTask(pending.taskId);
        const generationTasks = mergeTask(state.serverState.generationTasks, task);
        const serverState = await refreshApiState({
          sessionId: state.uiState.apiSessionId as string,
          generationTasks,
          treeOperations: state.serverState.treeOperations
        });

        set((current) => ({
          serverState,
          uiState: {
            ...resolveApiUiState({
              previous: current.uiState,
              serverState,
              task,
              apiSessionId: state.uiState.apiSessionId as string
            }),
            pendingAction: null,
            lastActionSummary: "已通过真实 API 取消本轮高风险操作。",
            isThinking: false
          }
        }));
      } catch (error) {
        set((current) => ({
          uiState: {
            ...current.uiState,
            apiStatus: "error",
            apiError:
              error instanceof Error ? error.message : "取消任务失败。"
          }
        }));
      }
      return;
    }

    set((current) => ({
      uiState: {
        ...current.uiState,
        pendingAction: null,
        lastActionSummary:
          pending.kind === "undo"
            ? "已保留当前树状态，未执行撤销。"
            : "已取消本轮高风险操作确认。",
        isThinking: false
      }
    }));
  },
  requestUndo: async () => {
    const state = get();

    if (!state.uiState.apiSessionId) {
      return;
    }

    try {
      const operation = await requestSessionUndo(state.uiState.apiSessionId);
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
          pendingAction: null,
          lastActionSummary: "真实 API 已记录撤销操作，树恢复逻辑仍在后端待补齐。",
          isThinking: false
        }
      }));
    } catch (error) {
      set((current) => ({
        uiState: {
          ...current.uiState,
          apiStatus: "error",
          apiError:
            error instanceof Error ? error.message : "撤销请求失败。"
        }
      }));
    }
  }
}));
