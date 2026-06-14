# 后端 Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建后端 agent gateway、mock/SiliconFlow provider 和 orchestrator，让 `/voice-turns` 从前端占位输入切换为后端自主编排。

**Architecture:** 后端新增 `agents` 和 `orchestrator` 两层：route 只接收用户输入，orchestrator 收集 session/tree 上下文并调用 gateway，repository 负责 task、branch task、tree node 和 tree operation 持久化。测试默认使用 memory persistence 和 mock gateway，真实 SiliconFlow gateway 只验证配置与请求边界，不依赖网络测试。

**Tech Stack:** Node.js、TypeScript、Fastify、Drizzle、Zod、node:test、项目 shared schema。

---

## 文件结构

- 修改：`tests/server/api.test.mjs`，先写失败测试，覆盖新的 voice-turn 请求体、mock 编排、消息、确认流程。
- 修改：`apps/server/src/config.ts`，加入 agent provider 和 SiliconFlow 配置。
- 新增：`apps/server/src/agents/types.ts`，定义 gateway 输入输出和错误类型。
- 新增：`apps/server/src/agents/mock.ts`，实现确定性 mock gateway。
- 新增：`apps/server/src/agents/siliconflow.ts`，实现真实 provider adapter。
- 新增：`apps/server/src/agents/index.ts`，按配置创建 gateway。
- 新增：`apps/server/src/orchestrator/service.ts`，实现 voice turn 和确认编排。
- 修改：`apps/server/src/repositories/types.ts`，补充 tree node、branch task、task status、session 状态更新方法。
- 修改：`apps/server/src/repositories/memory.ts`，实现新增 repository 方法。
- 修改：`apps/server/src/repositories/drizzle.ts`，实现新增 repository 方法。
- 修改：`apps/server/src/app.ts`，创建 gateway/orchestrator 并传给 route。
- 修改：`apps/server/src/routes/sessions.ts`，缩小 voice-turn 请求体并调用 orchestrator。
- 修改：`apps/server/src/routes/tasks.ts`，confirm/cancel 调用 orchestrator。

## Task 1：先写新的后端编排测试

**Files:**
- Modify: `tests/server/api.test.mjs`

- [x] **Step 1: 写失败测试**

新增测试应表达：

```js
test("voice turn is orchestrated by the backend from transcript only", async () => {
  const app = await createTestApp();
  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "台灯方向探索",
      goal: "围绕更柔和的办公台灯做首轮发散"
    }
  });
  const { session } = createSessionResponse.json();

  const response = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    }
  });

  assert.equal(response.statusCode, 202);
  const { task } = response.json();
  assert.equal(task.actionType, "expand_branches");
  assert.equal(task.status, "completed");
  assert.equal(task.confirmationStatus, "not_required");
  assert.equal(task.branchCount, 4);

  const messagesResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/messages`
  });
  const messages = messagesResponse.json().messages;
  assert.equal(messages.some((message) => message.kind === "transcript"), true);
  assert.equal(messages.some((message) => message.kind === "summary"), true);

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  assert.equal(treeResponse.json().nodes.length, 4);
  assert.equal(treeResponse.json().nodes[0].status, "ready");

  await app.close();
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `corepack pnpm build:shared && corepack pnpm --filter @voice-industrial-design/server build && node --test tests/server/api.test.mjs`

Expected: FAIL，因为 route 仍要求前端提交 `actionType` 等字段。

## Task 2：补齐 repository 能力

**Files:**
- Modify: `apps/server/src/repositories/types.ts`
- Modify: `apps/server/src/repositories/memory.ts`
- Modify: `apps/server/src/repositories/drizzle.ts`

- [x] **Step 1: 添加 repository 类型**

新增输入类型：`CreateTreeNodeInput`、`CreateBranchTaskInput`、`UpdateBranchTaskInput`、`UpdateGenerationTaskStatusInput`、`UpdateSessionAfterNodesInput`。

新增方法：

```ts
treeNodes.createMany(input: CreateTreeNodeInput[]): Promise<TreeNode[]>;
generationTasks.updateStatus(input: UpdateGenerationTaskStatusInput): Promise<GenerationTask | null>;
branchTasks.create(input: CreateBranchTaskInput): Promise<BranchTask>;
branchTasks.update(input: UpdateBranchTaskInput): Promise<BranchTask | null>;
sessions.updateAfterNodesCreated(input: UpdateSessionAfterNodesInput): Promise<Session | null>;
```

- [x] **Step 2: 实现 memory repository**

实现内存数组写入，`treeNodes.createMany` 分配 `createdAt/updatedAt`，`branchTasks` 存储 shared `BranchTask` 结构。

- [x] **Step 3: 实现 Drizzle repository**

使用已有 `treeNodesTable` 和 `branchTasksTable`。`briefPayload` 存 `VisualDirectionBrief`，读取时映射为 shared `BranchTask.brief`。

## Task 3：实现 agent gateway

**Files:**
- Modify: `apps/server/src/config.ts`
- Create: `apps/server/src/agents/types.ts`
- Create: `apps/server/src/agents/mock.ts`
- Create: `apps/server/src/agents/siliconflow.ts`
- Create: `apps/server/src/agents/index.ts`

- [x] **Step 1: 扩展配置**

新增 `agentProvider: "mock" | "siliconflow"`，默认测试和 memory 使用 mock；新增 SiliconFlow 配置字段。

- [x] **Step 2: 实现 gateway interface**

`types.ts` 定义 `AgentGateway`、`TranscribeAudioInput`、`TranscribeAudioOutput`、`AgentGatewayError`。

- [x] **Step 3: 实现 mock gateway**

`MockAgentGateway.runBrainstormAssistant` 返回通过 `BrainstormAssistantOutputSchema.parse` 的输出；`generateSketch` 返回通过 `SketchGenerationOutputSchema.parse` 的输出。

- [x] **Step 4: 实现 SiliconFlow gateway**

真实 gateway 使用 `fetch` 调用配置的 base URL；缺少 key/base/model 时抛出 `AgentGatewayError`。LLM 响应 JSON 必须用 shared schema parse。

## Task 4：实现 orchestrator 并接入 route

**Files:**
- Create: `apps/server/src/orchestrator/service.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/routes/sessions.ts`
- Modify: `apps/server/src/routes/tasks.ts`

- [x] **Step 1: 实现 `createOrchestrator`**

注入 `AppServices`、`AppConfig`、`AgentGateway`。

- [x] **Step 2: 实现 `processVoiceTurn`**

构造上下文，调用 gateway，创建 task/message。无需确认且 action 为 `expand_branches` 时，调用 sketch、创建 branch task、tree node、tree operation，并把 task 标记为 `completed`。

- [x] **Step 3: 实现 `confirmTask` 和 `cancelTask`**

确认时通过 repository 更新状态；本轮若没有可恢复 brief，可停在 `generating`。取消时标记 `cancelled`。

- [x] **Step 4: 修改 route**

`voiceTurnSchema` 只保留 `transcriptText` 和 nullable `targetNodeId`。`confirm/cancel` route 调用 orchestrator。

## Task 5：验证并修正文档状态

**Files:**
- Modify: `TODO.md`

- [x] **Step 1: 运行完整后端测试**

Run: `corepack pnpm test:server`

Expected: PASS。

- [x] **Step 2: 运行 typecheck**

Run: `corepack pnpm --filter @voice-industrial-design/server typecheck`

Expected: PASS。

- [x] **Step 3: 更新 TODO**

勾选本次已完成的后端 agent 相关条目，只修改与本次实现直接相关的行。
