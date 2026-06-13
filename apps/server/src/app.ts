import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { loadConfig, type PersistenceMode } from "./config.js";
import { createAgentGateway } from "./agents/index.js";
import { createDatabase } from "./db/client.js";
import { isApiError } from "./errors.js";
import { createOrchestrator } from "./orchestrator/service.js";
import { createDrizzleServices } from "./repositories/drizzle.js";
import { createMemoryServices } from "./repositories/memory.js";
import type { AppServices } from "./repositories/types.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerTaskRoutes } from "./routes/tasks.js";

export interface BuildAppOptions {
  persistenceMode?: PersistenceMode;
}

export async function buildApp(
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const config = loadConfig();
  const persistenceMode = options.persistenceMode ?? "postgres";
  const app = Fastify({
    logger: true
  });

  let services: AppServices;
  let poolCloser: (() => Promise<void>) | null = null;

  if (persistenceMode === "postgres") {
    const { db, pool } = createDatabase(config);
    services = createDrizzleServices(db);
    poolCloser = async () => {
      await pool.end();
    };
  } else {
    services = createMemoryServices();
  }

  const agentGateway = createAgentGateway(config);
  const orchestrator = createOrchestrator(services, config, agentGateway);

  app.setErrorHandler((error, request, reply) => {
    if (isApiError(error)) {
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message
        }
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "Request validation failed",
          issues: error.issues
        }
      });
      return;
    }

    request.log.error(error);
    reply.status(500).send({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error"
      }
    });
  });

  await registerHealthRoutes(app, services);
  await registerSessionRoutes(app, services, orchestrator);
  await registerTaskRoutes(app, services, orchestrator);

  app.addHook("onClose", async () => {
    if (poolCloser) {
      await poolCloser();
    }
  });

  return app;
}
