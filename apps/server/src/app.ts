import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";

import { AgentGatewayError, type AgentGateway } from "./agents/types.js";
import {
  authenticateRequest,
  createSupabaseJwtVerifier,
  isProtectedApiRequest,
  type AuthenticatedUser,
  type AuthVerifier
} from "./auth.js";
import { loadConfig, type AgentProvider, type PersistenceMode } from "./config.js";
import { createAgentGateway } from "./agents/index.js";
import { createDatabase } from "./db/client.js";
import { ApiError, isApiError } from "./errors.js";
import { createOrchestrator } from "./orchestrator/service.js";
import { createDrizzleServices } from "./repositories/drizzle.js";
import { createMemoryServices } from "./repositories/memory.js";
import type { AppServices } from "./repositories/types.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerTaskRoutes } from "./routes/tasks.js";

export interface BuildAppOptions {
  persistenceMode?: PersistenceMode;
  agentProvider?: AgentProvider;
  agentGateway?: AgentGateway;
  authRequired?: boolean;
  authVerifier?: AuthVerifier;
  defaultAuthenticatedUser?: AuthenticatedUser;
}

const LOCAL_AUTH_USER: AuthenticatedUser = {
  userId: "local-workbench-user",
  email: null
};

export async function buildApp(
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const loadedConfig = loadConfig();
  const config = {
    ...loadedConfig,
    persistenceMode: options.persistenceMode ?? loadedConfig.persistenceMode,
    agentProvider: options.agentProvider ?? loadedConfig.agentProvider
  };
  const persistenceMode = config.persistenceMode;
  const authRequired = options.authRequired ?? false;
  const authVerifier = options.authVerifier ?? createSupabaseJwtVerifier(config);
  const defaultAuthenticatedUser = authRequired
    ? options.defaultAuthenticatedUser
    : options.defaultAuthenticatedUser ?? LOCAL_AUTH_USER;
  const app = Fastify({
    logger: true
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;

    if (origin) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
    }

    reply.header(
      "Access-Control-Allow-Methods",
      "GET,POST,OPTIONS"
    );
    reply.header(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization"
    );

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }

    if (isProtectedApiRequest(request)) {
      if (!authRequired) {
        request.currentUser = defaultAuthenticatedUser;
        return;
      }

      await authenticateRequest({
        request,
        verifier: authVerifier,
        defaultAuthenticatedUser
      });
    }
  });

  await app.register(multipart, {
    limits: {
      fileSize: 12 * 1024 * 1024,
      files: 1
    }
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

  const agentGateway = options.agentGateway ?? createAgentGateway(config);
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

    if (error instanceof AgentGatewayError) {
      const apiError = mapAgentGatewayError(error);
      reply.status(apiError.statusCode).send({
        error: {
          code: apiError.code,
          message: apiError.message
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

function mapAgentGatewayError(error: AgentGatewayError): ApiError {
  switch (error.code) {
    case "ASR_AUDIO_REQUIRED":
      return new ApiError(400, error.code, error.message);
    case "SILICONFLOW_CONFIG_MISSING":
    case "DEEPSEEK_CONFIG_MISSING":
      return new ApiError(500, error.code, error.message);
    case "SILICONFLOW_REQUEST_FAILED":
    case "SILICONFLOW_RESPONSE_INVALID":
    case "DEEPSEEK_REQUEST_FAILED":
    case "DEEPSEEK_RESPONSE_INVALID":
      return new ApiError(502, error.code, error.message);
    default:
      return new ApiError(500, error.code, error.message);
  }
}
