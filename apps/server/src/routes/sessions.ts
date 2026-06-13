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

export async function registerSessionRoutes(
  app: FastifyInstance,
  services: AppServices,
  orchestrator: Orchestrator
): Promise<void> {
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

    const input = voiceTurnSchema.parse(request.body);
    const task = await orchestrator.processVoiceTurn({
      sessionId,
      transcriptText: input.transcriptText,
      targetNodeId: input.targetNodeId
    });

    return reply.status(202).send({
      task
    });
  });

  app.post("/api/sessions/:sessionId/undo", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await services.repositories.sessions.getById(sessionId);

    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
    }

    const operation =
      await services.repositories.treeOperations.getLastUndoableBySessionId(
        sessionId
      );

    if (!operation) {
      throw new ApiError(
        409,
        "UNDO_NOT_AVAILABLE",
        "No confirmed tree operation is available to undo"
      );
    }

    const undoOperation = await services.repositories.treeOperations.create({
      sessionId,
      taskId: null,
      type: "undo",
      targetNodeId: operation.targetNodeId,
      targetLayerVersion: operation.targetLayerVersion,
      insertedNodeIds: [],
      supersededNodeIds: [],
      restoredNodeIds: operation.supersededNodeIds,
      payload: {
        undoTargetOperationId: operation.id
      }
    });

    return {
      operation: undoOperation
    };
  });
}
