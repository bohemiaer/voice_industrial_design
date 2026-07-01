const SILICONFLOW_IMAGE_HOST = "s3.siliconflow.cn";
const SILICONFLOW_TEMPORARY_PATH_PREFIX = "/temporary/";

export function resolveGeneratedImageUrl(
  imageUrl: string | null | undefined
): string | undefined {
  if (!imageUrl) {
    return undefined;
  }

  if (!isSiliconFlowTemporaryImageUrl(imageUrl)) {
    return imageUrl;
  }

  return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
}

function isSiliconFlowTemporaryImageUrl(imageUrl: string): boolean {
  try {
    const parsedUrl = new URL(imageUrl);

    return (
      parsedUrl.protocol === "https:" &&
      parsedUrl.hostname === SILICONFLOW_IMAGE_HOST &&
      parsedUrl.pathname.startsWith(SILICONFLOW_TEMPORARY_PATH_PREFIX)
    );
  } catch {
    return false;
  }
}
