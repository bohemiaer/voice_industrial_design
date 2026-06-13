import type { FastifyInstance } from "fastify";

import type { AppServices } from "../repositories/types.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  services: AppServices
): Promise<void> {
  app.get("/health", async () => {
    return {
      ok: true,
      service: "voice-industrial-design-server",
      persistenceMode: services.persistenceMode
    };
  });
}
