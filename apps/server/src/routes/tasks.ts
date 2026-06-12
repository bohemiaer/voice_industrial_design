import type { FastifyInstance } from "fastify";

import { ApiError } from "../errors.js";
import type { AppServices } from "../repositories/types.js";

export async function registerTaskRoutes(
  app: FastifyInstance,
  services: AppServices
): Promise<void> {
  app.get("/api/tasks/:taskId", async (request) => {
    const { taskId } = request.params as { taskId: string };
    const task = await services.repositories.generationTasks.getById(taskId);

    if (!task) {
      throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
    }

    return { task };
  });

  app.post("/api/tasks/:taskId/confirm", async (request) => {
    const { taskId } = request.params as { taskId: string };
    const task = await services.repositories.generationTasks.updateConfirmation({
      taskId,
      decision: "confirm"
    });

    if (!task) {
      throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
    }

    return { task };
  });

  app.post("/api/tasks/:taskId/cancel", async (request) => {
    const { taskId } = request.params as { taskId: string };
    const task = await services.repositories.generationTasks.updateConfirmation({
      taskId,
      decision: "cancel"
    });

    if (!task) {
      throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
    }

    return { task };
  });
}
