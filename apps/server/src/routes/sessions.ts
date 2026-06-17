import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ApiError } from "../errors.js";
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
    const input = await parseVoiceTurnRequest(request);
    const transcript = await orchestrator.transcribeAudio({
      transcriptText: input.transcriptText,
      audio: input.audio,
      mimeType: input.mimeType
    });

    return {
      transcriptText: transcript.transcriptText
    };
  });

  app.post("/api/sessions", async (request, reply) => {
    const input = createSessionSchema.parse(request.body);
    const session = await services.repositories.sessions.create(input);
    return reply.status(201).send({ session });
  });

  app.get("/api/sessions/:sessionId/tree", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await services.repositories.sessions.getById(sessionId);

    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
    }

    const nodes = await services.repositories.treeNodes.listBySessionId(sessionId);
    return {
      session,
      nodes
    };
  });

  app.get("/api/sessions/:sessionId/messages", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await services.repositories.sessions.getById(sessionId);

    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
    }

    const messages = await services.repositories.messages.listBySessionId(sessionId);
    return { messages };
  });

  app.post("/api/sessions/:sessionId/voice-turns", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await services.repositories.sessions.getById(sessionId);

    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
    }

    const input = await parseVoiceTurnRequest(request);
    const result = await orchestrator.processVoiceTurn({
      sessionId,
      transcriptText: input.transcriptText,
      audio: input.audio,
      mimeType: input.mimeType,
      targetNodeId: input.targetNodeId
    });

    return reply.status(202).send({
      task: result.task,
      operation: result.operation
    });
  });

  app.post("/api/sessions/:sessionId/undo", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const {
      operationId,
      taskId
    } = (request.body as { operationId?: string | null; taskId?: string | null }) ?? {
      operationId: null,
      taskId: null
    };
    const taskOperation =
      taskId != null
        ? await services.repositories.treeOperations.getByTaskId(taskId)
        : null;
    const undoOperation = await orchestrator.undoSession({
      sessionId,
      operationId: operationId ?? null,
      taskId: taskId ?? null
    });

    return {
      operation: undoOperation
    };
  });

  app.post("/api/sessions/:sessionId/redo", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const operation = await orchestrator.redoSession({ sessionId });

    return {
      operation
    };
  });
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
