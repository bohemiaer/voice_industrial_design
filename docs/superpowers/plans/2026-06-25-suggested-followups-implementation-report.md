# 节点推荐发散方向实现报告

日期：2026-06-25

## 1. 背景

v1 新增需求：生成节点之后，每个节点下方展示 3 个推荐发散方向。推荐方向是小的文字节点，用户点击后进入输入框待发送，用户仍可编辑后手动发送。

在进一步确认后，该能力从“前端派生提示”调整为“Brainstorm Assistant 强输出”：每个生成方向 brief 必须携带 3 条推荐发散方向。

## 2. 本轮完成范围

本轮只完成 v1 文档层实现，未改动前端、后端、shared schema 或测试代码。

已更新文档：

1. `docs/superpowers/specs/v1/需求文档.md`
2. `docs/superpowers/specs/v1/agent-PRD.md`
3. `docs/superpowers/specs/v1/数据库与持久层设计.md`

## 3. 需求文档更新

在 `需求文档.md` 中明确：

1. 每个已生成节点下方展示 3 个推荐发散方向。
2. 推荐方向呈现为轻量小文字节点或短 chip。
3. 点击推荐方向后，文案进入右侧输入框并获得焦点，处于待发送状态。
4. 点击不直接提交、不触发生成、不修改树结构。
5. 推荐方向不占用节点编号，不参与父子关系。
6. 推荐方向作为节点展示字段随 brief / `tree_nodes` 保存，不作为独立树节点写入。
7. 新增 `NodeSuggestionChips` 模块，用于承载节点下方推荐方向。

## 4. Agent PRD 更新

在 `agent-PRD.md` 中把推荐方向改为 Brainstorm Assistant 强输出字段。

每个 `directionBrief` 必须新增：

```ts
suggestedFollowups: [string, string, string];
```

Brainstorm Assistant 输出 JSON 中也同步增加：

```json
"suggestedFollowups": ["string", "string", "string"]
```

新增输出规则：

1. `suggestedFollowups` 必须严格输出 3 条。
2. 每条必须围绕该节点自身语义。
3. 不得输出泛化教程或全局提示。
4. 每条应短小、可直接进入输入框待发送。
5. 三条建议应尽量覆盖不同发散角度。

新增校验规则：

1. 每个 brief 必须包含 `suggestedFollowups`。
2. `suggestedFollowups.length` 必须等于 3。
3. 缺失或长度不等于 3 时，视为 Brainstorm Assistant 输出不合格。

## 5. 持久层设计更新

在 `数据库与持久层设计.md` 中明确：

1. 推荐方向是节点展示字段，不是独立核心表。
2. 推荐方向不作为独立树节点分配编号。
3. `branch_tasks.brief_payload` 应保存 Brainstorm Assistant 原始输出。
4. `tree_nodes` 新增展示字段：

```sql
suggested_followups jsonb
```

字段映射新增：

```text
suggestedFollowups <-> suggested_followups
```

## 6. 当前未实现的代码项

后续代码落地需要覆盖：

1. shared schema：给 direction brief / tree node 增加 `suggestedFollowups`。
2. 数据库 schema：给 `tree_nodes` 增加 `suggested_followups`。
3. repository：memory / drizzle 创建和读取节点时处理 `suggestedFollowups`。
4. Brainstorm Assistant prompt：要求模型强输出 3 条 `suggestedFollowups`。
5. SiliconFlow gateway parser：解析、归一和校验 `suggestedFollowups`。
6. mock agent：补齐测试用 `suggestedFollowups`。
7. Orchestrator：校验每个 brief 的 `suggestedFollowups.length === 3`。
8. API response：确保前端可拿到节点上的 `suggestedFollowups`。
9. 前端节点卡片：在每个已生成节点下方渲染 3 个推荐发散方向。
10. 输入框状态：点击推荐方向后写入输入框草稿、聚焦输入框、等待用户发送。
11. 测试：覆盖 schema、agent 输出、持久化、API、前端点击待发送行为。

## 7. 验收标准

1. 每个成功生成的节点都有且只有 3 条 `suggestedFollowups`。
2. 缺失 `suggestedFollowups` 或数量不是 3 时，后端拒绝或修复该次 agent 输出，不静默落入不完整节点。
3. 推荐方向显示在对应节点下方，而不是只出现在对话区。
4. 点击推荐方向不会立即提交请求。
5. 点击后输入框内容变为该推荐方向，输入框获得焦点。
6. 用户点击发送后，推荐方向按普通文字输入进入 Orchestrator。
7. 推荐方向不生成 public node number，不产生父子关系，不单独写入 `tree_operations`。

## 8. 风险与注意事项

1. 推荐方向是强输出字段，模型输出不稳定会直接影响生成链路，需要 parser 和校验兜底。
2. 如果前端节点尺寸较小，3 个推荐方向可能挤压画布布局，需要控制短文案长度和换行策略。
3. 推荐方向不应和底部输入区通用提示混淆；前者绑定具体节点，后者面向当前会话或当前选中节点。
4. 推荐方向点击只填草稿，不自动执行；这个行为需要在 UI 测试中明确锁住。

