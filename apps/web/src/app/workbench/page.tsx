"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { CanvasWorkspace } from "../../features/workbench/components/CanvasWorkspace";
import { ConversationPanel } from "../../features/workbench/components/ConversationPanel";
import { TopBar } from "../../features/workbench/components/TopBar";
import { ApiKeyGateDialog } from "../../features/workbench/components/ApiKeyGateDialog";
import {
  setAccessTokenProvider,
  setSiliconFlowApiKeyProvider
} from "../../features/workbench/api";
import { useWorkbenchStore } from "../../features/workbench/store";

const WORKBENCH_API_STORAGE_KEY = "voice-painting.siliconflow-api-key";
const API_GATE_TITLE = "请填写 API";
const API_GATE_DESCRIPTION = "硅基流动注册即可获得免费额度 API；配置后即可使用！";
const API_GATE_REGISTRATION_URL = "https://cloud.siliconflow.cn/i/pUZUB64c";

function WorkbenchPageShell() {
  const apiStatus = useWorkbenchStore((state) => state.uiState.apiStatus);
  const apiError = useWorkbenchStore((state) => state.uiState.apiError);
  const initializeApiSession = useWorkbenchStore((state) => state.initializeApiSession);
  const startNewApiSession = useWorkbenchStore((state) => state.startNewApiSession);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [isApiDialogOpen, setIsApiDialogOpen] = useState(false);

  const configureProviders = useCallback((apiKey: string) => {
    setAccessTokenProvider(null);
    setSiliconFlowApiKeyProvider(() => apiKey);
  }, []);

  const initializeWorkbench = useCallback(async (apiKey: string) => {
    configureProviders(apiKey);
    await initializeApiSession();
  }, [configureProviders, initializeApiSession]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedApiKey = window.localStorage.getItem(WORKBENCH_API_STORAGE_KEY)?.trim() ?? "";

    if (!storedApiKey) {
      setAccessTokenProvider(null);
      setSiliconFlowApiKeyProvider(null);
      setHasStoredApiKey(false);
      setIsApiDialogOpen(false);
      setApiKeyDraft("");
      setIsHydrated(true);
      return;
    }

    setHasStoredApiKey(true);
    setIsApiDialogOpen(false);
    setApiKeyDraft(storedApiKey);
    setIsHydrated(true);
    void initializeWorkbench(storedApiKey);
  }, [initializeWorkbench]);

  const handleSaveApiKey = useCallback(() => {
    const trimmedApiKey = apiKeyDraft.trim();

    if (trimmedApiKey.length === 0) {
      setApiKeyError("请先填写可用的 SiliconFlow API。");
      return;
    }

    setIsSavingApiKey(true);
    setApiKeyError(null);

    try {
      window.localStorage.setItem(WORKBENCH_API_STORAGE_KEY, trimmedApiKey);
      setHasStoredApiKey(true);
      setIsApiDialogOpen(false);
      setApiKeyDraft(trimmedApiKey);
      void (async () => {
        try {
          await initializeWorkbench(trimmedApiKey);
        } finally {
          setIsSavingApiKey(false);
        }
      })();
    } catch (error) {
      setApiKeyError(
        error instanceof Error ? error.message : "保存 API 时发生了意外错误。"
      );
      setHasStoredApiKey(false);
      setIsSavingApiKey(false);
    }
  }, [apiKeyDraft, initializeWorkbench]);

  const shouldInterceptWorkbench = useMemo(
    () => isHydrated && !hasStoredApiKey,
    [hasStoredApiKey, isHydrated]
  );

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

        {shouldInterceptWorkbench ? (
          <button
            type="button"
            className="api-key-gate__trigger"
            aria-label="点击工作台任意位置填写 API"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 85,
              border: 0,
              background: "transparent",
              cursor: "pointer"
            }}
            onClick={() => {
              setIsApiDialogOpen(true);
              if (apiKeyError) {
                setApiKeyError(null);
              }
            }}
          />
        ) : null}

        {shouldInterceptWorkbench && isApiDialogOpen ? (
          <ApiKeyGateDialog
            title={API_GATE_TITLE}
            description={API_GATE_DESCRIPTION}
            registrationUrl={API_GATE_REGISTRATION_URL}
            value={apiKeyDraft}
            error={apiKeyError}
            isSaving={isSavingApiKey}
            onClose={() => {
              setIsApiDialogOpen(false);
              setApiKeyError(null);
            }}
            onChange={(value) => {
              setApiKeyDraft(value);
              if (apiKeyError) {
                setApiKeyError(null);
              }
            }}
            onSubmit={handleSaveApiKey}
          />
        ) : null}
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
