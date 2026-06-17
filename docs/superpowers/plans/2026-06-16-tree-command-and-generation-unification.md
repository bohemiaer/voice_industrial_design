# Tree Command And Generation Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the voice workbench around `diverge / refresh / delete / undo / redo`, replace confirmation-driven flow with a turn planner, and make refresh operate on the latest generated child group for the current node.

**Architecture:** Keep the public session voice-turn API shape stable, but normalize all turns through a server-side planner that routes generation intents to the agent pipeline and tree commands to a direct tree-operation executor. Persist child-group facts and split session target state into `currentSelectedNodeId` and `lastExecutedTargetNodeId`, while the frontend consumes the new task/tree semantics and blocks input during in-flight generation.

**Tech Stack:** TypeScript, Fastify, Zod, Zustand, React, Node test, in-memory repository plus Drizzle-backed repository compatibility.

---

### Task 1: Align Shared Constants And Schemas

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `tests/workspace/shared-schema.test.mjs`

- [ ] **Step 1: Write the failing shared schema test for the new action and session fields**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  GenerationTaskSchema,
  SessionSchema,
  TreeOperationSchema
} from "@voice-industrial-design/shared";

test("shared schemas accept unified turn-planner fields", () => {
  const session = SessionSchema.parse({
    id: "session-1",
    title: "Tree planner",
    goal: "Unify workbench flow",
    productDomain: "industrial_design",
    currentSelectedNodeId: "session-1",
    lastExecutedTargetNodeId: "session-1",
    pendingNodeId: null,
    lastMentionedNodeId: null,
    nextPublicNodeNumber: 4,
    createdAt: "2026-06-16T00:00:00.000+08:00",
    updatedAt: "2026-06-16T00:00:00.000+08:00"
  });

  const task = GenerationTaskSchema.parse({
    id: "task-1",
    sessionId: "session-1",
    actionType: "diverge",
    targetNodeId: "session-1",
    status: "queued",
    branchCount: 3,
    transcriptText: "先发散三个方向",
    designIntentSummary: "diverge root node",
    branchTasks: [],
    createdAt: "2026-06-16T00:00:00.000+08:00",
    updatedAt: "2026-06-16T00:00:00.000+08:00"
  });

  const operation = TreeOperationSchema.parse({
    id: "op-1",
    sessionId: "session-1",
    taskId: "task-1",
    type: "refresh",
    targetNodeId: "node-2",
    targetLayerVersion: 2,
    affectedChildGroupId: "group-2",
    insertedNodeIds: ["node-7", "node-8", "node-9"],
    deletedNodeIds: [],
    supersededNodeIds: ["node-4", "node-5", "node-6"],
    restoredNodeIds: [],
    undoOfOperationId: null,
    redoOfOperationId: null,
    payload: { branchCount: 3 },
    createdAt: "2026-06-16T00:00:00.000+08:00"
  });

  assert.equal(session.currentSelectedNodeId, "session-1");
  assert.equal(task.actionType, "diverge");
  assert.equal(operation.affectedChildGroupId, "group-2");
});
```

- [ ] **Step 2: Run the shared schema test to verify it fails**

Run: `node --test tests/workspace/shared-schema.test.mjs`

Expected: FAIL because `diverge`, `refresh`, `delete`, `redo`, `currentSelectedNodeId`, `lastExecutedTargetNodeId`, and the new tree-operation fields are not yet valid in shared schemas.

- [ ] **Step 3: Update constants and schemas to the unified terminology**

```ts
export const BRAINSTORM_ACTION_TYPE = ["diverge", "refresh"] as const;

export const TREE_OPERATION_TYPE = [
  "diverge",
  "refresh",
  "delete",
  "undo",
  "redo"
] as const;

export const TASK_STATUS = [
  "queued",
  "transcribing",
  "reasoning",
  "generating",
  "completed",
  "failed",
  "cancelled"
] as const;
```

```ts
export const SessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  productDomain: ProductDomainSchema,
  currentSelectedNodeId: z.string().min(1).nullable(),
  lastExecutedTargetNodeId: z.string().min(1).nullable(),
  pendingNodeId: z.string().min(1).nullable(),
  lastMentionedNodeId: z.string().min(1).nullable(),
  nextPublicNodeNumber: z.number().int().positive(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema
});
```

```ts
export const TreeOperationSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().min(1).nullable(),
  type: TreeOperationTypeSchema,
  targetNodeId: z.string().min(1),
  targetLayerVersion: z.number().int().positive().nullable(),
  affectedChildGroupId: z.string().min(1).nullable(),
  insertedNodeIds: z.array(z.string().min(1)),
  deletedNodeIds: z.array(z.string().min(1)),
  supersededNodeIds: z.array(z.string().min(1)),
  restoredNodeIds: z.array(z.string().min(1)),
  undoOfOperationId: z.string().min(1).nullable(),
  redoOfOperationId: z.string().min(1).nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: IsoDateTimeSchema
});
```

- [ ] **Step 4: Run the shared schema test to verify it passes**

Run: `node --test tests/workspace/shared-schema.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/schemas.ts packages/shared/src/index.ts tests/workspace/shared-schema.test.mjs
git commit -m "refactor: align shared tree command schemas"
```

### Task 2: Introduce Server Turn Planner And Intent Routing

**Files:**
- Modify: `apps/server/src/orchestrator/service.ts`
- Modify: `apps/server/src/routes/sessions.ts`
- Modify: `apps/server/src/routes/tasks.ts`
- Test: `tests/server/api.test.mjs`

- [ ] **Step 1: Write the failing API tests for turn routing and busy-session protection**

```js
test("voice turn routes delete to tree command execution instead of generation", async () => {
  const response = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "删除节点 2",
      targetNodeId: null
    }
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.json().task, null);
  assert.equal(response.json().operation.type, "delete");
});

test("server rejects new commands while generation is in flight", async () => {
  const response = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "继续发散",
      targetNodeId: null
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "SESSION_BUSY");
});
```

- [ ] **Step 2: Run the server API test file to verify it fails**

Run: `node --test --test-concurrency=1 tests/server/api.test.mjs`

Expected: FAIL because the current route always returns a generation task and has no busy-session guard or tree-command routing.

- [ ] **Step 3: Add a planned-turn result and route commands before generation**

```ts
type TurnIntent = "diverge" | "refresh" | "delete" | "undo" | "redo";

type PlannedTurn =
  | {
      kind: "generation";
      intentType: "diverge" | "refresh";
      effectiveTargetNodeId: string;
      explicitBranchCount: number | null;
      targetChildGroupId: string | null;
    }
  | {
      kind: "tree_command";
      intentType: "delete" | "undo" | "redo";
      effectiveTargetNodeId: string;
    };
```

```ts
const plannedTurn = planVoiceTurn({
  session,
  treeNodes,
  transcriptText: transcript.transcriptText,
  requestedTargetNodeId: input.targetNodeId
});

if (plannedTurn.kind === "tree_command") {
  return executeTreeCommand({
    plannedTurn,
    services,
    session,
    treeNodes
  });
}
```

```ts
if (await hasInFlightGenerationTask(session.id)) {
  throw new ApiError(409, "SESSION_BUSY", "Another generation task is still running");
}
```

- [ ] **Step 4: Run the server API test file to verify it passes**

Run: `node --test --test-concurrency=1 tests/server/api.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/service.ts apps/server/src/routes/sessions.ts apps/server/src/routes/tasks.ts tests/server/api.test.mjs
git commit -m "feat: add unified turn planner routing"
```

### Task 3: Persist Child Groups And Undo/Redo Facts In Repositories

**Files:**
- Modify: `apps/server/src/repositories/types.ts`
- Modify: `apps/server/src/repositories/memory.ts`
- Modify: `apps/server/src/repositories/drizzle.ts`
- Modify: `apps/server/src/db/schema.ts`
- Test: `tests/server/api.test.mjs`

- [ ] **Step 1: Write the failing repository-level API tests for refresh groups and redo invalidation**

```js
liveTest("refresh targets the latest child group under the current node", async () => {
  const refreshed = await submitTranscript(app, session.id, "刷新当前这组，整体更轻薄");
  assert.equal(refreshed.actionType, "refresh");

  const tree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });

  const nodes = tree.json().nodes;
  const visibleGroupIds = new Set(nodes.map((node) => node.childGroupId));
  assert.equal(visibleGroupIds.size, 1);
});

liveTest("new tree writes clear redo availability", async () => {
  await undoLatest(app, session.id);
  await submitTranscript(app, session.id, "再发散三个方向");

  const redo = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/redo`
  });

  assert.equal(redo.statusCode, 409);
  assert.equal(redo.json().error.code, "REDO_NOT_AVAILABLE");
});
```

- [ ] **Step 2: Run the server API test file to verify it fails**

Run: `node --test --test-concurrency=1 tests/server/api.test.mjs`

Expected: FAIL because repositories do not store `childGroupId`, `deletedNodeIds`, or redo-invalidating metadata.

- [ ] **Step 3: Extend repository contracts and memory/drizzle implementations**

```ts
export interface CreateTreeNodeInput {
  sessionId: string;
  parentNodeId: string | null;
  createdFromTaskId: string | null;
  childGroupId: string | null;
  depth: number;
  layerOrdinal: number;
  layerVersion: number;
  publicNodeNumber: number;
  displayName: string;
  label: string;
  voiceAliases: string[];
  intentSummary: string;
  formLanguage: string[];
  userNeedResponse: string[];
  inspirationHints: string[];
  imageUrl: string | null;
  status: TreeNodeStatus;
}
```

```ts
export interface CreateTreeOperationInput {
  sessionId: string;
  taskId: string | null;
  type: TreeOperation["type"];
  targetNodeId: string;
  targetLayerVersion: number | null;
  affectedChildGroupId: string | null;
  insertedNodeIds: string[];
  deletedNodeIds: string[];
  supersededNodeIds: string[];
  restoredNodeIds: string[];
  undoOfOperationId: string | null;
  redoOfOperationId: string | null;
  payload: Record<string, unknown>;
}
```

```ts
const childGroupId = randomUUID();
const nodesToCreate = briefs.map((brief, index) => ({
  ...buildNodeInput(brief),
  childGroupId,
  layerOrdinal: index + 1
}));
```

- [ ] **Step 4: Run the server API test file to verify it passes**

Run: `node --test --test-concurrency=1 tests/server/api.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/repositories/types.ts apps/server/src/repositories/memory.ts apps/server/src/repositories/drizzle.ts apps/server/src/db/schema.ts tests/server/api.test.mjs
git commit -m "feat: persist child groups and redo metadata"
```

### Task 4: Convert Agent Inputs And Outputs To Unified Generation Actions

**Files:**
- Modify: `apps/server/src/agents/mock.ts`
- Modify: `apps/server/src/agents/siliconflow.ts`
- Modify: `apps/server/src/orchestrator/service.ts`
- Test: `tests/server/siliconflow-gateway.test.mjs`
- Test: `tests/server/api.test.mjs`

- [ ] **Step 1: Write the failing agent gateway tests for unified generation action types**

```js
test("siliconflow normalization maps legacy expand_branches and branch_deeper into diverge", async () => {
  const result = normalizeAssistantOutput(
    {
      actionType: "branch_deeper",
      targetNodeId: "node-2",
      branchCount: 3,
      designIntentSummary: "branch deeper",
      assistantReply: "继续发散三个方向",
      promptHints: [],
      directionBriefs: buildDirectionBriefs("node-2", 3)
    },
    "沿着节点二继续发散",
    config
  );

  assert.equal(result.actionType, "diverge");
});
```

- [ ] **Step 2: Run the agent and server tests to verify they fail**

Run: `node --test --test-concurrency=1 tests/server/siliconflow-gateway.test.mjs tests/server/api.test.mjs`

Expected: FAIL because schemas and normalizers still expect `expand_branches`, `branch_deeper`, and `refresh_layer`.

- [ ] **Step 3: Update prompt contracts and normalization logic**

```ts
const normalizedActionType =
  raw.actionType === "refresh_layer"
    ? "refresh"
    : raw.actionType === "branch_deeper" || raw.actionType === "expand_branches"
      ? "diverge"
      : raw.actionType;
```

```ts
const systemPrompt = [
  "根据用户语音和当前节点上下文，只输出 generation intent：diverge 或 refresh。",
  "delete、undo、redo 不属于本模型处理范围。",
  "refresh 必须指向当前节点下最近一次生成出来的那组子节点。",
  "返回合法 JSON。"
].join("\n");
```

- [ ] **Step 4: Run the agent and server tests to verify they pass**

Run: `node --test --test-concurrency=1 tests/server/siliconflow-gateway.test.mjs tests/server/api.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agents/mock.ts apps/server/src/agents/siliconflow.ts apps/server/src/orchestrator/service.ts tests/server/siliconflow-gateway.test.mjs tests/server/api.test.mjs
git commit -m "refactor: normalize agent output to unified generation intents"
```

### Task 5: Update Frontend Store, API Layer, And Disabled-Input UX

**Files:**
- Modify: `apps/web/src/features/workbench/api.ts`
- Modify: `apps/web/src/features/workbench/store.ts`
- Modify: `apps/web/src/features/workbench/types.ts`
- Modify: `apps/web/src/features/workbench/components/RecordingBar.tsx`
- Modify: `apps/web/src/features/workbench/components/ConversationPanel.tsx`
- Modify: `apps/web/src/features/workbench/components/IntentStatusCard.tsx`
- Modify: `apps/web/src/features/workbench/components/CanvasWorkspace.tsx`
- Test: `tests/web/workbench-page.test.mjs`

- [ ] **Step 1: Write the failing frontend structure tests for redo and busy-input behavior**

```js
test("recording bar disables sending while generation is active", () => {
  assert.match(recordingBarSource, /disabled=\{isThinking \|\| recordingState === "processing"\}/);
});

test("frontend exposes redo through the live api instead of a dead toolbar icon", () => {
  assert.match(apiSource, /requestSessionRedo/);
  assert.match(storeSource, /requestRedo:\s*\(\)\s*=>/);
});
```

- [ ] **Step 2: Run the frontend structure test to verify it fails**

Run: `node --test tests/web/workbench-page.test.mjs`

Expected: FAIL because the current API layer has undo only, store state still derives from `activeNodeId`, and the input path does not enforce the new busy/redo semantics.

- [ ] **Step 3: Update frontend server-state types and store behavior**

```ts
export type WorkbenchUiState = {
  currentNodeId: string;
  apiSessionId: string | null;
  apiStatus: "idle" | "loading" | "ready" | "error";
  apiError: string | null;
  expandedSystemMessageIds: string[];
  recordingState: RecordingState;
  liveTranscriptText: string | null;
  latestGeneratedNodeIds: string[];
  lastActionSummary: string | null;
  isThinking: boolean;
  canRedo: boolean;
};
```

```ts
export async function requestSessionRedo(
  sessionId: string
): Promise<TreeOperation> {
  const response = await requestJson<RedoResponse>(
    `/api/sessions/${sessionId}/redo`,
    { method: "POST" }
  );

  return response.operation;
}
```

```ts
if (get().uiState.isThinking) {
  return;
}
```

- [ ] **Step 4: Run the frontend structure test to verify it passes**

Run: `node --test tests/web/workbench-page.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/workbench/api.ts apps/web/src/features/workbench/store.ts apps/web/src/features/workbench/types.ts apps/web/src/features/workbench/components/RecordingBar.tsx apps/web/src/features/workbench/components/ConversationPanel.tsx apps/web/src/features/workbench/components/IntentStatusCard.tsx apps/web/src/features/workbench/components/CanvasWorkspace.tsx tests/web/workbench-page.test.mjs
git commit -m "feat: wire frontend to unified tree command flow"
```

### Task 6: Remove Main-Flow Confirmation Dependencies And Finalize Coverage

**Files:**
- Modify or delete: `apps/web/src/features/workbench/components/ConfirmationCard.tsx`
- Modify: `tests/server/api.test.mjs`
- Modify: `tests/server/config.test.mjs`
- Modify: `tests/server/siliconflow-gateway.test.mjs`
- Modify: `tests/web/workbench-page.test.mjs`
- Modify: `docs/superpowers/specs/测试文档.md`

- [ ] **Step 1: Write the failing regression tests that lock in the no-confirmation main flow**

```js
test("main flow no longer requires awaiting_confirmation status", () => {
  assert.doesNotMatch(serverSource, /awaiting_confirmation/);
});

test("workbench no longer depends on ConfirmationCard in the main flow", () => {
  assert.doesNotMatch(workbenchPageSource, /ConfirmationCard/);
});
```

- [ ] **Step 2: Run the full regression suite to verify it fails**

Run: `corepack pnpm test && corepack pnpm test:web`

Expected: FAIL because confirmation-era assertions, component imports, and task-state assumptions are still present.

- [ ] **Step 3: Remove or downgrade confirmation-only dependencies and update docs/tests**

```ts
const MAIN_FLOW_TASK_STATUSES = [
  "queued",
  "transcribing",
  "reasoning",
  "generating",
  "completed",
  "failed",
  "cancelled"
] as const;
```

```md
1. 主链路不再出现 `awaiting_confirmation`。
2. `refresh` 作用于当前节点下最近一次生成组。
3. `undo / redo` 都由树操作事实驱动，不重新调用模型。
```

- [ ] **Step 4: Run the full regression suite to verify it passes**

Run: `corepack pnpm test && corepack pnpm test:web`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/workbench/components/ConfirmationCard.tsx tests/server/api.test.mjs tests/server/config.test.mjs tests/server/siliconflow-gateway.test.mjs tests/web/workbench-page.test.mjs docs/superpowers/specs/测试文档.md
git commit -m "test: finalize no-confirmation unified turn flow"
```

### Task 7: Plan Self-Review And Implementation Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-06-16-tree-command-and-generation-unification.md`

- [ ] **Step 1: Verify spec coverage against the approved design doc**

```text
Spec checklist:
- unified turn planner
- shared schema rename
- child group persistence
- delete / undo / redo execution
- busy-session guard
- frontend disabled send
- no-confirmation main flow
```

- [ ] **Step 2: Scan the plan for placeholder language and mismatched names**

Run: `rg -n "TODO|TBD|later|appropriate|similar to|handle edge cases" docs/superpowers/plans/2026-06-16-tree-command-and-generation-unification.md`

Expected: no matches

- [ ] **Step 3: Verify command names and paths against the repo layout**

Run: `corepack pnpm test:shared && corepack pnpm test:server && corepack pnpm test:web`

Expected: commands exist in `package.json`

- [ ] **Step 4: Save any corrections directly in this plan file**

```md
If any file path, command, or action name is wrong, fix the plan inline before execution starts.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-06-16-tree-command-and-generation-unification.md
git commit -m "docs: add unified tree command implementation plan"
```
