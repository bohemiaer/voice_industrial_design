# 树操作与生成链路统一设计

日期：2026-06-16

关联文档：

- [技术方案](D:/Users/HCI_lab/Documents/voice-painting/docs/superpowers/specs/技术方案.md)
- [需求文档](D:/Users/HCI_lab/Documents/voice-painting/docs/superpowers/specs/需求文档.md)
- [数据库与持久层设计](D:/Users/HCI_lab/Documents/voice-painting/docs/superpowers/specs/数据库与持久层设计.md)
- [Agent PRD](D:/Users/HCI_lab/Documents/voice-painting/docs/superpowers/specs/agent-PRD.md)

## 1. 目标

本文档用于把当前工作台从“生成链路主导的直执行模型”升级为“统一语音入口 + 意图分类 + 树操作/生成分流”的单一基线，重点解决以下问题：

1. 将 `delete / undo / redo` 纳入一等公民，而不是继续挂靠在生成任务旁边。
2. 明确“当前节点”“最近一次实际执行目标节点”“最近一次生成组”的边界。
3. 将 `refresh` 从“刷新当前层”收敛为“刷新当前节点下最近一次生成出来的那组子节点”。
4. 为后续实现提供统一的前后端、agent、数据库和测试口径。

## 2. 范围

本次统一设计覆盖以下能力：

1. `diverge`
2. `refresh`
3. `delete`
4. `undo`
5. `redo`

本次明确不纳入：

1. 纯节点选择命令
2. 查询类语音细节设计
3. 新旧版本对比 UI
4. 多任务并发生成

## 3. 统一产品规则

### 3.1 当前节点规则

1. 首轮默认根节点。
2. 若本轮语音明确提到节点，则本轮使用该节点作为目标节点。
3. 若本轮未提节点，则沿用 session 中的 `currentSelectedNodeId`。
4. 每次成功执行 `diverge / refresh / delete / undo / redo` 后，都更新 session 当前节点。
5. 删除当前节点后，当前节点回退到父节点；若无父节点，则回根节点。

### 3.2 动作分类规则

所有语音输入统一先做 turn 级意图分类，输出以下五类之一：

1. `diverge`
2. `refresh`
3. `delete`
4. `undo`
5. `redo`

其中：

1. `diverge`、`refresh` 进入脑暴助理和生图链路。
2. `delete`、`undo`、`redo` 直接进入树操作执行器。

### 3.3 生成数量规则

1. `diverge`：若用户明确指定数量，则按用户输入；否则默认生成 `3` 个子方向。
2. `refresh`：若用户明确指定数量，则按用户输入；否则沿用被刷新的那一组原始 `branchCount`。
3. 所有生成数量仍受系统最小值和最大值约束。

### 3.4 刷新规则

1. `refresh` 固定作用于“当前节点下最近一次生成出来的那组子节点”。
2. “最近一次”以 `tree_operations` 中最后一条以该节点为目标、且产出该组子节点的生成操作为准。
3. `refresh` 执行后，旧组不物理删除，而是被标记为 superseded；新组成为当前可见结果。
4. 撤回刷新时，刷新前那一整组旧子节点重新变为当前可见，新组退出可见状态。

### 3.5 删除规则

1. `delete` 删除目标节点及其整棵子树。
2. 根节点不可删除。
3. 删除不走 agent，不触发生图。
4. 删除后的恢复必须恢复原节点、原层级关系、原图片和原编号，不重新生成。

### 3.6 Undo / Redo 规则

1. `undo` 可撤回最近一次 `diverge / refresh / delete`。
2. `redo` 可恢复最近一次被 `undo` 的操作。
3. 若用户在 `undo` 后又执行新的 `diverge / refresh / delete`，此前 `redo` 栈立即清空。
4. `undo` / `redo` 恢复的是树结构事实，不重新调用模型。

## 4. 状态模型

### 4.1 Session 状态

Session 至少需要以下字段：

1. `currentSelectedNodeId`
   含义：当前默认操作节点。
2. `lastExecutedTargetNodeId`
   含义：最近一次真正改树操作所使用的目标节点。
3. `nextPublicNodeNumber`
   含义：下一个新节点公共编号。

### 4.2 生成组状态

为支持 `refresh`、`undo` 和 `redo`，每次生成必须引入“生成组”概念，例如：

1. `childGroupId`
2. `sourceOperationId`
3. `branchCount`
4. `visible`

一个生成组表示“某次生成操作在某个父节点下产出的一组兄弟子节点”。

### 4.3 任务状态

生成类任务保留以下状态：

1. `queued`
2. `transcribing`
3. `reasoning`
4. `generating`
5. `completed`
6. `failed`

本轮统一设计下，不再把 `awaiting_confirmation` 作为主链路状态。

## 5. 后端执行链路

### 5.1 单入口

对外仍保留统一入口，例如 `POST /voice-turn`，但服务内部改为：

1. 解析 transcript
2. classify intent
3. resolve effective target node
4. 分流执行

### 5.2 Turn Planner

`Turn Planner` 负责输出统一结构：

```ts
type TurnIntent =
  | "diverge"
  | "refresh"
  | "delete"
  | "undo"
  | "redo";

type PlannedTurn = {
  intentType: TurnIntent;
  effectiveTargetNodeId: string;
  explicitBranchCount: number | null;
  targetChildGroupId: string | null;
};
```

### 5.3 执行器分流

1. `diverge / refresh`
   - 调用脑暴助理
   - 生成结构化 brief
   - 调用生图助理
   - 写入节点、生成组、任务记录和树操作记录
2. `delete / undo / redo`
   - 直接调用树操作执行器
   - 不创建生图任务
   - 直接返回最新树状态

## 6. Agent 口径

### 6.1 脑暴助理职责

脑暴助理只服务于生成类操作：

1. `diverge`
2. `refresh`

脑暴助理不再负责：

1. `delete`
2. `undo`
3. `redo`
4. 是否需要确认

### 6.2 生成类 actionType

建议将生成类 `actionType` 收敛为：

1. `diverge`
2. `refresh`

不再继续使用：

1. `expand_branches`
2. `branch_deeper`
3. `refresh_layer`

其中：

1. 首层生成和深层继续发散都统一映射为 `diverge`。
2. 节点深度差异通过上下文和 `effectiveTargetNodeId` 体现，而不是再拆第二套 actionType。

## 7. 数据模型建议

### 7.1 tree_nodes

建议新增：

1. `child_group_id`

用途：

1. 标记节点属于哪次生成组。
2. 支撑 `refresh` 替换一整组兄弟节点。
3. 支撑 `undo / redo` 恢复整组结构。

### 7.2 tree_operations

建议统一为以下类型：

1. `diverge`
2. `refresh`
3. `delete`
4. `undo`
5. `redo`

建议新增字段：

1. `affected_child_group_id`
2. `deleted_node_ids`
3. `undo_of_operation_id`
4. `redo_of_operation_id`

## 8. 前端规则

1. 前端仍展示当前节点、最新摘要和最近生成高亮。
2. 当前任意生成任务运行中时，输入发送按钮置灰，用户无法发送新消息。
3. `delete / undo / redo` 完成后，前端直接刷新当前会话状态。
4. 对话区统一展示：
   - 动作类型
   - 目标节点
   - 影响范围
   - 生成数量或删除数量
   - 执行结果

## 9. 与当前方案的差异

1. 从“所有语音默认落生成链路”改成“先做意图分类，再分流执行”。
2. 从三类生成动作枚举，改成“生成动作 + 树操作动作”的统一动作模型。
3. 从按层刷新，改成按“最近一次生成组”刷新。
4. 从仅支持 `undo`，改成支持标准 `undo / redo`。
5. 从混合语义的 `activeNodeId`，改成显式区分 `currentSelectedNodeId` 与 `lastExecutedTargetNodeId`。

## 10. 风险与边界收敛方案

本节不再只列风险，而是直接给出本次实现必须遵守的收敛策略。

### 10.1 旧命名迁移策略

现有系统中仍存在 `awaiting_confirmation`、`refresh_layer`、`activeNodeId` 等旧术语。为避免一次性大改造成联动风险，本次采用“两层迁移”：

1. 产品、文档、测试口径先统一到新术语：
   - `diverge`
   - `refresh`
   - `delete`
   - `undo`
   - `redo`
   - `currentSelectedNodeId`
   - `lastExecutedTargetNodeId`
2. 实现层允许短期兼容旧字段名，但兼容层只存在于服务内部映射，不得继续向新文档和新测试暴露旧术语。
3. 兼容映射固定为：
   - `expand_branches` / `branch_deeper` -> `diverge`
   - `refresh_layer` -> `refresh`
   - `activeNodeId` -> `lastExecutedTargetNodeId` 或 `currentSelectedNodeId`
4. `activeNodeId` 不允许继续作为双重语义字段长期保留；实现时必须拆出两个明确状态，旧字段最多只作为读兼容或迁移桥接。

### 10.2 兼容层生命周期

为防止“兼容映射”变成永久债务，本次直接限定兼容层边界：

1. 兼容层只允许出现在：
   - shared schema 过渡适配
   - orchestrator 输入输出归一化
   - repository 读写映射
2. 前端新 store、新测试、新 spec 不再引用旧状态名和旧 actionType。
3. implementation plan 中必须包含一项“清理兼容层”的收尾任务，完成条件是：
   - 主链路测试不再依赖旧术语
   - 主代码路径不再主动写入旧状态枚举
4. 若某个旧接口必须暂留，例如 `confirm/cancel`，也只能以“兼容保留”身份存在，不得再参与主流程编排。

### 10.3 Redo 一致性保障

`redo` 最容易因为边界不清而导致状态分叉，因此本次直接固定事务规则：

1. `undo` 必须写出一条新的 `tree_operation(type=undo)`，并明确 `undo_of_operation_id`。
2. `redo` 必须写出一条新的 `tree_operation(type=redo)`，并明确 `redo_of_operation_id`。
3. 任何新的 `diverge / refresh / delete` 提交成功时，系统必须在同一事务中让此前可重做链失效。
4. `redo` 只能恢复“最近一次被 `undo` 且尚未失效”的操作，不允许跨越式重做。
5. 前端不得自己推导 `redo` 目标，必须以后端返回的最新可重做事实为准。

### 10.4 生成组事实来源

一旦 `refresh` 被定义为“刷新最近一次生成组”，系统就不能再靠前端可见节点猜对象，必须落事实：

1. 每次 `diverge` 或 `refresh` 成功后，必须生成稳定的 `childGroupId`。
2. 该组下所有兄弟节点共享同一个 `childGroupId`。
3. `tree_operations` 必须记录 `affected_child_group_id`，作为后续 `refresh / undo / redo` 的唯一事实来源。
4. “最近一次生成组”定义为：目标节点上最后一条仍然有效、且产出子节点组的生成类操作。
5. 若某节点从未产生过子节点组，则对该节点执行 `refresh` 直接返回业务错误，而不是回退成 `diverge`。

### 10.5 并发边界

为避免树状态竞争，本次实现固定采用单飞行任务模型：

1. 同一 session 任一生成任务运行中时，不允许再发起新的 `diverge / refresh / delete / undo / redo`。
2. 前端发送按钮置灰只是交互反馈，真正的并发保护必须由后端再次校验。
3. 若仍收到并发请求，后端返回明确业务错误，例如 `SESSION_BUSY`。

### 10.6 删除与恢复边界

1. 根节点不可删除。
2. `delete` 必须删除目标节点及其整棵子树。
3. `undo delete` 与 `redo delete` 恢复的是历史树事实，不重新调用 agent 或生图模型。
4. 恢复后的节点必须保留原始：
   - 节点 id
   - `publicNodeNumber`
   - 父子关系
   - 图片 URL
   - 生成组归属

### 10.7 本次实现完成标准

只有同时满足以下条件，本次“风险与边界”才算真正被解决：

1. 主链路代码不再要求确认态才能写树。
2. `refresh` 的目标对象完全由持久层事实记录驱动。
3. `undo / redo` 在自动化测试中覆盖：
   - 撤回发散
   - 撤回刷新
   - 撤回删除
   - 新写操作清空 redo 栈
4. 前端、后端、shared schema 的主路径都以新术语工作，旧术语只存在于受控兼容层。
