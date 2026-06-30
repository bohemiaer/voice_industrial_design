import type { WorkbenchUiState } from "../types";
import { PRODUCT_NAME } from "../copy";

type TopBarProps = {
  apiStatus: WorkbenchUiState["apiStatus"];
  apiError: string | null;
  onStartNewSession: () => void;
};

export function TopBar({
  apiStatus,
  apiError,
  onStartNewSession
}: TopBarProps) {
  const refreshLabel = apiStatus === "loading" ? "刷新中" : "刷新";
  const refreshTitle = apiError ?? "刷新当前工作台会话";

  return (
    <header className="topbar">
      <div className="topbar__meta">
        <h1>{PRODUCT_NAME}</h1>
      </div>

      <div className="topbar__scenarios">
        <button
          className="topbar-refresh"
          type="button"
          title={refreshTitle}
          onClick={onStartNewSession}
          disabled={apiStatus === "loading"}
        >
          {refreshLabel}
        </button>
      </div>
    </header>
  );
}
