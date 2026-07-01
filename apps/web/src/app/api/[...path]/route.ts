export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HttpMethod = "DELETE" | "GET" | "HEAD" | "OPTIONS" | "PATCH" | "POST" | "PUT";
type PersistenceMode = "postgres" | "memory";
type BackendApp = Awaited<
  ReturnType<typeof import("@voice-industrial-design/server/app").buildApp>
>;

let appPromise: Promise<BackendApp> | null = null;

function resolvePersistenceMode(): PersistenceMode {
  const configuredPersistenceMode = process.env.PERSISTENCE_MODE;

  if (configuredPersistenceMode === "postgres") {
    return "postgres";
  }

  if (configuredPersistenceMode === "memory") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PERSISTENCE_MODE=memory is not allowed in production. DATABASE_URL is required for persistent sessions."
      );
    }

    return "memory";
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isLocalDatabaseUrl = /(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(
    databaseUrl
  );

  if (databaseUrl && !isLocalDatabaseUrl) {
    return "postgres";
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required for production API persistence. Configure a remote Postgres database such as Supabase."
    );
  }

  return "memory";
}

function getBackendApp(): Promise<BackendApp> {
  if (!appPromise) {
    appPromise = import("@voice-industrial-design/server/app").then(({ buildApp }) =>
      buildApp({
        persistenceMode: resolvePersistenceMode()
      })
    );
  }

  return appPromise;
}

function createHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};

  request.headers.forEach((value, key) => {
    if (key === "host" || key === "content-length") {
      return;
    }

    headers[key] = value;
  });

  return headers;
}

function createResponseHeaders(
  headers: Record<string, string | string[] | number | undefined>
): Headers {
  const responseHeaders = new Headers();
  const skippedHeaders = new Set([
    "connection",
    "content-length",
    "keep-alive",
    "transfer-encoding"
  ]);

  Object.entries(headers).forEach(([key, value]) => {
    if (value === undefined || skippedHeaders.has(key.toLowerCase())) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => responseHeaders.append(key, item));
      return;
    }

    responseHeaders.set(key, String(value));
  });

  return responseHeaders;
}

async function proxyToBackend(
  request: Request,
  context: { params: { path?: string[] } }
): Promise<Response> {
  let app: BackendApp;
  try {
    app = await getBackendApp();
  } catch (error) {
    return createStartupErrorResponse(error);
  }

  const url = new URL(request.url);
  const backendPath = `/${context.params.path?.join("/") ?? ""}`;

  let payload: Buffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const bodyBuffer = Buffer.from(await request.arrayBuffer());
    payload = bodyBuffer.length > 0 ? bodyBuffer : undefined;
  }

  const response = await app.inject({
    method: request.method as HttpMethod,
    url: `/api${backendPath}${url.search}`,
    headers: createHeaders(request),
    payload
  });

  return new Response(response.payload, {
    status: response.statusCode,
    headers: createResponseHeaders(response.headers)
  });
}

function createStartupErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  const isConfigurationError =
    message.includes("DATABASE_URL is required") ||
    message.includes("PERSISTENCE_MODE=memory is not allowed");

  return Response.json(
    {
      error: {
        code: isConfigurationError
          ? "API_CONFIGURATION_ERROR"
          : "API_STARTUP_ERROR",
        message
      }
    },
    {
      status: 500
    }
  );
}

export {
  proxyToBackend as DELETE,
  proxyToBackend as GET,
  proxyToBackend as OPTIONS,
  proxyToBackend as PATCH,
  proxyToBackend as POST,
  proxyToBackend as PUT
};
