import type { WorkbenchUiState } from "../types";

type TopBarProps = {
  title: string;
  apiStatus: WorkbenchUiState["apiStatus"];
  apiError: string | null;
  onStartNewSession: () => void;
};

export function TopBar({
  title,
  apiStatus,
  apiError,
  onStartNewSession
}: TopBarProps) {
  const statusCopy =
    apiStatus === "loading"
      ? "真实 API 连接中"
      : apiStatus === "error"
        ? "真实 API 错误"
        : "真实 API 驱动";

  return (
    <header className="topbar">
      <div className="topbar__meta">
        <p className="topbar__crumbs">Product-update / V41 / Design</p>
        <h1>{title}</h1>
      </div>

      <div className="topbar__scenarios">
        <button className="topbar-reset" type="button" onClick={onStartNewSession}>
          重新开始测试
        </button>
        <span className={["api-status", `api-status--${apiStatus}`].join(" ")} title={apiError ?? statusCopy}>
          {statusCopy}
        </span>
      </div>
    </header>
  );
}
