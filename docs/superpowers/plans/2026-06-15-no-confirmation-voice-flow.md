# No-Confirmation Voice Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove confirmation from the main voice workflow, make node/branch defaults deterministic, and align docs/tests with the new 6-round execution flow.

**Architecture:** Move execution to a direct `voice-turn -> persist tree` path on the server, reuse `session.activeNodeId` as the last executed target node, and remove confirmation-driven UI state from the web app. Keep compatibility fields and routes in place for now, but stop using them in the product flow and update tests/docs to the new rules.

**Tech Stack:** Fastify, TypeScript, Next.js, Zustand, Zod, node:test

---

## File Map

- Modify: `apps/server/src/orchestrator/service.ts`
  Responsibility: direct execution flow, target-node resolution, selection-only handling
- Modify: `apps/server/src/agents/mock.ts`
  Responsibility: mock action inference defaults and direct-execution copy
- Modify: `apps/server/src/agents/siliconflow.ts`
  Responsibility: prompt instructions for default count and no-confirmation behavior
- Modify: `apps/server/src/repositories/types.ts`
  Responsibility: session update semantics if needed by direct execution flow
- Modify: `apps/server/src/repositories/memory.ts`
  Responsibility: task persistence defaults and session active-node updates
- Modify: `apps/server/src/repositories/drizzle.ts`
  Responsibility: same behavior as memory repository
- Modify: `apps/server/src/routes/tasks.ts`
  Responsibility: keep or soften confirm/cancel compatibility surface
- Modify: `apps/web/src/features/workbench/store.ts`
  Responsibility: remove pending confirmation workflow from the main client path
- Modify: `apps/web/src/features/workbench/api.ts`
  Responsibility: stop using confirm/cancel from the main flow, keep undo and voice-turn calls
- Modify: `apps/web/src/features/workbench/types.ts`
  Responsibility: remove or reduce pending action types
- Modify: `apps/web/src/features/workbench/components/ConversationPanel.tsx`
  Responsibility: remove confirmation-card-driven rendering from the main flow
- Modify: `apps/web/src/features/workbench/components/CanvasWorkspace.tsx`
  Responsibility: keep target highlighting consistent with the new active-node semantics
- Modify or delete: `apps/web/src/features/workbench/components/ConfirmationCard.tsx`
  Responsibility: no longer part of the product flow
- Modify: `tests/server/api.test.mjs`
  Responsibility: cover direct execution, default target carry-over, default branch count, selection-only behavior, undo
- Modify: `tests/web/workbench-page.test.mjs`
  Responsibility: remove confirmation assumptions and assert new workflow structure
- Modify: `docs/superpowers/specs/测试文档.md`
  Responsibility: rewrite product E2E cases to the new 6-round chain

## Task 1: Convert Server Voice Turns To Direct Execution

**Files:**
- Modify: `apps/server/src/orchestrator/service.ts`
- Test: `tests/server/api.test.mjs`

- [ ] **Step 1: Write the failing test for direct execution**

Add a server test that proves a `voice-turn` no longer waits for confirmation:

```js
test("voice turn executes immediately without confirmation", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "咖啡机脑暴",
      goal: "探索适合家庭厨房和小型办公室使用的咖啡机方向"
    }
  });
  const { session } = createSessionResponse.json();

  const turnResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    }
  });

  assert.equal(turnResponse.statusCode, 202);
  assert.equal(turnResponse.json().task.status, "completed");
  assert.equal(turnResponse.json().task.confirmationRequired, false);

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  assert.equal(treeResponse.json().nodes.length, 4);

  await app.close();
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --test tests/server/api.test.mjs`

Expected: FAIL because the current implementation returns `awaiting_confirmation` and does not write tree nodes immediately.

- [ ] **Step 3: Implement direct execution in the orchestrator**

Update `processVoiceTurn` so it creates the task, writes user/assistant messages, creates branch tasks, and immediately calls `persistGeneratedBranches(...)` instead of waiting for `confirmTask`.

Key implementation shape:

```ts
const task = await services.repositories.generationTasks.create({
  sessionId: session.id,
  targetNodeId: assistantOutput.targetNodeId,
  actionType: assistantOutput.actionType,
  branchCount: assistantOutput.branchCount,
  transcriptText: transcript.transcriptText,
  designIntentSummary: assistantOutput.designIntentSummary,
  assistantReply: assistantOutput.assistantReply,
  confirmationRequired: false,
  rewrittenIntentForConfirmation: null
});

await services.repositories.messages.create({
  sessionId: session.id,
  taskId: task.id,
  role: "user",
  kind: "transcript",
  content: transcript.transcriptText
});

await services.repositories.messages.create({
  sessionId: session.id,
  taskId: task.id,
  role: "assistant",
  kind: "summary",
  content: assistantOutput.assistantReply
});

return persistGeneratedBranches({
  services,
  agentGateway,
  session,
  task: {
    ...task,
    branchTasks: persistedBranchTasks
  },
  targetNode: targetContext.targetNode,
  treeNodes,
  actionType: task.actionType,
  briefs: persistedBranchTasks.map((branchTask) => branchTask.brief)
});
```

- [ ] **Step 4: Run the targeted test to verify it passes**

Run: `node --test tests/server/api.test.mjs`

Expected: PASS for the new direct-execution test.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/service.ts tests/server/api.test.mjs
git commit -m "refactor: execute voice turns without confirmation"
```

## Task 2: Enforce Default Target And Default Count Rules

**Files:**
- Modify: `apps/server/src/orchestrator/service.ts`
- Modify: `apps/server/src/agents/mock.ts`
- Modify: `apps/server/src/agents/siliconflow.ts`
- Modify: `apps/server/src/repositories/memory.ts`
- Modify: `apps/server/src/repositories/drizzle.ts`
- Test: `tests/server/api.test.mjs`

- [ ] **Step 1: Write failing tests for target carry-over and default count**

Add tests for:

```js
test("voice turn without explicit target reuses the last executed target node", async () => {
  // create session, execute first layer, execute branch_deeper on node 2
  // then issue "刷新当前层，更轻薄一点" with targetNodeId null
  // assert refresh task targets node 2's second layer context
});

test("voice turn defaults to 3 branches when transcript does not specify a count", async () => {
  // issue a turn without number words
  // assert task.branchCount === 3
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `node --test tests/server/api.test.mjs`

Expected: FAIL because the current server defaults and selection behavior do not follow the new rules.

- [ ] **Step 3: Implement the target carry-over rule**

Use `session.activeNodeId` as the last executed target node and update `resolveTargetContext(...)`:

```ts
const selectedNodeId =
  referencedTargetNodeId ??
  requestedTargetNodeId ??
  session.activeNodeId ??
  session.id;
```

Update session state only after successful tree persistence:

```ts
await input.services.repositories.sessions.updateAfterNodesCreated({
  sessionId: input.session.id,
  goal: input.task.designIntentSummary,
  nextPublicNodeNumber: firstPublicNodeNumber + nodes.length,
  activeNodeId: input.task.targetNodeId,
  lastMentionedNodeId: nodes.at(-1)?.id ?? null
});
```

- [ ] **Step 4: Implement the default count rule in mock and SiliconFlow prompt**

In `apps/server/src/agents/mock.ts`, make unspecified quantity resolve to `3`.

Target implementation shape:

```ts
function resolveBranchCount(
  transcriptText: string,
  constraints: BrainstormAssistantInput["constraints"]
): number {
  const parsed = parseBranchCountFromTranscript(transcriptText);

  if (parsed !== null) {
    return clamp(parsed, constraints.minBranchCount, constraints.maxBranchCount);
  }

  return clamp(3, constraints.minBranchCount, constraints.maxBranchCount);
}
```

In `apps/server/src/agents/siliconflow.ts`, replace the old confirmation instruction with:

```ts
"若用户没有明确说数量，则 branchCount 默认输出 3。",
"默认直接执行，不要把所有输入都标记为需要确认。"
```

- [ ] **Step 5: Run the targeted tests to verify they pass**

Run: `node --test tests/server/api.test.mjs`

Expected: PASS for target carry-over and default-count tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/orchestrator/service.ts apps/server/src/agents/mock.ts apps/server/src/agents/siliconflow.ts apps/server/src/repositories/memory.ts apps/server/src/repositories/drizzle.ts tests/server/api.test.mjs
git commit -m "feat: apply default target and default branch count rules"
```

## Task 3: Fix Voice Node Selection To Be Selection-Only

**Files:**
- Modify: `apps/server/src/orchestrator/service.ts`
- Modify: `apps/web/src/features/workbench/store.ts`
- Test: `tests/server/api.test.mjs`
- Test: `tests/web/workbench-page.test.mjs`

- [ ] **Step 1: Write the failing tests for selection-only behavior**

Add tests asserting `选择 2 号节点` does not create a generation task:

```js
test("selection transcript updates the active node without creating branches", async () => {
  // create 4 root nodes first
  // send "选择 2 号节点"
  // assert task.actionType is not expand_branches
  // assert tree is unchanged
  // assert a follow-up turn without explicit target uses node 2
});
```

And a web-source assertion that the store exposes selection updates without confirmation flow:

```js
test("workbench keeps current target in local state without confirmation card flow", () => {
  assert.doesNotMatch(storeSource, /pendingAction/);
  assert.match(storeSource, /selectedNodeId/);
  assert.match(storeSource, /currentTargetNodeId/);
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `node --test tests/server/api.test.mjs tests/web/workbench-page.test.mjs`

Expected: FAIL because current selection text still enters the generation flow.

- [ ] **Step 3: Implement selection-only transcript handling**

In `processVoiceTurn`, short-circuit node-selection transcripts before calling the agent:

```ts
const selectionNodeId = resolveReferencedTargetNodeId(
  transcript.transcriptText,
  treeNodes
);

if (isSelectionIntent(transcript.transcriptText) && selectionNodeId) {
  await services.repositories.sessions.updateAfterNodesCreated({
    sessionId: session.id,
    nextPublicNodeNumber: session.nextPublicNodeNumber,
    activeNodeId: selectionNodeId,
    lastMentionedNodeId: selectionNodeId
  });

  await services.repositories.messages.create({
    sessionId: session.id,
    taskId: null,
    role: "user",
    kind: "transcript",
    content: transcript.transcriptText
  });

  await services.repositories.messages.create({
    sessionId: session.id,
    taskId: null,
    role: "assistant",
    kind: "summary",
    content: "已切换当前目标节点。"
  });

  return createSelectionTaskLikeResult(...);
}
```

Keep the return shape compatible with the existing API contract, but ensure no branch tasks are created and no tree nodes are persisted.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `node --test tests/server/api.test.mjs tests/web/workbench-page.test.mjs`

Expected: PASS for selection-only tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/service.ts apps/web/src/features/workbench/store.ts tests/server/api.test.mjs tests/web/workbench-page.test.mjs
git commit -m "fix: treat node selection as target switching only"
```

## Task 4: Remove Confirmation-Driven Web State And UI

**Files:**
- Modify: `apps/web/src/features/workbench/store.ts`
- Modify: `apps/web/src/features/workbench/types.ts`
- Modify: `apps/web/src/features/workbench/api.ts`
- Modify: `apps/web/src/features/workbench/components/ConversationPanel.tsx`
- Modify or delete: `apps/web/src/features/workbench/components/ConfirmationCard.tsx`
- Test: `tests/web/workbench-page.test.mjs`

- [ ] **Step 1: Write the failing web assertions**

Replace old confirmation-driven expectations with direct-flow expectations:

```js
test("workbench no longer renders confirmation-card driven action flow", () => {
  assert.doesNotMatch(conversationPanelSource, /ConfirmationCard/);
  assert.doesNotMatch(storeSource, /confirmPendingAction/);
  assert.doesNotMatch(storeSource, /cancelPendingAction/);
  assert.doesNotMatch(storeSource, /pendingAction/);
});
```

- [ ] **Step 2: Run the web test to verify it fails**

Run: `corepack pnpm test:web`

Expected: FAIL because the store and panel still contain confirmation flow code.

- [ ] **Step 3: Remove confirmation state and calls from the client**

Target changes:

```ts
type WorkbenchStore = {
  // remove confirmPendingAction and cancelPendingAction
};
```

```ts
type WorkbenchUiState = {
  selectedNodeId: string;
  apiSessionId: string | null;
  apiStatus: "idle" | "loading" | "ready" | "error";
  apiError: string | null;
  expandedSystemMessageIds: string[];
  recordingState: RecordingState;
  liveTranscriptText: string | null;
  currentTargetNodeId: string | null;
  lastActionSummary: string | null;
  isThinking: boolean;
};
```

In `submitVoiceTurn(...)`, refresh tree/messages after the direct-complete task comes back and update `currentTargetNodeId` from the selected/active node rather than pending confirmation state.

- [ ] **Step 4: Run the web test to verify it passes**

Run: `corepack pnpm test:web`

Expected: PASS with no confirmation-flow assertions remaining.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/workbench/store.ts apps/web/src/features/workbench/types.ts apps/web/src/features/workbench/api.ts apps/web/src/features/workbench/components/ConversationPanel.tsx apps/web/src/features/workbench/components/ConfirmationCard.tsx tests/web/workbench-page.test.mjs
git commit -m "refactor: remove confirmation flow from workbench ui"
```

## Task 5: Rewrite The Test Spec To The New 6-Round Chain

**Files:**
- Modify: `docs/superpowers/specs/测试文档.md`

- [ ] **Step 1: Rewrite the E2E sequence**

Replace the current E2E sections with the new chain:

```md
### TC-E2E-002 六轮主链路

第 1 轮：首轮输入需求
第 2 轮：基于节点 2 下钻到第二层级扩展
第 3 轮：刷新第二层级当前目标节点
第 4 轮：对第一层级节点 3 下钻扩展
第 5 轮：对节点 3 的第二层级第 1 个节点继续扩展
第 6 轮：撤回上一轮
```

- [ ] **Step 2: Document the default rules explicitly**

Add a rules subsection:

```md
### 默认规则

1. 若输入未提节点，则沿用上一轮实际执行时的目标节点。
2. 若输入未提数量，则默认生成 3 个方向。
3. 若当前会话尚无已执行树操作，则默认根节点。
```

- [ ] **Step 3: Remove confirmation/cancel acceptance language from the product flow**

Delete or rewrite references to:

```md
ConfirmationCard
POST /api/tasks/{taskId}/confirm
POST /api/tasks/{taskId}/cancel
awaiting_confirmation
confirmationStatus
```

Keep undo coverage and note that confirm/cancel remain only as compatibility APIs if you mention them at all.

- [ ] **Step 4: Review the document for contradictions**

Run a manual scan for mismatches between:

- branch count defaults
- target-node carry-over
- six-round chain
- no-confirmation execution

Expected: no references left that say “all high-risk actions require confirmation” in the product-flow section.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/测试文档.md
git commit -m "docs: rewrite test spec for direct voice execution flow"
```

## Task 6: Run Full Verification And Manual E2E

**Files:**
- Modify if needed: any files required to fix regressions found by verification

- [ ] **Step 1: Run server and web automated verification**

Run:

```bash
corepack pnpm test:server
corepack pnpm test:web
```

Expected: all tests pass.

- [ ] **Step 2: Run full repository verification**

Run:

```bash
corepack pnpm test
```

Expected: all listed workspace, preview, shared, and server tests pass.

- [ ] **Step 3: Run the six-round manual E2E flow**

Use a local server instance and record:

1. input text
2. actual target node id
3. actual branch count
4. action type
5. tree state after each round

Required manual flow:

```text
1. 首轮输入需求
2. 基于节点 2 进行下钻到第二层级扩展
3. 第二层级节点刷新
4. 第一层级节点 3 下钻扩展
5. 节点 3 的第二层级第 1 个节点扩展
6. 撤回
```

- [ ] **Step 4: Fix any regressions found, then re-run verification**

Run again:

```bash
corepack pnpm test:server
corepack pnpm test:web
corepack pnpm test
```

Expected: all pass after fixes.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: verify direct voice flow end to end"
```

## Self-Review

- Spec coverage checked:
  - no-confirmation main flow: covered by Tasks 1 and 4
  - default target carry-over: covered by Task 2
  - default branch count 3: covered by Task 2
  - node selection fix: covered by Task 3
  - six-round test doc rewrite: covered by Task 5
  - automated + manual verification: covered by Task 6
- Placeholder scan:
  - no `TODO`, `TBD`, or “implement later” placeholders remain
- Type consistency:
  - plan consistently uses `activeNodeId` as the carry-over target source
  - confirmation state is removed from the product flow but left compatible at the route/schema level for now
