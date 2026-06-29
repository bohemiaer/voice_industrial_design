import { buildApp } from "@voice-industrial-design/server/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HttpMethod = "DELETE" | "GET" | "HEAD" | "OPTIONS" | "PATCH" | "POST" | "PUT";

let appPromise: ReturnType<typeof buildApp> | null = null;

function resolvePersistenceMode() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isLocalDatabaseUrl = /(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(
    databaseUrl
  );

  return databaseUrl && !isLocalDatabaseUrl ? "postgres" : "memory";
}

function getBackendApp(): ReturnType<typeof buildApp> {
  if (!appPromise) {
    appPromise = buildApp({
      persistenceMode: resolvePersistenceMode()
    });
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
  const app = await getBackendApp();
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

export {
  proxyToBackend as DELETE,
  proxyToBackend as GET,
  proxyToBackend as OPTIONS,
  proxyToBackend as PATCH,
  proxyToBackend as POST,
  proxyToBackend as PUT
};
