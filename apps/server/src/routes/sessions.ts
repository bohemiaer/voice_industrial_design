import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { requireAuth, type AuthenticatedUser } from "../auth.js";
import { ApiError } from "../errors.js";
import type { RuntimeApiKeys } from "../agents/types.js";
import type { Orchestrator } from "../orchestrator/service.js";
import type { AppServices } from "../repositories/types.js";

const createSessionSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1)
});

const voiceTurnSchema = z.object({
  transcriptText: z.string().min(1),
  targetNodeId: z.string().min(1).nullable()
});

type VoiceTurnInput = {
  transcriptText?: string;
  audio?: Buffer;
  mimeType?: string;
  targetNodeId: string | null;
};

export async function registerSessionRoutes(
  app: FastifyInstance,
  services: AppServices,
  orchestrator: Orchestrator
): Promise<void> {
  app.post("/api/transcriptions", async (request) => {
    requireAuth(request);
    const input = await parseVoiceTurnRequest(request);
    const runtimeApiKeys = readRuntimeApiKeys(request.headers);
    const transcript = await orchestrator.transcribeAudio({
      transcriptText: input.transcriptText,
      audio: input.audio,
      mimeType: input.mimeType,
      runtimeApiKeys
    });

    return {
      transcriptText: transcript.transcriptText
    };
  });

  app.post("/api/sessions", async (request, reply) => {
    const currentUser = requireAuth(request);
    const input = createSessionSchema.parse(request.body);
    const session = await services.repositories.sessions.create({
      ...input,
      ownerUserId: currentUser.userId
    });
    return reply.status(201).send({ session });
  });

  app.get("/api/sessions", async (request) => {
    const currentUser = requireAuth(request);
    const sessions = await services.repositories.sessions.listByOwnerUserId(
      currentUser.userId
    );

    return { sessions };
  });

  app.get("/api/sessions/:sessionId/tree", async (request) => {
    const currentUser = requireAuth(request);
    const { sessionId } = request.params as { sessionId: string };
    const session = await services.repositories.sessions.getById(sessionId);
    assertSessionOwner(session, currentUser);

    const nodes = await services.repositories.treeNodes.listBySessionId(sessionId);
    return {
      session,
      nodes
    };
  });

  app.get("/api/sessions/:sessionId/messages", async (request) => {
    const currentUser = requireAuth(request);
    const { sessionId } = request.params as { sessionId: string };
    const session = await services.repositories.sessions.getById(sessionId);
    assertSessionOwner(session, currentUser);

    const messages = await services.repositories.messages.listBySessionId(sessionId);
    return { messages };
  });

  app.post("/api/sessions/:sessionId/voice-turns", async (request, reply) => {
    const currentUser = requireAuth(request);
    const { sessionId } = request.params as { sessionId: string };
    const session = await services.repositories.sessions.getById(sessionId);
    assertSessionOwner(session, currentUser);

    const input = await parseVoiceTurnRequest(request);
    const runtimeApiKeys = readRuntimeApiKeys(request.headers);
    const result = await orchestrator.processVoiceTurn({
      sessionId,
      transcriptText: input.transcriptText,
      audio: input.audio,
      mimeType: input.mimeType,
      targetNodeId: input.targetNodeId,
      runtimeApiKeys
    });

    return reply.status(202).send({
      task: result.task,
      operation: result.operation
    });
  });

  const handleUndoRequest = async (request: FastifyRequest) => {
    const currentUser = requireAuth(request);
    const { sessionId } = request.params as { sessionId: string };
    const session = await services.repositories.sessions.getById(sessionId);
    assertSessionOwner(session, currentUser);
    const {
      operationId,
      taskId
    } = (request.body as { operationId?: string | null; taskId?: string | null }) ?? {
      operationId: null,
      taskId: null
    };
    const undoOperation = await orchestrator.undoSession({
      sessionId,
      operationId: operationId ?? null,
      taskId: taskId ?? null
    });

    return {
      operation: undoOperation
    };
  };

  const handleRedoRequest = async (request: FastifyRequest) => {
    const currentUser = requireAuth(request);
    const { sessionId } = request.params as { sessionId: string };
    const session = await services.repositories.sessions.getById(sessionId);
    assertSessionOwner(session, currentUser);
    const operation = await orchestrator.redoSession({ sessionId });

    return {
      operation
    };
  };

  app.post("/api/sessions/:sessionId/undo", handleUndoRequest);
  app.get("/api/sessions/:sessionId/undo", handleUndoRequest);
  app.post("/api/sessions/:sessionId/redo", handleRedoRequest);
  app.get("/api/sessions/:sessionId/redo", handleRedoRequest);
}

function readRuntimeApiKeys(headers: Record<string, unknown>): RuntimeApiKeys | undefined {
  const siliconFlowApiKeyHeader = headers["x-siliconflow-api-key"];
  const siliconFlowApiKey = Array.isArray(siliconFlowApiKeyHeader)
    ? siliconFlowApiKeyHeader[0]
    : siliconFlowApiKeyHeader;

  if (typeof siliconFlowApiKey !== "string" || siliconFlowApiKey.trim().length === 0) {
    return undefined;
  }

  return {
    siliconFlowApiKey: siliconFlowApiKey.trim()
  };
}

function assertSessionOwner<T extends { ownerUserId: string }>(
  session: T | null,
  currentUser: AuthenticatedUser
): asserts session is T {
  if (!session || session.ownerUserId !== currentUser.userId) {
    throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
  }
}

async function parseVoiceTurnRequest(request: {
  body: unknown;
  isMultipart: () => boolean;
  parts: () => AsyncIterable<
    | {
        type: "file";
        fieldname: string;
        mimetype: string;
        toBuffer: () => Promise<Buffer>;
      }
    | {
        type: "field";
        fieldname: string;
        value: unknown;
      }
  >;
}): Promise<VoiceTurnInput> {
  if (!request.isMultipart()) {
    return voiceTurnSchema.parse(request.body);
  }

  let audio: Buffer | undefined;
  let mimeType: string | undefined;
  let targetNodeId: string | null = null;
  let transcriptText: string | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file" && part.fieldname === "audio") {
      audio = await part.toBuffer();
      mimeType = part.mimetype;
      continue;
    }

    if (part.type === "field" && part.fieldname === "targetNodeId") {
      targetNodeId =
        typeof part.value === "string" && part.value.length > 0
          ? part.value
          : null;
      continue;
    }

    if (part.type === "field" && part.fieldname === "transcriptText") {
      transcriptText =
        typeof part.value === "string" && part.value.length > 0
          ? part.value
          : undefined;
    }
  }

  if (!audio && !transcriptText) {
    throw new ApiError(
      400,
      "VOICE_TURN_INPUT_REQUIRED",
      "Either audio or transcriptText is required"
    );
  }

  return {
    transcriptText,
    audio,
    mimeType,
    targetNodeId
  };
}
