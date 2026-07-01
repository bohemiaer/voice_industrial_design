export const runtime = "edge";
export const dynamic = "force-dynamic";

const IMAGE_PROXY_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_HOST = "s3.siliconflow.cn";
const ALLOWED_IMAGE_PATH_PREFIX = "/temporary/";

export async function GET(request: Request): Promise<Response> {
  const parsedRequestUrl = new URL(request.url);
  const sourceUrl = parseImageProxyUrl(parsedRequestUrl.searchParams);

  if (sourceUrl instanceof Response) {
    return sourceUrl;
  }

  const upstreamResponse = await fetchAllowedImage(sourceUrl);

  if (upstreamResponse instanceof Response && !upstreamResponse.ok) {
    return upstreamResponse;
  }

  const contentLength = Number(upstreamResponse.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    return createErrorResponse(
      502,
      "IMAGE_PROXY_IMAGE_TOO_LARGE",
      "Image proxy upstream image is too large"
    );
  }

  const imageBytes = await upstreamResponse.arrayBuffer();
  const contentType = resolveImageContentType(
    upstreamResponse.headers.get("content-type"),
    new Uint8Array(imageBytes)
  );

  if (!contentType) {
    return createErrorResponse(
      502,
      "IMAGE_PROXY_INVALID_CONTENT_TYPE",
      "Image proxy upstream did not return an image"
    );
  }

  if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
    return createErrorResponse(
      502,
      "IMAGE_PROXY_IMAGE_TOO_LARGE",
      "Image proxy upstream image is too large"
    );
  }

  return new Response(imageBytes, {
    headers: {
      "cache-control": "private, max-age=300",
      "content-type": contentType
    }
  });
}

function parseImageProxyUrl(searchParams: URLSearchParams): URL | Response {
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return createErrorResponse(
      400,
      "IMAGE_PROXY_URL_REQUIRED",
      "Image proxy url is required"
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return createErrorResponse(
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
    return createErrorResponse(
      400,
      "IMAGE_PROXY_URL_NOT_ALLOWED",
      "Image proxy only supports SiliconFlow temporary image URLs"
    );
  }

  return parsedUrl;
}

async function fetchAllowedImage(sourceUrl: URL): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal
    });

    if (!response.ok) {
      return createErrorResponse(
        502,
        "IMAGE_PROXY_UPSTREAM_FAILED",
        `Image proxy upstream failed with HTTP ${response.status}`
      );
    }

    return response;
  } catch {
    return createErrorResponse(
      502,
      "IMAGE_PROXY_UPSTREAM_FAILED",
      "Image proxy upstream request failed"
    );
  } finally {
    clearTimeout(timeout);
  }
}

function createErrorResponse(
  status: number,
  code: string,
  message: string
): Response {
  return Response.json(
    {
      error: {
        code,
        message
      }
    },
    {
      status
    }
  );
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
