import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts) =>
  fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

const gitignore = read(".gitignore");
const pageSource = read("apps", "web", "src", "app", "page.tsx");
const workbenchPageSource = read("apps", "web", "src", "app", "workbench", "page.tsx");
const todo = read("TODO.md");
const webPackage = read("apps", "web", "package.json");
const storeSource = read("apps", "web", "src", "features", "workbench", "store.ts");
const typesSource = read("apps", "web", "src", "features", "workbench", "types.ts");
const runtimeFixturesPath = path.join(
  process.cwd(),
  "apps",
  "web",
  "src",
  "features",
  "workbench",
  "fixtures.ts"
);
const archivedFixturesPath = path.join(
  process.cwd(),
  "archive",
  "demo-fixtures",
  "workbench-fixtures.ts"
);
const archivedFixturesSource = fs.existsSync(archivedFixturesPath)
  ? fs.readFileSync(archivedFixturesPath, "utf8")
  : "";
const apiPath = path.join(
  process.cwd(),
  "apps",
  "web",
  "src",
  "features",
  "workbench",
  "api.ts"
);
const apiSource = fs.existsSync(apiPath) ? fs.readFileSync(apiPath, "utf8") : "";
const loginPagePath = path.join(
  process.cwd(),
  "apps",
  "web",
  "src",
  "app",
  "login",
  "page.tsx"
);
const loginPageSource = fs.existsSync(loginPagePath)
  ? fs.readFileSync(loginPagePath, "utf8")
  : "";
const authClientPath = path.join(
  process.cwd(),
  "apps",
  "web",
  "src",
  "features",
  "auth",
  "supabase.ts"
);
const authClientSource = fs.existsSync(authClientPath)
  ? fs.readFileSync(authClientPath, "utf8")
  : "";
const authHookPath = path.join(
  process.cwd(),
  "apps",
  "web",
  "src",
  "features",
  "auth",
  "useAuthSession.ts"
);
const authHookSource = fs.existsSync(authHookPath)
  ? fs.readFileSync(authHookPath, "utf8")
  : "";
const conversationPanelSource = read(
  "apps",
  "web",
  "src",
  "features",
  "workbench",
  "components",
  "ConversationPanel.tsx"
);
const topBarSource = read(
  "apps",
  "web",
  "src",
  "features",
  "workbench",
  "components",
  "TopBar.tsx"
);
const canvasWorkspaceSource = read(
  "apps",
  "web",
  "src",
  "features",
  "workbench",
  "components",
  "CanvasWorkspace.tsx"
);
const nodeCardSource = read(
  "apps",
  "web",
  "src",
  "features",
  "workbench",
  "components",
  "BrainstormNodeCard.tsx"
);
const globalsSource = read("apps", "web", "src", "app", "globals.css");
const recordingBarSource = read(
  "apps",
  "web",
  "src",
  "features",
  "workbench",
  "components",
  "RecordingBar.tsx"
);
const intentStatusCardSource = read(
  "apps",
  "web",
  "src",
  "features",
  "workbench",
  "components",
  "IntentStatusCard.tsx"
);
const uiMetaSource = read("apps", "web", "src", "features", "workbench", "uiMeta.ts");

test("gitignore excludes the frontend reference workspace", () => {
  assert.match(gitignore, /^frontend-refer\/$/m);
});

test("home page presents the landing hero and routes the primary action to the workbench", () => {
  assert.match(pageSource, /import Link from "next\/link"/);
  assert.match(pageSource, /概念树工作台/);
  assert.match(pageSource, /工业设计概念探索/);
  assert.match(pageSource, /立即体验/);
  assert.match(pageSource, /href="\/workbench"/);
  assert.doesNotMatch(pageSource, /ReactFlowProvider/);
});

test("home page follows the landing-page guide conversion structure", () => {
  assert.match(pageSource, /Aesthetic direction: workbench-native/);
  assert.match(pageSource, /<header className="landing-header"/);
  assert.match(pageSource, /设计团队正在用它整理早期方向/);
  assert.match(pageSource, /\/images\/concept-tree-workbench-preview\.png/);
  assert.match(pageSource, /landing-preview-image/);
  assert.match(pageSource, /data-section="product-media"/);
  assert.match(pageSource, /data-section="benefits"/);
  assert.match(pageSource, /data-section="testimonials"/);
  assert.match(pageSource, /data-section="faq"/);
  assert.match(pageSource, /data-section="final-cta"/);
  assert.match(pageSource, /<footer className="landing-footer"/);
  assert.match(pageSource, /联系我们/);
  assert.match(pageSource, /隐私政策/);
});

test("landing page design system avoids generic template styling", () => {
  assert.match(globalsSource, /--landing-font-display/);
  assert.match(globalsSource, /--landing-workbench-bg/);
  assert.match(globalsSource, /--landing-workbench-accent/);
  assert.match(globalsSource, /\.landing-preview-image/);
  assert.match(globalsSource, /@keyframes landingReveal/);
  assert.match(globalsSource, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(globalsSource, /Inter/);
  assert.doesNotMatch(globalsSource, /Roboto/);
});

test("workbench route is composed from dedicated frontend components", () => {
  assert.match(workbenchPageSource, /^"use client";/m);
  assert.match(workbenchPageSource, /ReactFlowProvider/);
  assert.match(workbenchPageSource, /<TopBar/);
  assert.match(workbenchPageSource, /<CanvasWorkspace/);
  assert.match(workbenchPageSource, /<ConversationPanel/);
});

test("workbench page keeps the existing flow workspace on a dedicated route", () => {
  assert.match(workbenchPageSource, /data-testid="workbench-shell"/);
  assert.match(workbenchPageSource, /<main className="workbench-page">/);
});

test("frontend workbench uses react flow and zustand", () => {
  assert.match(webPackage, /"dev": "next dev --turbo -H 127\.0\.0\.1"/);
  assert.match(webPackage, /"@xyflow\/react"/);
  assert.match(webPackage, /"jszip"/);
  assert.match(webPackage, /"zustand"/);
  assert.match(storeSource, /create } from "zustand"/);
  assert.match(canvasWorkspaceSource, /ReactFlow/);
  assert.match(canvasWorkspaceSource, /nodeTypes/);
  assert.match(canvasWorkspaceSource, /fitView/);
  assert.match(canvasWorkspaceSource, /style=\{\{ width: "100%", height: "100%" \}\}/);
  assert.match(globalsSource, /\.flow-shell \.react-flow \{/);
  const viewportRule = globalsSource.match(/\.react-flow__viewport\s*\{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(viewportRule, /padding-left/);
});

test("web app declares Supabase auth dependency and client helpers", () => {
  assert.match(webPackage, /"@supabase\/supabase-js"/);
  assert.match(authClientSource, /createClient/);
  assert.match(authClientSource, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(authClientSource, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(authHookSource, /onAuthStateChange/);
  assert.match(authHookSource, /getSession/);
});

test("login page supports email password registration and sign in", () => {
  assert.match(loginPageSource, /^"use client";/m);
  assert.match(loginPageSource, /signInWithPassword/);
  assert.match(loginPageSource, /signUp/);
  assert.match(loginPageSource, /useSearchParams/);
  assert.match(loginPageSource, /next/);
  assert.match(loginPageSource, /邮箱/);
  assert.match(loginPageSource, /密码/);
  assert.match(loginPageSource, /创建账号/);
});

test("workbench route starts the live workspace without login gating", () => {
  assert.doesNotMatch(workbenchPageSource, /useAuthSession/);
  assert.doesNotMatch(workbenchPageSource, /router\.replace/);
  assert.doesNotMatch(workbenchPageSource, /authStatus/);
  assert.doesNotMatch(workbenchPageSource, /auth-interaction-catcher/);
  assert.doesNotMatch(workbenchPageSource, /auth-login-dialog/);
  assert.doesNotMatch(workbenchPageSource, /\/login\?next=/);
  assert.match(workbenchPageSource, /initializeApiSession/);
});

test("workbench api client attaches Supabase bearer tokens to json and form requests", () => {
  assert.match(apiSource, /setAccessTokenProvider/);
  assert.match(apiSource, /Authorization/);
  assert.match(apiSource, /Bearer \$\{accessToken\}/);
  assert.match(apiSource, /requestJson/);
  assert.match(apiSource, /requestForm/);
});

test("canvas lays out generated nodes as a vertical tree without obsolete toolbar entries", () => {
  assert.match(canvasWorkspaceSource, /useReactFlow/);
  assert.match(canvasWorkspaceSource, /flowNodeIds/);
  assert.match(canvasWorkspaceSource, /focusDefaultWorkspace/);
  assert.match(canvasWorkspaceSource, /workspacePaneRef/);
  assert.match(canvasWorkspaceSource, /querySelector\("\.node-card\.is-root"\)/);
  assert.match(canvasWorkspaceSource, /paneRect\.width \* 0\.5/);
  assert.match(canvasWorkspaceSource, /paneRect\.height \* 0\.42/);
  assert.match(canvasWorkspaceSource, /setViewport/);
  assert.match(canvasWorkspaceSource, /const \[isGlobalPreview, setIsGlobalPreview\] = useState\(false\)/);
  assert.match(canvasWorkspaceSource, /viewportSnapshotRef/);
  assert.match(canvasWorkspaceSource, /handleToggleGlobalPreview/);
  assert.match(canvasWorkspaceSource, /handleExportImages/);
  assert.match(canvasWorkspaceSource, /await import\("jszip"\)/);
  assert.match(canvasWorkspaceSource, /voice-painting-images-/);
  assert.match(canvasWorkspaceSource, /viewportAspectRatio/);
  assert.match(canvasWorkspaceSource, /expandedWidth = Math\.max\(bounds\.width \* 2, 720\)/);
  assert.match(canvasWorkspaceSource, /expandedHeight = Math\.max\(/);
  assert.match(canvasWorkspaceSource, /y: bounds\.y - \(expandedHeight - bounds\.height\) \/ 2/);
  assert.match(canvasWorkspaceSource, /const rootNode/);
  assert.match(canvasWorkspaceSource, /resolveRootNodeIntentSummary/);
  assert.match(canvasWorkspaceSource, /findFirstUserTranscript/);
  assert.match(canvasWorkspaceSource, /resolveRootNodeDisplayName/);
  assert.match(canvasWorkspaceSource, /resolveRootNodeLabel/);
  assert.match(canvasWorkspaceSource, /hasConfirmedRootIntent/);
  assert.match(canvasWorkspaceSource, /createSymmetricTreeLayout/);
  assert.match(canvasWorkspaceSource, /id: serverState\.session\.id/);
  assert.match(canvasWorkspaceSource, /parentNodeId: node\.parentNodeId \?\? serverState\.session\.id/);
  assert.match(canvasWorkspaceSource, /sourcePosition: Position\.Bottom/);
  assert.match(canvasWorkspaceSource, /targetPosition: Position\.Top/);
  assert.match(nodeCardSource, /type="target" position=\{Position\.Top\}/);
  assert.match(nodeCardSource, /type="source"\s+position=\{Position\.Bottom\}/);
  assert.match(nodeCardSource, /node-card__empty-prompts/);
  assert.match(nodeCardSource, /node-card__requirement-text/);
  assert.match(nodeCardSource, /node\.intentSummary/);
  assert.match(nodeCardSource, /showRootPromptHints/);
  assert.match(nodeCardSource, /描述产品类型/);
  assert.match(nodeCardSource, /目标人群/);
  assert.match(nodeCardSource, /关键需求/);
  assert.match(nodeCardSource, /风格方向/);
  assert.match(nodeCardSource, /方向 \$\{node\.layerOrdinal\}/);
  assert.match(nodeCardSource, /图片生成中/);
  assert.match(nodeCardSource, /node\.imageUrl/);
  assert.match(nodeCardSource, /<img/);
  assert.match(nodeCardSource, /node-card__image/);
  assert.doesNotMatch(nodeCardSource, /Position\.Left/);
  assert.doesNotMatch(nodeCardSource, /Position\.Right/);
  assert.match(globalsSource, /\.port-top/);
  assert.match(globalsSource, /\.port-bottom/);
  assert.match(globalsSource, /\.node-card__image/);
  assert.doesNotMatch(canvasWorkspaceSource, /label: "面板"/);
  assert.doesNotMatch(canvasWorkspaceSource, /label: "灵感"/);
  assert.match(canvasWorkspaceSource, /label: "全局显示"/);
  assert.match(canvasWorkspaceSource, /label: "拖拽"/);
  assert.doesNotMatch(canvasWorkspaceSource, /label: "框选"/);
  assert.match(uiMetaSource, /const nodeVerticalGap = 440/);
  assert.match(uiMetaSource, /function createSymmetricTreeLayout/);
  assert.match(uiMetaSource, /function measureSubtreeSpan/);
  assert.match(uiMetaSource, /const siblingGapUnits =/);
  assert.match(uiMetaSource, /parentCenterX - totalChildrenSpan \/ 2/);
  assert.match(uiMetaSource, /y: nodeOrigin\.y \+ depth \* nodeVerticalGap/);
});

test("frontend workbench defines server mirror and local ui state structures", () => {
  assert.match(typesSource, /type WorkbenchServerState =/);
  assert.match(typesSource, /type WorkbenchUiState =/);
  assert.match(typesSource, /currentNodeId: string/);
  assert.doesNotMatch(typesSource, /selectedNodeId:/);
  assert.doesNotMatch(typesSource, /currentTargetNodeId:/);
  assert.doesNotMatch(typesSource, /WorkbenchFixture/);
});

test("conversation panel keeps only the message stream and recording input", () => {
  assert.match(conversationPanelSource, /<details className="system-log" open=\{isExpanded\}>/);
  assert.match(conversationPanelSource, /<RecordingBar/);
  assert.match(conversationPanelSource, /hasConfirmedRootIntent/);
  assert.match(conversationPanelSource, /useEffect/);
  assert.match(conversationPanelSource, /useRef/);
  assert.match(conversationPanelSource, /scrollTop = scrollRegionRef\.current\.scrollHeight/);
  assert.match(conversationPanelSource, /onRecordingComplete=\{submitAudioTurn\}/);
  assert.match(conversationPanelSource, /onTextSubmit=\{submitVoiceTurn\}/);
  assert.match(conversationPanelSource, /thinkingMessage/);
  assert.match(conversationPanelSource, /UNTITLED_PROJECT_NAME/);
  assert.match(conversationPanelSource, /sidebar-title__edit/);
  assert.match(conversationPanelSource, /selectedNode\s*\?\s*createNodeUiMeta/);
  assert.match(
    conversationPanelSource,
    /:\s*hasConfirmedRootIntent\s*\?\s*\[\]\s*:\s*rootPromptSuggestions/s
  );
  assert.doesNotMatch(conversationPanelSource, /<ConfirmationCard/);
  assert.doesNotMatch(conversationPanelSource, /<CurrentTargetBanner/);
  assert.doesNotMatch(conversationPanelSource, /<IntentStatusCard/);
  assert.doesNotMatch(conversationPanelSource, /sidebar-focus/);
});

test("todo reflects the completed frontend framework, components, and mock flows", () => {
  assert.match(todo, /- \[x\] 接入 `React Flow`/);
  assert.match(todo, /- \[x\] 搭建 `Zustand` store/);
  assert.match(todo, /- \[x\] 定义服务端状态镜像结构/);
  assert.match(todo, /- \[x\] 定义本地 UI 状态结构/);
  assert.match(todo, /- \[x\] 实现 `TopBar`/);
  assert.match(todo, /- \[x\] 实现 `CanvasWorkspace`/);
  assert.match(todo, /- \[x\] 实现 `BrainstormNodeCard`/);
  assert.match(todo, /- \[x\] 实现 `ConversationPanel`/);
  assert.match(todo, /- \[x\] 实现 `RecordingBar`/);
  assert.match(todo, /- \[x\] 接通真实录音上传/);
  assert.match(todo, /- \[x\] 跑通后端集成测试/);
});

test("workbench defines an api client for live session state", () => {
  assert.match(apiSource, /class ApiClientError extends Error/);
  assert.match(apiSource, /code: string \| null/);
  assert.match(apiSource, /const DEFAULT_DEV_API_PORT = "8787"/);
  assert.match(apiSource, /function resolveApiBaseUrl\(\): string/);
  assert.match(
    apiSource,
    /window\.location\.protocol\}\x2f\x2f\$\{window\.location\.hostname\}:\$\{DEFAULT_DEV_API_PORT\}/
  );
  assert.match(apiSource, /createWorkbenchSession/);
  assert.match(apiSource, /loadWorkbenchSessionState/);
  assert.match(apiSource, /submitVoiceTurn/);
  assert.match(apiSource, /getGenerationTask/);
  assert.match(apiSource, /transcribeVoiceRecording/);
  assert.match(apiSource, /requestSessionUndo/);
  assert.match(apiSource, /\/api\/sessions/);
  assert.match(apiSource, /\/tree/);
  assert.match(apiSource, /\/messages/);
});

test("workbench store is live-api only and does not fall back to demo fixtures", () => {
  assert.equal(fs.existsSync(runtimeFixturesPath), false);
  assert.match(archivedFixturesSource, /workbenchFixtures/);
  assert.doesNotMatch(typesSource, /WorkbenchDataMode/);
  assert.doesNotMatch(typesSource, /WorkbenchScenarioId/);
  assert.doesNotMatch(typesSource, /fallback/);
  assert.match(storeSource, /initializeApiSession/);
  assert.match(storeSource, /const initialServerState/);
  assert.match(storeSource, /loadWorkbenchSessionState/);
  assert.match(storeSource, /submitVoiceTurn/);
  assert.match(storeSource, /createFreshApiSessionState/);
  assert.match(storeSource, /createOptimisticUserMessage/);
  const initializeBody =
    storeSource.match(/initializeApiSession: async \(\) => \{[\s\S]*?\n  \},\n  selectNode:/)?.[0] ?? "";
  assert.doesNotMatch(initializeBody, /submitVoiceTurnToApi/);
  assert.match(storeSource, /requestSessionUndo/);
  assert.doesNotMatch(storeSource, /fixtures/);
  assert.doesNotMatch(storeSource, /workbenchFixture/);
  assert.doesNotMatch(storeSource, /applyFixture/);
  assert.doesNotMatch(storeSource, /dataMode/);
  assert.doesNotMatch(storeSource, /fallback/);
  assert.doesNotMatch(storeSource, /Demo fixture/);
});

test("page initializes the live api session without exposing demo scenario controls", () => {
  assert.match(workbenchPageSource, /useEffect/);
  assert.match(workbenchPageSource, /initializeApiSession/);
  assert.match(workbenchPageSource, /startNewApiSession/);
  assert.match(workbenchPageSource, /onStartNewSession/);
  assert.doesNotMatch(workbenchPageSource, /workbenchScenarioOptions/);
  assert.doesNotMatch(workbenchPageSource, /onScenarioChange/);
  assert.doesNotMatch(topBarSource, /scenarios:/);
  assert.match(topBarSource, /onStartNewSession/);
  assert.match(topBarSource, /刷新/);
  assert.doesNotMatch(topBarSource, /登录/);
  assert.match(topBarSource, /PRODUCT_NAME/);
  assert.doesNotMatch(topBarSource, /Product-update/);
  assert.doesNotMatch(topBarSource, /onScenarioChange/);
  assert.doesNotMatch(topBarSource, /scenario-chip/);
  assert.doesNotMatch(topBarSource, /Demo fixture/);
  assert.doesNotMatch(topBarSource, /dataMode/);
});

test("workbench can explicitly start a fresh live api session for end-to-end testing", () => {
  assert.match(storeSource, /startNewApiSession: \(\) => Promise<void>/);
  assert.match(storeSource, /startNewApiSession: async \(\) => \{/);
  assert.match(storeSource, /createFreshApiSessionState/);
  assert.match(storeSource, /nodes: \[\]/);
  assert.match(storeSource, /messages: \[\]/);
  assert.match(storeSource, /generationTasks: \[\]/);
  assert.match(storeSource, /treeOperations: \[\]/);
  assert.match(globalsSource, /\.topbar-refresh/);
});

test("workbench only recovers when the backend session is actually missing", () => {
  assert.match(apiSource, /isSessionNotFoundError/);
  assert.match(apiSource, /SESSION_NOT_FOUND/);
  assert.match(storeSource, /recoverStaleApiSession/);
  assert.match(storeSource, /submitVoiceTurn\(transcriptText, true\)/);
  assert.match(storeSource, /submitAudioTurn\(audio, true\)/);
  assert.match(storeSource, /后端会话已重置/);
  assert.doesNotMatch(apiSource, /status >= 500/);
  assert.doesNotMatch(storeSource, /isApiConnectionInterruptedError/);
});

test("node selection falls back to the previous current node before using backend active node", () => {
  assert.match(storeSource, /function resolveCurrentNodeId/);
  assert.match(storeSource, /const previousCurrentNodeId = input\.previous\.currentNodeId/);
  assert.match(storeSource, /previousCurrentNodeId === input\.serverState\.session\.id/);
  assert.doesNotMatch(storeSource, /serverState\.session\.lastMentionedNodeId \?\?/);
  assert.match(
    storeSource,
    /currentNodeId,\s*recordingState:\s*"idle"/s
  );
});

test("task-resolved target nodes become the new current node selection when the user points to a node", () => {
  assert.match(storeSource, /function resolveTaskResolvedNodeId/);
  assert.match(storeSource, /input\.task\?\.targetNodeId/);
  assert.match(
    storeSource,
    /taskResolvedNodeId && visibleNodeIds\.has\(taskResolvedNodeId\)/
  );
  assert.match(storeSource, /if \(taskResolvedNodeId\) \{\s*return taskResolvedNodeId;\s*\}/s);
});

test("root node display is anchored to the first user transcript instead of the placeholder session goal", () => {
  assert.match(canvasWorkspaceSource, /serverState\.messages/);
  assert.match(canvasWorkspaceSource, /message\.role === "user"/);
  assert.match(canvasWorkspaceSource, /message\.kind === "transcript"/);
  assert.match(canvasWorkspaceSource, /intentSummary: resolveRootNodeIntentSummary/);
  assert.doesNotMatch(canvasWorkspaceSource, /intentSummary: serverState\.session\.goal/);
});

test("node selection updates the current target directly without a pending confirmation state", () => {
  assert.match(storeSource, /currentNodeId: nodeId/);
  assert.doesNotMatch(storeSource, /pendingAction/);
});

test("frontend shows the user bubble immediately and refreshes the canvas from the live api", () => {
  assert.match(storeSource, /createOptimisticUserMessage/);
  assert.match(storeSource, /messages: \[\.\.\.current\.serverState\.messages, optimisticUserMessage\]/);
  assert.doesNotMatch(storeSource, /previewNodes/);
  assert.match(storeSource, /isThinking: true/);
  assert.match(storeSource, /pollGenerationTask/);
  assert.match(storeSource, /await refreshApiState\(/);
});

test("frontend supports multiline text input without recycling the last transcript as placeholder", () => {
  assert.match(recordingBarSource, /<textarea/);
  assert.match(recordingBarSource, /setTextInput\(""\)/);
  assert.match(recordingBarSource, /const inputPlaceholder =/);
  assert.doesNotMatch(recordingBarSource, /placeholder=\{copy\.hint\}/);
  assert.match(globalsSource, /\.input-panel__text-input \{/);
  assert.match(globalsSource, /resize: none/);
  assert.match(globalsSource, /overflow-y: hidden/);
});

test("workbench avoids full session reloads when a lighter refresh is enough", () => {
  assert.match(apiSource, /loadWorkbenchMessages/);
  assert.match(apiSource, /loadWorkbenchTree/);
  assert.match(apiSource, /getGenerationTask/);
  assert.match(storeSource, /loadWorkbenchSessionState/);
  assert.doesNotMatch(storeSource, /loadWorkbenchMessages/);
  assert.doesNotMatch(storeSource, /loadWorkbenchTree/);
  assert.doesNotMatch(storeSource, /awaiting_confirmation/);
});

test("frontend no longer requests the removed session voice-turn polling endpoint", () => {
  assert.doesNotMatch(apiSource, /GET.*voice-turns/);
  assert.doesNotMatch(storeSource, /\/api\/sessions\/.*\/voice-turns/);
  assert.match(storeSource, /getGenerationTask/);
});

test("frontend undo sends the last client-tracked tree operation back to the api", () => {
  assert.match(storeSource, /findLastUndoableTreeOperation\(\s*state\.serverState\.treeOperations\s*\)/s);
  assert.match(
    storeSource,
    /requestSessionUndo\(\s*state\.uiState\.apiSessionId,\s*undoTarget\?\.id \?\? null,\s*undoTarget\?\.taskId \?\? null\s*\)/s
  );
  assert.match(apiSource, /operationId: operationId \?\? undefined/);
  assert.match(apiSource, /taskId: taskId \?\? undefined/);
});

test("toolbar supports global preview toggle, zoom controls, and zip export", () => {
  assert.match(canvasWorkspaceSource, /zoomOut\(\{ duration: 240 \}\)/);
  assert.match(canvasWorkspaceSource, /zoomIn\(\{ duration: 240 \}\)/);
  assert.match(canvasWorkspaceSource, /setViewport\(viewportSnapshotRef\.current, \{ duration: 360 \}\)/);
  assert.match(canvasWorkspaceSource, /fitView\(\{ padding: 0\.16, minZoom: 0\.34, maxZoom: 0\.82, duration: 420 \}\)/);
  assert.match(canvasWorkspaceSource, /disabled=\{isExporting \|\| serverState\.nodes\.every\(\(node\) => !node\.imageUrl\)\}/);
  assert.match(canvasWorkspaceSource, /panOnDrag/);
});

test("typed or transcribed undo commands bypass ai generation and call the undo api directly", () => {
  assert.match(storeSource, /function isUndoTranscript\(transcriptText: string\)/);
  assert.match(storeSource, /撤回上一步/);
  assert.match(storeSource, /撤销上一步/);
  const submitVoiceTurnStart = storeSource.indexOf(
    "submitVoiceTurn: async (transcriptText, recovered = false) => {"
  );
  const submitVoiceTurnEnd = storeSource.indexOf(
    "submitAudioTurn: async",
    submitVoiceTurnStart
  );
  const submitVoiceTurnBody =
    submitVoiceTurnStart >= 0 && submitVoiceTurnEnd > submitVoiceTurnStart
      ? storeSource.slice(submitVoiceTurnStart, submitVoiceTurnEnd)
      : "";
  const undoBranchBoundary = submitVoiceTurnBody.indexOf("const previousMessages");
  const submitVoiceTurnUndoPrefix =
    undoBranchBoundary > 0
      ? submitVoiceTurnBody.slice(0, undoBranchBoundary)
      : submitVoiceTurnBody;
  assert.match(
    submitVoiceTurnBody,
    /if \(isUndoTranscript\(trimmed\)\) \{\s*await get\(\)\.requestUndo\(\);\s*return;\s*\}/s
  );
  assert.doesNotMatch(
    submitVoiceTurnUndoPrefix,
    /submitVoiceTurnToApi/
  );
});

test("live workbench components derive node metadata from api data instead of fixtures", () => {
  assert.doesNotMatch(canvasWorkspaceSource, /fixture\.nodeUiMeta/);
  assert.doesNotMatch(conversationPanelSource, /fixture\.nodeUiMeta/);
  assert.doesNotMatch(conversationPanelSource, /messageDecorations/);
  assert.match(conversationPanelSource, /selectedNode \? \(/);
  assert.match(conversationPanelSource, /createNodeUiMeta\(selectedNode/);
});

test("todo reflects the first api integration slice", () => {
  assert.match(todo, /- \[x\] 用真实 API 替换 session mock/);
  assert.match(todo, /- \[x\] 用真实 API 替换 tree mock/);
  assert.match(todo, /- \[x\] 用真实 API 替换 message mock/);
  assert.match(todo, /- \[x\] 用真实 API 替换 task mock/);
  assert.match(todo, /- \[x\] 接通真实录音上传/);
});

test("workbench uploads real browser recordings through the api client", () => {
  assert.match(apiSource, /submitVoiceRecording/);
  assert.match(apiSource, /transcribeVoiceRecording/);
  assert.match(apiSource, /FormData/);
  assert.match(apiSource, /recording\.wav/);
  assert.match(storeSource, /submitAudioTurn/);
  assert.match(storeSource, /transcribeAudioTurn/);
  assert.match(storeSource, /liveTranscriptText/);
  assert.match(storeSource, /未识别到语音，请再试一次/);
  assert.match(storeSource, /transcript\.transcriptText\.trim\(\)\.length === 0/);
  assert.match(storeSource, /submitVoiceTurn\(transcript\.transcriptText/);
  assert.match(recordingBarSource, /AudioContext/);
  assert.match(recordingBarSource, /createScriptProcessor/);
  assert.match(recordingBarSource, /getChannelData/);
  assert.match(recordingBarSource, /audio\/wav/);
  assert.match(recordingBarSource, /keydown/);
  assert.match(recordingBarSource, /keyup/);
  assert.match(recordingBarSource, /event\.code === "Space"/);
  assert.match(recordingBarSource, /window\.addEventListener\("blur", handleWindowBlur\)/);
  assert.match(recordingBarSource, /isEditableTarget\(document\.activeElement\)/);
  assert.match(recordingBarSource, /按住空格正在录音/);
  assert.match(recordingBarSource, /正在转文字/);
  assert.match(recordingBarSource, /input-panel--recording/);
  assert.match(recordingBarSource, /mic-button--recording/);
  assert.match(recordingBarSource, /liveTranscriptText/);
  assert.match(recordingBarSource, /onRecordingComplete/);
  assert.match(recordingBarSource, /onTextSubmit/);
  assert.match(recordingBarSource, /useState/);
  assert.match(recordingBarSource, /value=\{textInput\}/);
  assert.match(recordingBarSource, /placeholder=/);
  assert.match(recordingBarSource, /handleTextSubmit/);
  assert.match(recordingBarSource, /event\.key === "Enter"/);
  assert.match(recordingBarSource, /submit-button/);
  assert.match(globalsSource, /\.input-panel--recording/);
  assert.match(globalsSource, /@keyframes recordingHalo/);
  assert.match(globalsSource, /\.mic-button--recording/);
});

test("direct execution removes awaiting confirmation state from the page store", () => {
  assert.doesNotMatch(storeSource, /derivePendingAction/);
  assert.doesNotMatch(storeSource, /awaiting_confirmation/);
  assert.match(intentStatusCardSource, /failedBranches/);
  assert.match(intentStatusCardSource, /部分分支失败/);
  assert.match(globalsSource, /\.branch-failure-summary/);
});

test("todo reflects recording upload and direct execution verification", () => {
  assert.match(todo, /- \[x\] 接通真实录音上传/);
  assert.match(todo, /- \[x\] 跑通后端集成测试/);
});
