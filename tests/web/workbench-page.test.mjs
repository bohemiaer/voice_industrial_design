import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts) =>
  fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

const gitignore = read(".gitignore");
const pageSource = read("apps", "web", "src", "app", "page.tsx");
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

test("workbench page is composed from dedicated frontend components", () => {
  assert.match(pageSource, /^"use client";/m);
  assert.match(pageSource, /ReactFlowProvider/);
  assert.match(pageSource, /<TopBar/);
  assert.match(pageSource, /<CanvasWorkspace/);
  assert.match(pageSource, /<ConversationPanel/);
});

test("frontend workbench uses react flow and zustand", () => {
  assert.match(webPackage, /"dev": "next dev --turbo -H 127\.0\.0\.1"/);
  assert.match(webPackage, /"@xyflow\/react"/);
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

test("canvas lays out generated nodes as a vertical tree without obsolete toolbar entries", () => {
  assert.match(canvasWorkspaceSource, /useReactFlow/);
  assert.match(canvasWorkspaceSource, /flowNodeIds/);
  assert.match(canvasWorkspaceSource, /fitView\(\{ padding: 0\.2, minZoom: 0\.48, maxZoom: 0\.88, duration: 420 \}\)/);
  assert.match(canvasWorkspaceSource, /const rootNode/);
  assert.match(canvasWorkspaceSource, /id: serverState\.session\.id/);
  assert.match(canvasWorkspaceSource, /parentNodeId: node\.parentNodeId \?\? serverState\.session\.id/);
  assert.match(canvasWorkspaceSource, /sourcePosition: Position\.Bottom/);
  assert.match(canvasWorkspaceSource, /targetPosition: Position\.Top/);
  assert.match(nodeCardSource, /type="target" position=\{Position\.Top\}/);
  assert.match(nodeCardSource, /type="source"\s+position=\{Position\.Bottom\}/);
  assert.match(nodeCardSource, /node-card__empty-prompts/);
  assert.match(nodeCardSource, /node-card__requirement-text/);
  assert.match(nodeCardSource, /node\.intentSummary/);
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
  assert.match(canvasWorkspaceSource, /selectionCursor/);
  assert.match(uiMetaSource, /const nodeVerticalGap = 440/);
  assert.match(uiMetaSource, /ordinal - \(layerCount \+ 1\) \/ 2/);
  assert.match(uiMetaSource, /y: nodeOrigin\.y \+ depth \* nodeVerticalGap/);
});

test("frontend workbench defines server mirror and local ui state structures", () => {
  assert.match(typesSource, /type WorkbenchServerState =/);
  assert.match(typesSource, /type WorkbenchUiState =/);
  assert.doesNotMatch(typesSource, /WorkbenchFixture/);
});

test("conversation panel keeps only the message stream and recording input", () => {
  assert.match(conversationPanelSource, /<details className="system-log" open=\{isExpanded\}>/);
  assert.match(conversationPanelSource, /<RecordingBar/);
  assert.match(conversationPanelSource, /useEffect/);
  assert.match(conversationPanelSource, /useRef/);
  assert.match(conversationPanelSource, /scrollTop = scrollRegionRef\.current\.scrollHeight/);
  assert.match(conversationPanelSource, /onRecordingComplete=\{submitAudioTurn\}/);
  assert.match(conversationPanelSource, /onTextSubmit=\{submitVoiceTurn\}/);
  assert.match(conversationPanelSource, /thinkingMessage/);
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
  assert.match(todo, /- \[x\] 实现 `CurrentTargetBanner`/);
  assert.match(todo, /- \[x\] 实现 `RecordingBar`/);
  assert.match(todo, /- \[x\] 实现 `IntentStatusCard`/);
  assert.match(todo, /- \[x\] 实现 `ConfirmationCard`/);
  assert.match(todo, /- \[x\] 用 mock 数据跑通单次撤销页面/);
  assert.match(todo, /- \[x\] 准备演示用 fixture：首层 4 个方向、下钻 3 个方向、刷新当前层结果/);
});

test("workbench defines an api client for live session state", () => {
  assert.match(apiSource, /class ApiClientError extends Error/);
  assert.match(apiSource, /code: string \| null/);
  assert.match(apiSource, /DEFAULT_DEV_API_BASE_URL = "http:\/\/localhost:8787"/);
  assert.match(apiSource, /createWorkbenchSession/);
  assert.match(apiSource, /loadWorkbenchSessionState/);
  assert.match(apiSource, /submitVoiceTurn/);
  assert.match(apiSource, /transcribeVoiceRecording/);
  assert.match(apiSource, /confirmGenerationTask/);
  assert.match(apiSource, /cancelGenerationTask/);
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
  assert.match(storeSource, /confirmGenerationTask/);
  assert.match(storeSource, /cancelGenerationTask/);
  assert.match(storeSource, /requestSessionUndo/);
  assert.doesNotMatch(storeSource, /fixtures/);
  assert.doesNotMatch(storeSource, /workbenchFixture/);
  assert.doesNotMatch(storeSource, /applyFixture/);
  assert.doesNotMatch(storeSource, /dataMode/);
  assert.doesNotMatch(storeSource, /fallback/);
  assert.doesNotMatch(storeSource, /Demo fixture/);
});

test("page initializes the live api session without exposing demo scenario controls", () => {
  assert.match(pageSource, /useEffect/);
  assert.match(pageSource, /initializeApiSession/);
  assert.match(pageSource, /startNewApiSession/);
  assert.match(pageSource, /onStartNewSession/);
  assert.doesNotMatch(pageSource, /workbenchScenarioOptions/);
  assert.doesNotMatch(pageSource, /onScenarioChange/);
  assert.doesNotMatch(topBarSource, /scenarios:/);
  assert.match(topBarSource, /onStartNewSession/);
  assert.match(topBarSource, /重新开始测试/);
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
  assert.match(globalsSource, /\.topbar-reset/);
});

test("workbench recovers from stale in-memory api sessions after backend restart", () => {
  assert.match(apiSource, /isSessionNotFoundError/);
  assert.match(apiSource, /isApiConnectionInterruptedError/);
  assert.match(apiSource, /SESSION_NOT_FOUND/);
  assert.match(apiSource, /status >= 500/);
  assert.match(apiSource, /code === null/);
  assert.match(storeSource, /recoverStaleApiSession/);
  assert.match(storeSource, /isApiConnectionInterruptedError/);
  assert.match(storeSource, /submitVoiceTurn\(transcriptText, true\)/);
  assert.match(storeSource, /submitAudioTurn\(audio, true\)/);
  assert.match(storeSource, /后端会话已重置/);
});

test("root selection is preserved after branch generation instead of drifting to the last mentioned node", () => {
  assert.match(storeSource, /previousSelectedNodeId === serverState\.session\.id/);
  assert.doesNotMatch(storeSource, /serverState\.session\.lastMentionedNodeId \?\?/);
});

test("frontend shows the user bubble immediately and waits for confirmation before canvas mutation", () => {
  assert.match(storeSource, /createOptimisticUserMessage/);
  assert.match(storeSource, /messages: \[\.\.\.current\.serverState\.messages, optimisticUserMessage\]/);
  assert.match(storeSource, /createThinkingMessage/);
  assert.match(storeSource, /content: "思考中\.\.\."/);
  assert.doesNotMatch(storeSource, /previewNodes/);
  assert.match(storeSource, /pendingAction: derivePendingAction\(input\.task\)/);
});

test("frontend supports confirm-by-text and multiline input without recycling the last transcript as placeholder", () => {
  assert.match(storeSource, /isConfirmationText\(trimmed\)/);
  assert.match(storeSource, /confirmPendingAction\(trimmed\)/);
  assert.match(storeSource, /createOptimisticUserMessage\(\s*state\.uiState\.apiSessionId,\s*confirmationText\s*\)/s);
  assert.match(storeSource, /messages: \[\.\.\.current\.serverState\.messages, optimisticUserMessage\]/);
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
  assert.match(storeSource, /loadWorkbenchMessages/);
  assert.match(storeSource, /loadWorkbenchTree/);
  assert.match(storeSource, /task\.status === "awaiting_confirmation"/);
  assert.match(storeSource, /return \{\s*session: input\.current\.session/s);
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
  assert.match(todo, /- \[x\] 接通 confirm \/ cancel \/ undo/);
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
  assert.match(recordingBarSource, /按住空格正在录音/);
  assert.match(recordingBarSource, /正在转文字/);
  assert.match(recordingBarSource, /liveTranscriptText/);
  assert.match(recordingBarSource, /onRecordingComplete/);
  assert.match(recordingBarSource, /onTextSubmit/);
  assert.match(recordingBarSource, /useState/);
  assert.match(recordingBarSource, /value=\{textInput\}/);
  assert.match(recordingBarSource, /placeholder=/);
  assert.match(recordingBarSource, /handleTextSubmit/);
  assert.match(recordingBarSource, /event\.key === "Enter"/);
  assert.match(recordingBarSource, /submit-button/);
});

test("awaiting confirmation and partial branch failures are visible in the page state", () => {
  assert.match(storeSource, /derivePendingAction/);
  assert.match(storeSource, /status !== "awaiting_confirmation"/);
  assert.match(intentStatusCardSource, /failedBranches/);
  assert.match(intentStatusCardSource, /部分分支失败/);
  assert.match(globalsSource, /\.branch-failure-summary/);
});

test("todo reflects recording upload and confirmation/failure verification", () => {
  assert.match(todo, /- \[x\] 接通真实录音上传/);
  assert.match(todo, /- \[x\] 确认 `awaiting_confirmation` 页面状态正确/);
  assert.match(todo, /- \[x\] 确认 branch 部分失败可以正确展示/);
});
