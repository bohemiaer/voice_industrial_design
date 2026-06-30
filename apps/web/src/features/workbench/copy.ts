export const PRODUCT_NAME = "Forkorm";
export const UNTITLED_PROJECT_NAME = "未命名项目";
export const DEFAULT_SESSION_TITLE = "请输入您想要设计的产品";
export const DEFAULT_ROOT_REQUIREMENT =
  "请详细描述你的需求，可以参考下面几个要点";

export function extractProductName(text: string): string | null {
  const normalized = text.trim();

  if (!normalized) {
    return null;
  }

  const patterns = [
    /围绕(.+?)(生成|做|展开|延展|发散|设计|探索)/,
    /探索(.+?)(的|方向|方案|概念)/,
    /设计(?:一款|一个|一台|一种)?(.+?)(，|。|,|\.|并|让|要|用于)/
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function truncateRootText(text: string): string {
  const normalized = text.trim();

  if (normalized.length <= 16) {
    return normalized || DEFAULT_SESSION_TITLE;
  }

  return `${normalized.slice(0, 16)}...`;
}

export function resolveRootNodeDisplayName(session: {
  title: string;
}, rootIntentSummary: string): string {
  if (
    session.title !== DEFAULT_SESSION_TITLE &&
    session.title.trim().length > 0
  ) {
    return session.title;
  }

  return (
    extractProductName(rootIntentSummary) ??
    (rootIntentSummary === DEFAULT_ROOT_REQUIREMENT
      ? DEFAULT_SESSION_TITLE
      : truncateRootText(rootIntentSummary))
  );
}
