import type {
  GenerationTask,
  Message,
  Session,
  TreeNode,
  TreeOperation
} from "@voice-industrial-design/shared";

import type { WorkbenchServerState } from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

type CreateSessionResponse = {
  session: Session;
};

type TreeResponse = {
  session: Session;
  nodes: TreeNode[];
};

type MessagesResponse = {
  messages: Message[];
};

type TaskResponse = {
  task: GenerationTask;
};

type UndoResponse = {
  operation: TreeOperation;
};

async function requestJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body?.error?.message ?? `API request failed with ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body?.error?.message ?? `API request failed with ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function createWorkbenchSession(): Promise<Session> {
  const response = await requestJson<CreateSessionResponse>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      title: "AI 语音工业设计脑暴",
      goal: "围绕桌面智能设备生成早期工业设计方向"
    })
  });

  return response.session;
}

export async function loadWorkbenchSessionState(
  sessionId: string,
  generationTasks: GenerationTask[] = [],
  treeOperations: TreeOperation[] = []
): Promise<WorkbenchServerState> {
  const [tree, messages] = await Promise.all([
    requestJson<TreeResponse>(`/api/sessions/${sessionId}/tree`),
    requestJson<MessagesResponse>(`/api/sessions/${sessionId}/messages`)
  ]);

  return {
    session: tree.session,
    nodes: tree.nodes,
    messages: messages.messages,
    generationTasks,
    treeOperations
  };
}

export async function submitVoiceTurn(input: {
  sessionId: string;
  transcriptText: string;
  targetNodeId: string | null;
}): Promise<GenerationTask> {
  const response = await requestJson<TaskResponse>(
    `/api/sessions/${input.sessionId}/voice-turns`,
    {
      method: "POST",
      body: JSON.stringify({
        transcriptText: input.transcriptText,
        targetNodeId: input.targetNodeId
      })
    }
  );

  return response.task;
}

export async function submitVoiceRecording(input: {
  sessionId: string;
  audio: Blob;
  targetNodeId: string | null;
}): Promise<GenerationTask> {
  const formData = new FormData();
  formData.append("audio", input.audio, "recording.webm");

  if (input.targetNodeId) {
    formData.append("targetNodeId", input.targetNodeId);
  }

  const response = await requestForm<TaskResponse>(
    `/api/sessions/${input.sessionId}/voice-turns`,
    formData
  );

  return response.task;
}

export async function getGenerationTask(
  taskId: string
): Promise<GenerationTask> {
  const response = await requestJson<TaskResponse>(`/api/tasks/${taskId}`);
  return response.task;
}

export async function confirmGenerationTask(
  taskId: string
): Promise<GenerationTask> {
  const response = await requestJson<TaskResponse>(`/api/tasks/${taskId}/confirm`, {
    method: "POST",
    body: JSON.stringify({})
  });

  return response.task;
}

export async function cancelGenerationTask(
  taskId: string
): Promise<GenerationTask> {
  const response = await requestJson<TaskResponse>(`/api/tasks/${taskId}/cancel`, {
    method: "POST",
    body: JSON.stringify({})
  });

  return response.task;
}

export async function requestSessionUndo(
  sessionId: string
): Promise<TreeOperation> {
  const response = await requestJson<UndoResponse>(
    `/api/sessions/${sessionId}/undo`,
    {
      method: "POST",
      body: JSON.stringify({})
    }
  );

  return response.operation;
}
