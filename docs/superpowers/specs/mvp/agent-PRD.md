# 工业设计语音脑暴工具 Agent PRD

日期：2026-06-12

关联文档：

- [产品设计稿](D:/Users/HCI_lab/Documents/voice-painting/docs/superpowers/specs/2026-06-12-industrial-design-voice-brainstorm-design.md)
- [技术实现方案](D:/Users/HCI_lab/Documents/voice-painting/docs/superpowers/specs/2026-06-12-industrial-design-voice-brainstorm-technical.md)

## 1. 文档目标

本文档定义第一版 MVP 中各个 AI 角色的职责、输入输出、system prompt、边界、验收标准和评测体系，并补充 orchestrator 的实现逻辑与验收标准。

本文档覆盖以下角色：

1. 脑暴助理 `Brainstorm Assistant`
2. 生图助理 `Sketch Generation Assistant`
3. 编排层 `Orchestrator`

说明：

当前 MVP 先不纳入视觉审稿助理主链路，视觉 review 作为后续扩展能力保留在文档中。

## 1.1 当前统一口径（2026-06-16）

本文件中旧的“高风险确认后执行”表述不再作为当前实现基线，现统一为：

1. 主链路采用“无确认直执行”模型。
2. Orchestrator 在进入 agent 之前必须先做 turn 级意图识别。
3. 只有 `diverge` 和 `refresh` 进入脑暴助理与生图助理链路。
4. `delete`、`undo`、`redo` 由树操作执行器直接处理，不进入生图链路。
5. `refresh` 固定指向“当前节点下最近一次生成出来的那组子节点”。
6. `redo` 采用标准重做栈语义；执行新的 `diverge / refresh / delete` 后，`redo` 栈清空。

## 2. 设计原则

第一版 agent 系统遵循以下原则：

1. 只有 orchestrator 持有和修改全局树状态。
2. 每个 agent 只做一类事，不做跨职责推理。
3. 每个 agent 输出必须结构化，可被程序校验。
4. 每一轮结果必须可解释、可回放、可评估。
5. 优先避免误操作污染树状态，其次才追求更激进的自动化。
6. 当前 MVP 的创作主链路只允许语音输入，不依赖鼠标和键盘文字输入。
7. 树结构改动采用“直执行 + 可回放 + 可撤回”的模型，不再在主链路中插入确认回合。
8. MVP 支持 `undo / redo`，但不支持新旧版本对比视图。

## 3. 总体协作方式

一次完整处理链路如下：

1. 用户长按语音输入。
2. 前端上传音频。
3. Orchestrator 调用 ASR 获得转写文本。
4. Orchestrator 收集当前节点、祖先路径和当前层上下文。
5. Orchestrator 调用脑暴助理。
6. 脑暴助理返回结构化动作和多个方向 brief。
7. Orchestrator 对结果做 schema 和业务校验。
8. 若本轮属于生成类命令，Orchestrator 将每个 brief 发送给生图助理。
9. 生图助理返回图片和生成元数据。
10. Orchestrator 根据动作类型写树、写消息、写任务记录和树操作记录。
11. 若本轮属于树操作命令，Orchestrator 直接执行并返回最新树状态。
12. 前端收到更新并刷新画布和对话区。

## 4. 脑暴助理

## 4.1 角色定义

脑暴助理是一个工业设计概念发散编排器。它的核心职责不是聊天，而是把用户本轮自然语言输入转成可执行的树操作和可消费的设计分支 brief。

## 4.2 System Prompt

以下文本应作为第一版可直接使用的 system prompt 初稿：

```text
You are Brainstorm Assistant, an industrial design ideation planner for a voice-driven branching canvas.

Your job is to transform the user's latest spoken instruction and the currently selected tree context into a structured branching plan for concept exploration.

You operate inside an industrial design kickoff workflow. Prioritize early-stage concept divergence, shape-language exploration, and controllable branching.

You must do all of the following:
- classify the current turn into exactly one action type:
  - expand_branches
  - refresh_layer
  - branch_deeper
- keep the turn grounded in the selected node and its ancestor path
- produce clear, differentiated concept directions when branching
- express differences explicitly through variation axes
- keep the result aligned with the current product category and discussion context
- return valid JSON only, matching the required output schema

You must not do any of the following:
- generate or describe final images as if they already exist
- change the overall product goal without evidence in the user's turn
- collapse multiple branches into near-duplicates
- produce vague, generic, or purely stylistic directions without industrial design meaning
- invent a target node that does not match the provided context

Optimize for:
- correct action classification
- correct target-node grounding
- branch diversity in form language
- concise and actionable design briefs
- controllable tree growth

When user input is ambiguous, prefer the most conservative interpretation that preserves current tree structure and product intent.

If the action could replace an existing layer, create a deeper child layer, or operate on a node that may be ambiguous, mark the result as requiring confirmation and provide a rewritten execution intent for user confirmation.

Your assistant-facing natural language reply must be short and operational. It should explain what the system is about to do, not produce design theory.
```

## 4.3 输入

```ts
type BrainstormAssistantInput = {
  sessionGoal: string;
  transcriptText: string;
  selectedNodeId: string;
  selectedNodeSummary: {
    publicNodeNumber: number;
    displayName: string;
    label: string;
    intentSummary: string;
    formLanguage: string[];
    userNeedResponse: string[];
    inspirationHints: string[];
  };
  ancestorPath: Array<{
    nodeId: string;
    label: string;
    intentSummary: string;
  }>;
  siblingSummaries: Array<{
    nodeId: string;
    label: string;
    intentSummary: string;
    formLanguage: string[];
  }>;
  constraints: {
    minBranchCount: number;
    maxBranchCount: number;
    productDomain: "industrial_design";
    sketchStage: "early" | "mid";
    inputMode: "voice_only";
  };
};
```

## 4.4 输出

```ts
type BrainstormActionType =
  | "expand_branches"
  | "refresh_layer"
  | "branch_deeper";

type VisualDirectionBrief = {
  briefId: string;
  targetParentNodeId: string;
  publicNodeNumber?: number;
  label: string;
  displayName: string;
  intentSummary: string;
  formLanguage: string[];
  userNeedResponse: string[];
  inspirationHints: string[];
  variationAxis: string;
  promptIntent: string;
};

type BrainstormAssistantOutput = {
  actionType: BrainstormActionType;
  targetNodeId: string;
  branchCount: number;
  designIntentSummary: string;
  assistantReply: string;
  confirmationRequired: boolean;
  rewrittenIntentForConfirmation?: string;
  promptHints: string[];
  directionBriefs: VisualDirectionBrief[];
};
```

## 4.5 职责边界

脑暴助理负责：

1. 识别动作类型。
2. 绑定目标节点。
3. 总结本轮设计意图。
4. 为分支生成差异化 brief。
5. 生成每个节点的稳定命名。
6. 为每个待创建节点生成适合口头引用的名称候选。
7. 判断是否需要确认。
8. 给用户一个简短执行说明。

脑暴助理不负责：

1. 直接生成图片。
2. 修改数据库或树结构。
3. 决定最终是否写入结果。
4. 直接读取完整原始历史而无裁剪。

## 4.6 单轮验收标准

1. `actionType` 必须是 3 个枚举之一。
2. `targetNodeId` 必须是上下文中存在的合法节点。
3. `branchCount` 必须落在约束范围内。
4. `directionBriefs.length` 必须等于 `branchCount`。
5. 每个 `variationAxis` 必须不同且具有工业设计意义。
6. 每个 `displayName` 必须简短、可说出、可与兄弟节点区分。
7. 不同兄弟节点不得出现完全重复的 `displayName`。
8. `assistantReply` 必须简短、明确、可给前端直接显示。
9. 高风险树结构变更必须正确标记 `confirmationRequired`。

## 4.7 评测体系

### 离线指标

1. `Action Classification Accuracy`
2. `Target Node Grounding Accuracy`
3. `Branch Count Compliance`
4. `Variation Axis Distinctness`
5. `Brief Usability Score`
6. `Node Naming Clarity Score`
7. `Confirmation Trigger Accuracy`

### 人工评审维度

1. 是否理解了用户意图。
2. 是否误把刷新当成继续下钻。
3. 生成的多个方向是否真实分化。
4. brief 是否足够让生图助理执行。

### 失败模式重点跟踪

1. 模式误判。
2. 错绑目标节点。
3. 伪差异分支。
4. 偏离当前产品目标。

## 5. 生图助理

## 5.1 角色定义

生图助理是工业设计草图执行者。它接收单个结构化 brief，将其变成一张符合当前阶段风格的概念草图。

## 5.2 System Prompt

```text
You are Sketch Generation Assistant, a visual execution agent for industrial design ideation.

Your job is to turn one structured concept brief into one image-generation instruction and produce one concept sketch result.

You operate in early-stage industrial design brainstorming. Preserve sketch-like exploratory qualities unless the context explicitly asks for deeper refinement.

You must do all of the following:
- stay faithful to the provided concept brief
- visually express the requested form language
- make the specified variation axis legible in the output
- stay within the intended product category
- preserve early-stage industrial design sketch qualities
- keep this branch distinguishable from sibling directions when sibling context is provided

You must not do any of the following:
- invent a new concept direction outside the brief
- drift into polished advertisement render style unless explicitly requested
- ignore the variation axis
- produce an image that changes the product type

Optimize for:
- brief fidelity
- visible form-language signals
- sibling differentiation
- industrial design sketch consistency
```

## 5.3 输入

```ts
type SketchGenerationInput = {
  brief: VisualDirectionBrief;
  sessionStyle: {
    sketchTone: "loose" | "controlled";
    detailLevel: "early" | "mid";
    productDomain: "industrial_design";
  };
  depthContext: {
    depth: number;
    branchStage: "first_layer" | "deeper_layer";
  };
  siblingContext?: Array<{
    briefId: string;
    label: string;
    variationAxis: string;
    formLanguage: string[];
  }>;
};
```

## 5.4 输出

```ts
type SketchGenerationOutput = {
  imageId: string;
  briefId: string;
  imageUrl: string;
  promptUsed: string;
  negativePromptUsed?: string;
  visualSummary: string;
};
```

## 5.5 职责边界

生图助理负责：

1. 解释和执行单个 brief。
2. 生成草图风格图片。
3. 返回调试所需 prompt 元数据。
4. 保留 brief 中的节点命名不漂移。

生图助理不负责：

1. 理解完整会话目标。
2. 判断树怎么长。
3. 决定本轮有几个分支。
4. 评估结果是否合格。

## 5.6 单轮验收标准

1. 结果图与 brief 一致。
2. 图像具有工业设计早期草图感。
3. 图像没有明显品类漂移。
4. variation axis 在视觉上可辨识。
5. 与同层兄弟方向存在足够差异。
6. 图像结果与节点名称表达基本一致，不产生明显命名漂移。

## 5.7 评测体系

### 离线指标

1. `Brief-to-Image Fidelity`
2. `Category Drift Rate`
3. `Sibling Divergence Score`
4. `Sketch Style Consistency`

### 人工评审维度

1. 是否一眼能看出该方向的造型语言。
2. 是否还停留在脑暴草图而不是效果图。
3. 是否把产品画成了错误类型。
4. 是否和同轮其他方向拉开差异。

### 失败模式重点跟踪

1. 过度高保真。
2. 品类错误。
3. 分支同质化。
4. 忽略 variation axis。

## 6. 视觉审稿助理

视觉审稿助理当前不纳入 MVP 主链路，仅作为后续扩展能力保留。

## 6.1 角色定义

视觉审稿助理是结构化视觉评审器。它检查生成图是否符合 brief、是否和兄弟分支足够不同，并输出下一轮可执行优化建议。

## 6.2 System Prompt

```text
You are Visual Review Assistant, a structured reviewer for industrial design concept sketches.

Your job is to evaluate whether a generated sketch matches the intended concept brief and whether it is sufficiently distinct from sibling directions.

You must do all of the following:
- assess alignment between the image and the concept brief
- identify missing or weak form-language signals
- detect obvious category drift
- assess branch differentiation when sibling context is provided
- provide concrete next-step optimization suggestions
- return structured output, not free-form commentary

You must not do any of the following:
- rewrite the concept brief into a new design goal
- give generic praise without diagnosis
- present uncertain visual judgments as certain facts
- produce optimization advice that cannot be acted on in the next turn

Optimize for:
- specific diagnosis
- actionable suggestions
- calibrated confidence
- usefulness for the next brainstorming step
```

## 6.3 输入

```ts
type VisualReviewInput = {
  transcriptText: string;
  targetNodeSummary: {
    nodeId: string;
    label: string;
    intentSummary: string;
  };
  brief: VisualDirectionBrief;
  generatedSketch: SketchGenerationOutput;
  siblingContext?: Array<{
    briefId: string;
    label: string;
    variationAxis: string;
    imageUrl?: string;
  }>;
};
```

## 6.4 输出

```ts
type VisualReviewOutput = {
  reviewId: string;
  briefId: string;
  matchesIntent: boolean;
  score: number;
  formLanguageObserved: string[];
  missingSignals: string[];
  categoryDrift: boolean;
  siblingDifferenceLevel: "low" | "medium" | "high";
  diagnosis: string;
  nextStepSuggestions: string[];
};
```

## 6.5 职责边界

视觉审稿助理负责：

1. 评估图和 brief 的一致性。
2. 检查缺失信号和品类漂移。
3. 给出下一步优化建议。

视觉审稿助理不负责：

1. 自动修改树。
2. 自动重写 brief。
3. 自动重跑生图。
4. 将主观偏好当作硬性错误。

## 6.6 单轮验收标准

1. 能明确指出符合与不符合之处。
2. 能指出缺失的造型语言信号。
3. 能判断是否与兄弟分支过于相似。
4. `nextStepSuggestions` 能直接用于下一轮发散。
5. `score` 和文字诊断基本一致，不自相矛盾。

## 6.7 评测体系

### 离线指标

1. `Alignment Detection Accuracy`
2. `Diagnosis Specificity Score`
3. `Suggestion Actionability Score`
4. `Overconfidence Rate`

### 人工评审维度

1. 建议是否具体。
2. 是否真的帮助用户继续发散。
3. 是否存在明显误判却很自信。
4. 是否能识别分支之间的差异度问题。

### 失败模式重点跟踪

1. 空泛评论。
2. 误把审美偏好说成客观错误。
3. 高置信度误判。
4. 建议不可执行。

## 7. Orchestrator

## 7.1 角色定义

Orchestrator 是系统的流程控制器和唯一树状态写入者。它优先是程序逻辑，不是自由推理 agent。

## 7.2 实现逻辑

第一版建议按以下步骤实现：

1. 接收前端上传的音频和目标节点信息。
2. 创建任务记录，状态置为 `queued`。
3. 调用 ASR 并保存转写文本，状态更新为 `transcribing`。
4. 收集树上下文，包括当前节点、祖先摘要、兄弟摘要。
5. 调用脑暴助理，状态更新为 `reasoning`。
6. 校验脑暴助理输出的 schema 和业务合法性。
7. 若 `confirmationRequired = true`，则先将任务状态置为 `awaiting_confirmation`，并向用户复述改写后的执行意图。
8. 用户确认后，为每个 brief 依次或并行创建 `BranchTask` 并调用生图助理，状态更新为 `generating`。
9. 将图片和 brief 组装成节点数据。
10. 根据 `actionType` 执行以下之一：
   - `expand_branches`：在目标节点下新增同级方向
   - `refresh_layer`：生成当前层的新版本，保留旧版本节点用于回放和撤销
   - `branch_deeper`：在目标节点下新增下一层子分支
11. 写入消息记录、节点记录、图片记录、`BranchTask` 记录和 `TreeOperation` 记录。
12. 任务标记为 `completed` 并通知前端。
13. 任一环节失败时写错误、更新任务状态，并保持树结构不被脏写。

## 7.3 输入输出

### 输入

```ts
type OrchestratorTurnInput = {
  sessionId: string;
  targetNodeId: string;
  audioBlobUrl: string;
  inputMode: "voice_only";
};
```

### 输出

```ts
type OrchestratorTurnResult = {
  taskId: string;
  stage: "queued" | "transcribing" | "reasoning" | "awaiting_confirmation" | "generating" | "completed" | "failed";
  affectedNodeIds: string[];
  assistantReply?: string;
  rewrittenIntentForConfirmation?: string;
  errorMessage?: string;
};
```

### 7.3.1 高风险确认固定规则表

| 操作类型 | 是否必须确认 | 说明 |
|---|---|---|
| `refresh_layer` | 是 | 会生成当前层新版本 |
| `branch_deeper` | 是 | 会新增子层 |
| `expand_branches` 作用于当前已确认节点 | 否 | 默认直接执行 |
| `expand_branches` 作用于非当前节点或目标歧义 | 是 | 先确认目标 |
| 查询类操作 | 否 | 不写树 |
| 纠错类操作 | 否 | 重新推理，不写树 |
| 单次撤销 | 是 | 避免误撤销 |

## 7.4 职责边界

Orchestrator 负责：

1. 状态机推进。
2. 上下文裁剪。
3. 调用顺序控制。
4. schema 校验。
5. 树写入逻辑。
6. 失败恢复和错误传播。
7. 纯语音交互中的节点引用消歧与确认控制。

Orchestrator 不负责：

1. 用 prompt 自己生成设计方向。
2. 替代脑暴助理做创意推理。
3. 替代视觉审稿助理做视觉判断。

## 7.5 验收标准

1. 只有 orchestrator 能修改树状态。
2. 任一 agent 的非法输出都不会直接写库。
3. 三种树操作 `expand_branches / refresh_layer / branch_deeper` 行为严格区分。
4. `refresh_layer` 通过版本化层替换实现，旧节点不会被物理覆盖删除。
5. 同一任务内的节点、图片、分支任务、消息关系完整。
6. 高风险操作未确认前不得写树。
7. 前端能收到清晰的阶段状态反馈。
8. 失败任务不会污染已有树结构。
9. MVP 只允许撤销最近一次已确认操作。

## 7.6 评测体系

### 工程指标

1. `Task Success Rate`
2. `Invalid Schema Rejection Rate`
3. `Tree Integrity Rate`
4. `End-to-End Latency`
5. `Failure Recovery Rate`
6. `Confirmation Completion Rate`
7. `Partial Branch Recovery Rate`

### 集成验收维度

1. 同一输入重复运行时，树结构是否稳定。
2. 刷新当前层是否只影响目标层。
3. 继续下钻是否只在目标节点下新增子分支。
4. 未确认的高风险操作是否始终保持只读。
5. 单个分支失败时，其余分支是否仍能稳定落树并可重试。
6. 单次撤销是否只回滚最近一次已确认操作。
7. agent 某一环失败时，前端是否能看到明确错误而非静默失败。

## 8. 跨 Agent 验收

从系统角度，一轮完整流程验收应至少满足：

1. 用户输入被正确转写。
2. 脑暴助理正确识别动作类型并生成分支 brief。
3. 生图助理生成与 brief 一致的草图。
4. orchestrator 在高风险操作下先复述改写意图并等待确认。
5. orchestrator 将结果稳定写入树中。
6. 前端看到的节点、名称、解释和任务状态彼此一致。

## 9. 评测数据集建议

第一版建议至少准备 3 套评测数据：

1. `Brainstorm Intent Set`
内容：当前上下文 + 转写文本 + 标注动作类型 + 标注目标节点

2. `Brief-to-Sketch Set`
内容：结构化 brief + 期望风格标签 + 人工对图像执行质量打分

3. `Voice Safety Set`
内容：转写文本 + 风险等级 + 改写后的确认文案 + 是否应要求确认 + 是否应执行

补充标注约定：

1. 所有节点引用样本都同时记录 `displayName` 与 `publicNodeNumber`。
2. 标注目标节点时，若用户明确说出数字序号，以数字序号为金标主键。
3. 若一句话同时包含“名称 + 数字序号”且两者冲突，标为高风险确认样本。

## 10. MVP 通过标准

第一版可以认为 agent 系统达标的条件：

1. 脑暴助理动作识别准确率达到可用水平，且误判可接受。
2. 生图助理大多数情况下能产出品类正确、差异明显的草图。
3. 节点名称足够稳定，且每个节点拥有独有的数字序号，用户可通过语音持续引用。
4. 高风险树操作在复述确认后再执行，且误写率可接受。
5. orchestrator 能稳定跑通完整链路且不污染树。
6. 整体体验比通用语音聊天模式更可控、更适合工业设计脑暴。
