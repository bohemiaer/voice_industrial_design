import type { FastifyInstance } from "fastify";

import { requireAuth, type AuthenticatedUser } from "../auth.js";
import { ApiError } from "../errors.js";
import type { Orchestrator } from "../orchestrator/service.js";
import type { AppServices } from "../repositories/types.js";

export async function registerTaskRoutes(
  app: FastifyInstance,
  services: AppServices,
  orchestrator: Orchestrator
): Promise<void> {
  app.get("/api/tasks/:taskId", async (request) => {
    const currentUser = requireAuth(request);
    const { taskId } = request.params as { taskId: string };
    const task = await services.repositories.generationTasks.getById(taskId);

    if (!task) {
      throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
    }

    await assertTaskOwner(task.sessionId, currentUser, services);

    return { task };
  });

  app.post("/api/tasks/:taskId/confirm", async (request) => {
    const currentUser = requireAuth(request);
    const { taskId } = request.params as { taskId: string };
    const existingTask = await services.repositories.generationTasks.getById(taskId);

    if (!existingTask) {
      throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
    }

    await assertTaskOwner(existingTask.sessionId, currentUser, services);
    const task = await orchestrator.confirmTask({ taskId });

    return { task };
  });

  app.post("/api/tasks/:taskId/cancel", async (request) => {
    const currentUser = requireAuth(request);
    const { taskId } = request.params as { taskId: string };
    const existingTask = await services.repositories.generationTasks.getById(taskId);

    if (!existingTask) {
      throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
    }

    await assertTaskOwner(existingTask.sessionId, currentUser, services);
    const task = await orchestrator.cancelTask({ taskId });

    return { task };
  });
}

async function assertTaskOwner(
  sessionId: string,
  currentUser: AuthenticatedUser,
  services: AppServices
): Promise<void> {
  const session = await services.repositories.sessions.getById(sessionId);

  if (!session || session.ownerUserId !== currentUser.userId) {
    throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
  }
}
