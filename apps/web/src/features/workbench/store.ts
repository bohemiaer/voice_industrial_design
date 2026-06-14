import type { GenerationTask, TreeOperation } from "@voice-industrial-design/shared";
import { create } from "zustand";

import {
  cancelGenerationTask,
  confirmGenerationTask,
  createWorkbenchSession,
  loadWorkbenchSessionState,
  requestSessionUndo,
  submitVoiceRecording,
  submitVoiceTurn as submitVoiceTurnToApi
} from "./api";
import { workbenchFixtureMap, workbenchFixtures } from "./fixtures";
import type {
  PendingAction,
  RecordingState,
  WorkbenchFixture,
  WorkbenchScenarioId,
  WorkbenchServerState,
  WorkbenchUiState
} from "./types";

type WorkbenchStore = {
  fixture: WorkbenchFixture;
  serverState: WorkbenchServerState;
  uiState: WorkbenchUiState;
  initializeApiSession: () => Promise<void>;
  setScenario: (scenarioId: WorkbenchScenarioId) => void;
  selectNode: (nodeId: string) => void;
  toggleSystemMessage: (messageId: string) => void;
  setRecordingState: (recordingState: RecordingState) => void;
  cycleRecordingState: () => void;
  submitVoiceTurn: (transcriptText: string) => Promise<void>;
  submitAudioTurn: (audio: Blob) => Promise<void>;
  confirmPendingAction: () => Promise<void>;
  cancelPendingAction: () => Promise<void>;
  requestUndo: () => Promise<void>;
};

const initialFixture = workbenchFixtureMap["branch-review"];
const initialTimestamp = "2026-06-14T00:00:00.000+08:00";

const applyFixture = (fixture: WorkbenchFixture) => ({
  fixture,
  serverState: fixture.serverState,
  uiState: {
    activeScenarioId: fixture.id,
    dataMode: "fixture" as const,
    apiSessionId: null,
    apiStatus: "fallback" as const,
    apiError: null,
    ...fixture.uiDefaults
  }
});

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
  fixture: initialFixture,
  serverState: initialServerState,
  uiState: {
    selectedNodeId: "",
    activeScenarioId: "first-layer" as const,
    dataMode: "api" as const,
    apiSessionId: null,
    apiStatus: "idle" as const,
    apiError: null,
    expandedSystemMessageIds: [],
    recordingState: "idle" as const,
    currentTargetNodeId: null,
    pendingAction: null,
    lastActionSummary: "正在连接真实 API。"
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

function resolveSelectedNodeId(
  serverState: WorkbenchServerState,
  previousSelectedNodeId: string | null
): string {
  if (
    previousSelectedNodeId &&
    serverState.nodes.some((node) => node.id === previousSelectedNodeId)
  ) {
    return previousSelectedNodeId;
  }

  return (
    serverState.session.activeNodeId ??
    serverState.session.lastMentionedNodeId ??
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

  return {
    ...input.previous,
    activeScenarioId: "first-layer",
    dataMode: "api",
    apiSessionId: input.apiSessionId,
    apiStatus: input.apiStatus ?? "ready",
    apiError: input.apiError ?? null,
    selectedNodeId,
    currentTargetNodeId:
      input.task?.targetNodeId ??
      input.serverState.session.lastMentionedNodeId ??
      selectedNodeId,
    pendingAction: derivePendingAction(input.task),
    recordingState: "idle",
    lastActionSummary:
      input.task?.status === "completed"
        ? "真实 API 已写入本轮语音脑暴结果。"
        : input.previous.lastActionSummary
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
        dataMode: "api",
        apiStatus: "loading",
        apiError: null,
        recordingState: "processing"
      }
    }));

    try {
      const session = await createWorkbenchSession();
      const task = await submitVoiceTurnToApi({
        sessionId: session.id,
        transcriptText: "围绕桌面智能设备生成四个差异化工业设计方向",
        targetNodeId: null
      });
      const generationTasks = [task];
      const serverState = await refreshApiState({
        sessionId: session.id,
        generationTasks,
        treeOperations: []
      });

      set((state) => ({
        serverState,
        uiState: resolveApiUiState({
          previous: state.uiState,
          serverState,
          task,
          apiSessionId: session.id
        })
      }));
    } catch (error) {
      set((state) => ({
        ...applyFixture(initialFixture),
        uiState: {
          ...applyFixture(initialFixture).uiState,
          apiStatus: "fallback",
          apiError:
            error instanceof Error
              ? error.message
              : "真实 API 暂不可用，已切回 demo fixture。"
        }
      }));
    }
  },
  setScenario: (scenarioId) => {
    set(applyFixture(workbenchFixtureMap[scenarioId]));
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
  submitVoiceTurn: async (transcriptText) => {
    const state = get();

    if (state.uiState.dataMode !== "api" || !state.uiState.apiSessionId) {
      state.setRecordingState("listening");
      return;
    }

    set((current) => ({
      uiState: {
        ...current.uiState,
        recordingState: "processing",
        apiError: null,
        lastActionSummary: "正在通过真实 API 处理语音意图。"
      }
    }));

    try {
      const task = await submitVoiceTurnToApi({
        sessionId: state.uiState.apiSessionId,
        transcriptText,
        targetNodeId:
          state.uiState.currentTargetNodeId === state.serverState.session.id
            ? null
            : state.uiState.currentTargetNodeId
      });
      const generationTasks = mergeTask(state.serverState.generationTasks, task);
      const serverState = await refreshApiState({
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
      set((current) => ({
        uiState: {
          ...current.uiState,
          apiStatus: "error",
          apiError:
            error instanceof Error ? error.message : "语音意图提交失败。",
          recordingState: "idle"
        }
      }));
    }
  },
  submitAudioTurn: async (audio) => {
    const state = get();

    if (state.uiState.dataMode !== "api" || !state.uiState.apiSessionId) {
      state.setRecordingState("idle");
      return;
    }

    set((current) => ({
      uiState: {
        ...current.uiState,
        recordingState: "processing",
        apiError: null,
        lastActionSummary: "正在上传真实录音并等待 ASR。"
      }
    }));

    try {
      const task = await submitVoiceRecording({
        sessionId: state.uiState.apiSessionId,
        audio,
        targetNodeId:
          state.uiState.currentTargetNodeId === state.serverState.session.id
            ? null
            : state.uiState.currentTargetNodeId
      });
      const generationTasks = mergeTask(state.serverState.generationTasks, task);
      const serverState = await refreshApiState({
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
      set((current) => ({
        uiState: {
          ...current.uiState,
          apiStatus: "error",
          apiError:
            error instanceof Error ? error.message : "真实录音上传失败。",
          recordingState: "idle"
        }
      }));
    }
  },
  confirmPendingAction: async () => {
    const state = get();
    const pending = state.uiState.pendingAction;

    if (!pending) {
      return;
    }

    if (state.uiState.dataMode === "api" && pending.kind === "task_confirmation") {
      set((current) => ({
        uiState: {
          ...current.uiState,
          recordingState: "processing",
          apiError: null
        }
      }));

      try {
        const task = await confirmGenerationTask(pending.taskId);
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
            lastActionSummary: "已通过真实 API 确认本轮高风险操作。"
          }
        }));
      } catch (error) {
        set((current) => ({
          uiState: {
            ...current.uiState,
            apiStatus: "error",
            apiError:
              error instanceof Error ? error.message : "确认任务失败。",
            recordingState: "idle"
          }
        }));
      }
      return;
    }

    if (pending.kind === "task_confirmation") {
      const nextFixture = workbenchFixtureMap["deeper-layer"];
      set({
        ...applyFixture(nextFixture),
        uiState: {
          ...applyFixture(nextFixture).uiState,
          lastActionSummary: "已确认下钻请求，正在生成 3 个子方向。"
        }
      });
      return;
    }

    const revertedFixture = workbenchFixtureMap["first-layer"];
    set({
      ...applyFixture(revertedFixture),
      uiState: {
        ...applyFixture(revertedFixture).uiState,
        lastActionSummary: "已撤销最近一次分支下钻，树已恢复到第一层 4 个方向。"
      }
    });
  },
  cancelPendingAction: async () => {
    const state = get();
    const pending = state.uiState.pendingAction;

    if (!pending) {
      return;
    }

    if (state.uiState.dataMode === "api" && pending.kind === "task_confirmation") {
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
            lastActionSummary: "已通过真实 API 取消本轮高风险操作。"
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
            : "已取消本轮高风险操作确认。"
      }
    }));
  },
  requestUndo: async () => {
    const state = get();

    if (state.uiState.dataMode !== "api" || !state.uiState.apiSessionId) {
      state.setScenario("undo-review");
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
          lastActionSummary: "真实 API 已记录撤销操作，树恢复逻辑仍在后端待补齐。"
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

export const workbenchScenarioOptions = workbenchFixtures.map((fixture) => ({
  id: fixture.id,
  label: fixture.label,
  description: fixture.description
}));
