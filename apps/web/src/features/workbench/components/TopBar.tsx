import type { WorkbenchDataMode, WorkbenchScenarioId, WorkbenchUiState } from "../types";

type ScenarioOption = {
  id: WorkbenchScenarioId;
  label: string;
  description: string;
};

type TopBarProps = {
  title: string;
  scenarios: ScenarioOption[];
  activeScenarioId: WorkbenchScenarioId;
  dataMode: WorkbenchDataMode;
  apiStatus: WorkbenchUiState["apiStatus"];
  apiError: string | null;
  onScenarioChange: (scenarioId: WorkbenchScenarioId) => void;
};

export function TopBar({
  title,
  scenarios,
  activeScenarioId,
  dataMode,
  apiStatus,
  apiError,
  onScenarioChange
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
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={[
              "scenario-chip",
              scenario.id === activeScenarioId ? "is-active" : ""
            ].join(" ")}
            onClick={() => onScenarioChange(scenario.id)}
            title={scenario.description}
          >
            {scenario.label}
          </button>
        ))}
      </div>
    </header>
  );
}
