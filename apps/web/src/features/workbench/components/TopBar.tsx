import type { WorkbenchDataMode, WorkbenchUiState } from "../types";

type TopBarProps = {
  title: string;
  dataMode: WorkbenchDataMode;
  apiStatus: WorkbenchUiState["apiStatus"];
  apiError: string | null;
};

export function TopBar({
  title,
  dataMode,
  apiStatus,
  apiError
}: TopBarProps) {
  const statusCopy =
    dataMode === "api"
      ? apiStatus === "loading"
        ? "真实 API 连接中"
        : "真实 API 驱动"
      : "Demo fixture";

  return (
    <header className="topbar">
      <div className="topbar__meta">
        <p className="topbar__crumbs">Product-update / V41 / Design</p>
        <h1>{title}</h1>
      </div>

      <div className="topbar__scenarios">
        <span className={["api-status", `api-status--${apiStatus}`].join(" ")} title={apiError ?? statusCopy}>
          {statusCopy}
        </span>
      </div>
    </header>
  );
}
