"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";

import { useAuthSession } from "../../features/auth/useAuthSession";
import { CanvasWorkspace } from "../../features/workbench/components/CanvasWorkspace";
import { ConversationPanel } from "../../features/workbench/components/ConversationPanel";
import { TopBar } from "../../features/workbench/components/TopBar";
import { setAccessTokenProvider } from "../../features/workbench/api";
import { useWorkbenchStore } from "../../features/workbench/store";

function WorkbenchPageShell() {
  const router = useRouter();
  const { authStatus, session: authSession, error: authError } = useAuthSession();
  const session = useWorkbenchStore((state) => state.serverState.session);
  const apiStatus = useWorkbenchStore((state) => state.uiState.apiStatus);
  const apiError = useWorkbenchStore((state) => state.uiState.apiError);
  const initializeApiSession = useWorkbenchStore((state) => state.initializeApiSession);
  const startNewApiSession = useWorkbenchStore((state) => state.startNewApiSession);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent("/workbench")}`);
      return;
    }

    if (authStatus === "authenticated") {
      setAccessTokenProvider(() => authSession?.access_token ?? null);
      void initializeApiSession();
    }
  }, [authSession?.access_token, authStatus, initializeApiSession, router]);

  if (authStatus === "loading") {
    return (
      <main className="workbench-page">
        <section className="workbench-shell auth-gate" data-testid="workbench-shell">
          <p>正在确认登录状态。</p>
        </section>
      </main>
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <main className="workbench-page">
        <section className="workbench-shell auth-gate" data-testid="workbench-shell">
          <p>{authError ?? "请先登录后进入工作台。"}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="workbench-page">
      <section className="workbench-shell" data-testid="workbench-shell">
        <TopBar
          title={session.title}
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
