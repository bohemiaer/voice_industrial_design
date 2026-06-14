"use client";

import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { CanvasWorkspace } from "../features/workbench/components/CanvasWorkspace";
import { ConversationPanel } from "../features/workbench/components/ConversationPanel";
import { TopBar } from "../features/workbench/components/TopBar";
import { useWorkbenchStore } from "../features/workbench/store";

function WorkbenchPageShell() {
  const session = useWorkbenchStore((state) => state.serverState.session);
  const apiStatus = useWorkbenchStore((state) => state.uiState.apiStatus);
  const apiError = useWorkbenchStore((state) => state.uiState.apiError);
  const dataMode = useWorkbenchStore((state) => state.uiState.dataMode);
  const initializeApiSession = useWorkbenchStore((state) => state.initializeApiSession);

  useEffect(() => {
    void initializeApiSession();
  }, [initializeApiSession]);

  return (
    <main className="workbench-page">
      <section className="workbench-shell" data-testid="workbench-shell">
        <TopBar
          title={session.title}
          dataMode={dataMode}
          apiStatus={apiStatus}
          apiError={apiError}
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
