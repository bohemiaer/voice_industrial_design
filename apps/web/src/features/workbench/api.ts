import type {
  GenerationTask,
  Message,
  Session,
  TreeNode,
  TreeOperation
} from "@voice-industrial-design/shared";

import type { WorkbenchServerState } from "./types";

const DEFAULT_DEV_API_BASE_URL = "http://localhost:8787";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  (process.env.NODE_ENV === "development" ? DEFAULT_DEV_API_BASE_URL : "");

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

type TranscriptionResponse = {
  transcriptText: string;
};

class ApiClientError extends Error {
  status: number;
  code: string | null;

  constructor(input: { message: string; status: number; code: string | null }) {
    super(input.message);
    this.name = "ApiClientError";
    this.status = input.status;
    this.code = input.code;
  }
}

function createApiError(response: Response, body: unknown): ApiClientError {
  const errorBody =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: { code?: string; message?: string } }).error
      : null;

  return new ApiClientError({
    status: response.status,
    code: errorBody?.code ?? null,
    message: errorBody?.message ?? `API request failed with ${response.status}`
  });
}

export function isSessionNotFoundError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.status === 404 &&
    error.code === "SESSION_NOT_FOUND"
  );
}

export function isApiConnectionInterruptedError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.status >= 500 &&
    error.code === null
  );
}

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
    throw createApiError(response, body);
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
    throw createApiError(response, body);
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

export async function loadWorkbenchTree(
  sessionId: string
): Promise<TreeResponse> {
  return requestJson<TreeResponse>(`/api/sessions/${sessionId}/tree`);
}

export async function loadWorkbenchMessages(
  sessionId: string
): Promise<MessagesResponse> {
  return requestJson<MessagesResponse>(`/api/sessions/${sessionId}/messages`);
}

export async function loadWorkbenchSessionState(
  sessionId: string,
  generationTasks: GenerationTask[] = [],
  treeOperations: TreeOperation[] = []
): Promise<WorkbenchServerState> {
  const [tree, messages] = await Promise.all([
    loadWorkbenchTree(sessionId),
    loadWorkbenchMessages(sessionId)
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
  formData.append("audio", input.audio, "recording.wav");

  if (input.targetNodeId) {
    formData.append("targetNodeId", input.targetNodeId);
  }

  const response = await requestForm<TaskResponse>(
    `/api/sessions/${input.sessionId}/voice-turns`,
    formData
  );

  return response.task;
}

export async function transcribeVoiceRecording(
  audio: Blob
): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append("audio", audio, "recording.wav");

  return requestForm<TranscriptionResponse>("/api/transcriptions", formData);
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
