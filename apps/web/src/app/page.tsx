"use client";

import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { CanvasWorkspace } from "../features/workbench/components/CanvasWorkspace";
import { ConversationPanel } from "../features/workbench/components/ConversationPanel";
import { TopBar } from "../features/workbench/components/TopBar";
import {
  useWorkbenchStore,
  workbenchScenarioOptions
} from "../features/workbench/store";

function WorkbenchPageShell() {
  const session = useWorkbenchStore((state) => state.serverState.session);
  const activeScenarioId = useWorkbenchStore((state) => state.uiState.activeScenarioId);
  const apiStatus = useWorkbenchStore((state) => state.uiState.apiStatus);
  const apiError = useWorkbenchStore((state) => state.uiState.apiError);
  const dataMode = useWorkbenchStore((state) => state.uiState.dataMode);
  const initializeApiSession = useWorkbenchStore((state) => state.initializeApiSession);
  const setScenario = useWorkbenchStore((state) => state.setScenario);

  useEffect(() => {
    void initializeApiSession();
  }, [initializeApiSession]);

  return (
    <main className="workbench-page">
      <section className="workbench-shell" data-testid="workbench-shell">
        <TopBar
          title={session.title}
          scenarios={workbenchScenarioOptions}
          activeScenarioId={activeScenarioId}
          dataMode={dataMode}
          apiStatus={apiStatus}
          apiError={apiError}
          onScenarioChange={setScenario}
        />

        <div className="workbench-body">
          <CanvasWorkspace />
          <ConversationPanel />
        </div>
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <ReactFlowProvider>
      <WorkbenchPageShell />
    </ReactFlowProvider>
  );
}
