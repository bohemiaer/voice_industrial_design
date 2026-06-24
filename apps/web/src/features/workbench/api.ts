import type {
  GenerationTask,
  Message,
  Session,
  TreeNode,
  TreeOperation
} from "@voice-industrial-design/shared";

import type { WorkbenchServerState } from "./types";
import { DEFAULT_ROOT_REQUIREMENT, DEFAULT_SESSION_TITLE } from "./copy";

const DEFAULT_DEV_API_PORT = "8787";

function resolveApiBaseUrl(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(
    /\/$/,
    ""
  );

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (process.env.NODE_ENV !== "development") {
    return "";
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_DEV_API_PORT}`;
  }

  return `http://localhost:${DEFAULT_DEV_API_PORT}`;
}

const API_BASE_URL = resolveApiBaseUrl();

let accessTokenProvider: (() => Promise<string | null> | string | null) | null =
  null;

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

type VoiceTurnResponse = {
  task: GenerationTask | null;
  operation: TreeOperation | null;
};

type TreeOperationResponse = {
  operation: TreeOperation;
};

type TranscriptionResponse = {
  transcriptText: string;
};

export function setAccessTokenProvider(
  provider: (() => Promise<string | null> | string | null) | null
): void {
  accessTokenProvider = provider;
}

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

async function createAuthHeaders(): Promise<Record<string, string>> {
  const accessToken = accessTokenProvider
    ? await accessTokenProvider()
    : null;

  return accessToken
    ? {
        Authorization: `Bearer ${accessToken}`
      }
    : {};
}

async function requestJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const authHeaders = await createAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
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
  const authHeaders = await createAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders,
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
      title: DEFAULT_SESSION_TITLE,
      goal: DEFAULT_ROOT_REQUIREMENT
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
}): Promise<VoiceTurnResponse> {
  return requestJson<VoiceTurnResponse>(
    `/api/sessions/${input.sessionId}/voice-turns`,
    {
      method: "POST",
      body: JSON.stringify({
        transcriptText: input.transcriptText,
        targetNodeId: input.targetNodeId
      })
    }
  );
}

export async function submitVoiceRecording(input: {
  sessionId: string;
  audio: Blob;
  targetNodeId: string | null;
}): Promise<VoiceTurnResponse> {
  const formData = new FormData();
  formData.append("audio", input.audio, "recording.wav");

  if (input.targetNodeId) {
    formData.append("targetNodeId", input.targetNodeId);
  }

  return requestForm<VoiceTurnResponse>(
    `/api/sessions/${input.sessionId}/voice-turns`,
    formData
  );
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

export async function requestSessionUndo(
  sessionId: string,
  operationId: string | null = null,
  taskId: string | null = null
): Promise<TreeOperation> {
  const response = await requestJson<TreeOperationResponse>(
    `/api/sessions/${sessionId}/undo`,
    {
      method: "POST",
      body: JSON.stringify({
        operationId: operationId ?? undefined,
        taskId: taskId ?? undefined
      })
    }
  );

  return response.operation;
}

export async function requestSessionRedo(
  sessionId: string
): Promise<TreeOperation> {
  const response = await requestJson<TreeOperationResponse>(
    `/api/sessions/${sessionId}/redo`,
    {
      method: "POST"
    }
  );

  return response.operation;
}
