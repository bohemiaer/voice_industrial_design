"use client";

import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { CanvasWorkspace } from "../../features/workbench/components/CanvasWorkspace";
import { ConversationPanel } from "../../features/workbench/components/ConversationPanel";
import { TopBar } from "../../features/workbench/components/TopBar";
import { setAccessTokenProvider } from "../../features/workbench/api";
import { useWorkbenchStore } from "../../features/workbench/store";

function WorkbenchPageShell() {
  const apiStatus = useWorkbenchStore((state) => state.uiState.apiStatus);
  const apiError = useWorkbenchStore((state) => state.uiState.apiError);
  const initializeApiSession = useWorkbenchStore((state) => state.initializeApiSession);
  const startNewApiSession = useWorkbenchStore((state) => state.startNewApiSession);

  useEffect(() => {
    setAccessTokenProvider(null);
    void initializeApiSession();
  }, [initializeApiSession]);

  return (
    <main className="workbench-page">
      <section className="workbench-shell" data-testid="workbench-shell">
        <TopBar
          apiStatus={apiStatus}
          apiError={apiError}
          onStartNewSession={() => {
            void startNewApiSession();
          }}
        />

        <div className="workbench-body">
          <CanvasWorkspace />
          <ConversationPanel />
        </div>
      </section>
    </main>
  );
}

export default function WorkbenchPage() {
  return (
    <ReactFlowProvider>
      <WorkbenchPageShell />
    </ReactFlowProvider>
  );
}
