import type { FastifyInstance } from "fastify";

import { ApiError } from "../errors.js";

const IMAGE_PROXY_TIMEOUT_MS = 20_000;
const IMAGE_PROXY_MAX_ATTEMPTS = 2;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_HOST = "s3.siliconflow.cn";
const ALLOWED_IMAGE_PATH_PREFIX = "/temporary/";

export async function registerImageProxyRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/api/image-proxy", async (request, reply) => {
    const sourceUrl = parseImageProxyUrl(request.query);
    const upstreamResponse = await fetchAllowedImage(sourceUrl, request.log);
    const contentLength = Number(upstreamResponse.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw new ApiError(
        502,
        "IMAGE_PROXY_IMAGE_TOO_LARGE",
        "Image proxy upstream image is too large"
      );
    }

    const imageBytes = Buffer.from(await upstreamResponse.arrayBuffer());
    const contentType = resolveImageContentType(
      upstreamResponse.headers.get("content-type"),
      imageBytes
    );

    if (!contentType) {
      throw new ApiError(
        502,
        "IMAGE_PROXY_INVALID_CONTENT_TYPE",
        "Image proxy upstream did not return an image"
      );
    }

    if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
      throw new ApiError(
        502,
        "IMAGE_PROXY_IMAGE_TOO_LARGE",
        "Image proxy upstream image is too large"
      );
    }

    return reply
      .header("content-type", contentType)
      .header("cache-control", "private, max-age=300")
      .send(imageBytes);
  });
}

function parseImageProxyUrl(query: unknown): URL {
  const rawUrl =
    query && typeof query === "object" && "url" in query
      ? (query as { url?: unknown }).url
      : null;

  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new ApiError(
      400,
      "IMAGE_PROXY_URL_REQUIRED",
      "Image proxy url is required"
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new ApiError(
      400,
      "IMAGE_PROXY_URL_INVALID",
      "Image proxy url is invalid"
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== ALLOWED_IMAGE_HOST ||
    !parsedUrl.pathname.startsWith(ALLOWED_IMAGE_PATH_PREFIX)
  ) {
    throw new ApiError(
      400,
      "IMAGE_PROXY_URL_NOT_ALLOWED",
      "Image proxy only supports SiliconFlow temporary image URLs"
    );
  }

  return parsedUrl;
}

async function fetchAllowedImage(
  sourceUrl: URL,
  log: FastifyInstance["log"]
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= IMAGE_PROXY_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetchAllowedImageAttempt(sourceUrl, log, attempt);
    } catch (error) {
      lastError = error;

      if (error instanceof ApiError && error.message.includes("HTTP")) {
        throw error;
      }

      if (attempt < IMAGE_PROXY_MAX_ATTEMPTS) {
        await wait(250 * attempt);
      }
    }
  }

  if (lastError instanceof ApiError) {
    throw lastError;
  }

  throw new ApiError(
    502,
    "IMAGE_PROXY_UPSTREAM_FAILED",
    "Image proxy upstream request failed"
  );
}

async function fetchAllowedImageAttempt(
  sourceUrl: URL,
  log: FastifyInstance["log"],
  attempt: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_PROXY_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal
    });

    if (!response.ok) {
      log.warn(
        {
          event: "image_proxy_upstream_http_error",
          host: sourceUrl.hostname,
          path: sourceUrl.pathname,
          attempt,
          status: response.status,
          elapsedMs: Date.now() - startedAt
        },
        "Image proxy upstream returned a non-success response"
      );
      throw new ApiError(
        502,
        "IMAGE_PROXY_UPSTREAM_FAILED",
        `Image proxy upstream failed with HTTP ${response.status}`
      );
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    log.warn(
      {
        event: "image_proxy_upstream_fetch_error",
        host: sourceUrl.hostname,
        path: sourceUrl.pathname,
        attempt,
        elapsedMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        cause: serializeFetchErrorCause(error)
      },
      "Image proxy upstream request failed"
    );

    throw new ApiError(
      502,
      "IMAGE_PROXY_UPSTREAM_FAILED",
      "Image proxy upstream request failed"
    );
  } finally {
    clearTimeout(timeout);
  }
}

function serializeFetchErrorCause(error: unknown): Record<string, string> | null {
  if (!(error instanceof Error) || !("cause" in error)) {
    return null;
  }

  const cause = error.cause;

  if (!(cause instanceof Error)) {
    return cause ? { message: String(cause) } : null;
  }

  const record: Record<string, string> = {
    name: cause.name,
    message: cause.message
  };
  const code = (cause as { code?: unknown }).code;

  if (typeof code === "string") {
    record.code = code;
  }

  return record;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveImageContentType(
  headerContentType: string | null,
  imageBytes: Uint8Array
): string | null {
  if (headerContentType?.toLowerCase().startsWith("image/")) {
    return headerContentType;
  }

  if (isPng(imageBytes)) {
    return "image/png";
  }

  if (isJpeg(imageBytes)) {
    return "image/jpeg";
  }

  if (isWebp(imageBytes)) {
    return "image/webp";
  }

  return null;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}
