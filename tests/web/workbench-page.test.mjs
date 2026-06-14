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
const fixturesSource = read("apps", "web", "src", "features", "workbench", "fixtures.ts");
const typesSource = read("apps", "web", "src", "features", "workbench", "types.ts");
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
const canvasWorkspaceSource = read(
  "apps",
  "web",
  "src",
  "features",
  "workbench",
  "components",
  "CanvasWorkspace.tsx"
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

test("frontend workbench defines server mirror and local ui state structures", () => {
  assert.match(typesSource, /type WorkbenchServerState =/);
  assert.match(typesSource, /type WorkbenchUiState =/);
  assert.match(typesSource, /type WorkbenchFixture =/);
  assert.match(fixturesSource, /workbenchFixtures: WorkbenchFixture\[]/);
});

test("conversation panel keeps collapsible system logs and confirmation flow", () => {
  assert.match(conversationPanelSource, /<details className="system-log" open=\{isExpanded\}>/);
  assert.match(conversationPanelSource, /<CurrentTargetBanner/);
  assert.match(conversationPanelSource, /<IntentStatusCard/);
  assert.match(conversationPanelSource, /<ConfirmationCard/);
  assert.match(conversationPanelSource, /<RecordingBar/);
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
  assert.match(apiSource, /createWorkbenchSession/);
  assert.match(apiSource, /loadWorkbenchSessionState/);
  assert.match(apiSource, /submitVoiceTurn/);
  assert.match(apiSource, /confirmGenerationTask/);
  assert.match(apiSource, /cancelGenerationTask/);
  assert.match(apiSource, /requestSessionUndo/);
  assert.match(apiSource, /\/api\/sessions/);
  assert.match(apiSource, /\/tree/);
  assert.match(apiSource, /\/messages/);
});

test("workbench store loads live api state by default while retaining fixture fallback", () => {
  assert.match(typesSource, /type WorkbenchDataMode = "api" \| "fixture"/);
  assert.match(storeSource, /initializeApiSession/);
  assert.match(storeSource, /loadWorkbenchSessionState/);
  assert.match(storeSource, /submitVoiceTurn/);
  assert.match(storeSource, /confirmGenerationTask/);
  assert.match(storeSource, /cancelGenerationTask/);
  assert.match(storeSource, /requestSessionUndo/);
  assert.match(storeSource, /dataMode: "api"/);
  assert.match(storeSource, /dataMode: "fixture"/);
});

test("page initializes the live api session and keeps demo scenarios available", () => {
  assert.match(pageSource, /useEffect/);
  assert.match(pageSource, /initializeApiSession/);
  assert.match(pageSource, /workbenchScenarioOptions/);
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
  assert.match(apiSource, /FormData/);
  assert.match(apiSource, /recording\.webm/);
  assert.match(storeSource, /submitAudioTurn/);
  assert.match(recordingBarSource, /MediaRecorder/);
  assert.match(recordingBarSource, /onRecordingComplete/);
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
