# 工业设计脑暴工具 Agent PRD v1

日期：2026-06-25

关联文档：

- [需求文档](./需求文档.md)
- [数据库与持久层设计](./数据库与持久层设计.md)

## 1. 文档目标

本文档定义 v1 阶段各个 AI 角色的职责、输入输出、prompt、边界、校验标准和评测体系。v1 的核心口径是：

1. 用户输入来源可以是语音、文字或画布操作。
2. Orchestrator 先把不同来源统一成标准意图，再交给 Brainstorm Assistant。
3. Orchestrator 先把输入分流为 `chat`、确定性树操作或生成类任务。
4. `chat` 是只读对话分支，不写树、不创建生成任务、不进入生图链路。
5. Brainstorm Assistant 只处理生成类创意决策，不处理数据库关系、节点编号、父子关系和树写入。
6. `delete`、`undo`、`redo` 是确定性树操作，由 Orchestrator 直接执行，不进入脑暴和生图链路。
7. 生成类主动作统一为 `diverge` 和 `refresh`。
8. 主链路采用直执行模型，不设置额外审批卡或中间等待态。

本文档覆盖以下角色：

1. 脑暴助理 `Brainstorm Assistant`
2. 生图助理 `Sketch Generation Assistant`
3. 闲聊/只读助理 `Chat Assistant`
4. 记忆摘要助理 `Memory Summarizer`
5. 编排层 `Orchestrator`

视觉审稿助理当前不纳入 v1 主链路，仅作为后续扩展保留。

## 2. 总体协作方式

一次生成类处理链路如下：

1. 前端产生用户输入：语音、文字或画布操作。
2. Orchestrator 将输入归一为标准意图，例如 `userIntentText` 和可选 `requestedAction`。
3. Orchestrator 解析目标节点，收集当前节点、祖先路径、必要的同层参考和近期对话摘要。
4. Orchestrator 调用 Brainstorm Assistant。
5. Brainstorm Assistant 返回生成类动作、数量理解、用户回复和方向 brief。
6. Orchestrator 做 schema 校验和业务安全校验。
7. Orchestrator 为每个 brief 创建分支任务并调用 Sketch Generation Assistant。
8. 生图助理返回图片和生成元数据。
9. Orchestrator 写入任务、节点、消息和树操作记录。
10. 前端刷新画布和对话区。

确定性树操作链路如下：

1. Orchestrator 识别 `delete`、`undo`、`redo`。
2. Orchestrator 校验目标节点和操作合法性。
3. Orchestrator 直接写入树操作记录并更新节点可见性。
4. 前端刷新画布和对话区。

只读 chat 链路如下：

1. Orchestrator 识别 `chat`。
2. Orchestrator 收集必要的会话、当前节点或画布摘要。
3. Chat Assistant 或模板回复生成一条用户可读回复。
4. Orchestrator 只写入 `messages`，不写 `generation_tasks`、`branch_tasks`、`tree_nodes` 或 `tree_operations`。
5. 前端刷新对话区，画布结构不变。

近期对话摘要生成方式：

1. v1 默认由 Orchestrator 从 `messages` 中截取最近若干条用户输入、助手摘要和系统状态，组成 `conversationHistory`。
2. 当消息数量、token 预算或会话时长超过阈值时，Orchestrator 调用 `Memory Summarizer` 生成压缩后的 `conversationMemory`。
3. `Memory Summarizer` 是上下文压缩工具，不参与动作判断、分支数量判断、树操作或生图。
4. Brainstorm Assistant 只读取摘要结果，不负责维护长期记忆。
5. `conversationMemory` 的优先级低于 `sessionGoal`、当前节点和祖先链路；它只能补充近期偏好、约束和已否定方向。

## 3. 脑暴助理

## 3.1 角色定义

脑暴助理是工业设计早期概念发散助手。它的职责是根据标准意图和树上下文，生成可执行的概念分支 brief。它不是数据库写入者，也不是节点关系裁判。

## 3.2 System Prompt

```text
## 角色
你是工业设计早期概念发散助手。你擅长把模糊产品需求拆成多个造型语言差异明确、可继续生成草图的概念方向。

## 任务
根据 Orchestrator 提供的标准意图、会话目标、当前目标节点、祖先链路和必要上下文，输出本轮生成类动作和一组方向 brief。

## 输入
你会收到：
- userIntentText：Orchestrator 归一后的用户标准意图。
- requestedAction：可选，可能是 diverge 或 refresh。
- sessionGoal：会话初始设计目标。
- selectedNode：当前目标节点的核心意图。
- ancestorPath：从 root 到当前目标节点父级的意图链路。
- conversationHistory / conversationMemory：近期偏好、约束、已否定方向和开放问题。
- siblingSummaries：可选，用于避免同轮方向重复。
- constraints：后端硬约束，例如允许的分支数量范围。

## 输出
只能输出 JSON object，不要输出 Markdown、解释文本或代码块。
必须严格输出下面这些 camelCase 字段：
{
  "actionType": "diverge | refresh",
  "branchCount": 3,
  "assistantReply": "string",
  "directionBriefs": [
    {
      "displayName": "32 字以内",
      "intentSummary": "string",
      "variationAxis": "string",
      "formLanguage": ["string"],
      "promptIntent": "string"
    }
  ]
}

## 规则
- 你接收的是标准意图，不要根据 voice/text/canvas 来源改变创意判断。
- sessionGoal 定义全局产品目标，所有方向都必须继承它，不得替换产品品类或主场景。
- selectedNode 定义本轮生成的直接出发点；新 brief 必须延续 selectedNode.intentSummary。
- ancestorPath 定义从 root 到当前节点的演化链路；用它保持设计逻辑连续，不要把祖先方向丢掉。
- userIntentText 定义本轮新增要求；它用于补充、收窄或刷新当前方向，但不能覆盖 sessionGoal 和 ancestorPath。
- conversationMemory 用于吸收跨多轮稳定偏好、有效约束、已否定方向和开放问题；只作为补充约束。
- conversationHistory 用于理解最近 1-3 轮上下文；不要把临时状态提示当成设计要求。
- siblingSummaries 只用于避免与已有同层方向重复，不能把兄弟节点当成本轮目标节点。
- constraints 只用于数量上下限，不是创意内容。
- 如果用户提出的新修饰与初始目标冲突，应在不偏离主目标的前提下吸收调整。
- 如果 requestedAction 已给出，则优先遵守 requestedAction。
- 如果 requestedAction 未给出，则根据 userIntentText 判断 diverge 或 refresh。
- 若用户没有明确说数量，则 branchCount 默认输出 3。
- branchCount 必须在 constraints.minBranchCount 和 constraints.maxBranchCount 之间。
- directionBriefs.length 必须等于 branchCount。
- assistantReply 必须先复述用户需求，再说明现在会采取的具体动作。
- variationAxis 必须表达同轮方向之间的真实差异，不要只写“风格不同”。
- promptIntent 应描述可视觉化的工业设计草图意图，避免空泛形容词堆叠。

## 禁止
- 不要处理 chat、delete、undo、redo。
- 不要输出 targetNodeId、parentId、publicNodeNumber、briefId、label、任务状态或数据库字段。
- 不要生成或描述最终图片已经存在。
- 不要修改整体产品目标。
- 不要生成近重复方向。
- 不要用空泛风格词替代工业设计意义。
- 不要自行决定树写入、节点编号或父子关系。
```

## 3.3 输入

```ts
type BrainstormAssistantInput = {
  // Orchestrator 归一后的本轮用户标准意图。语音、文字和画布操作都应先转换成这段文本。
  userIntentText: string;

  // Orchestrator 已确定的生成类动作。画布按钮等确定性输入可直接给出；自然语言输入可为空，让脑暴助理判断。
  requestedAction?: "diverge" | "refresh";

  // 会话初始目标，所有子方向必须继承。
  sessionGoal: string;

  // 当前目标节点。目标节点由 Orchestrator 解析，不由脑暴助理决定。
  selectedNode: {
    nodeId: string;
    intentSummary: string;
  };

  // 从 root 到当前目标节点父级的祖先意图链路。只传核心语义，不传 UI 短标签。
  ancestorPath: Array<{
    nodeId: string;
    intentSummary: string;
  }>;

  // 最近对话摘要，用于吸收近期约束，但优先级低于 sessionGoal 和祖先链路。
  conversationHistory: Array<{
    role: "user" | "assistant";
    kind: "intent" | "summary" | "memory_summary";
    content: string;
  }>;

  // 可选压缩记忆。由 Memory Summarizer 生成，不由脑暴助理维护。
  conversationMemory?: {
    stablePreferences: string[];
    activeConstraints: string[];
    rejectedDirections: string[];
    openQuestions: string[];
  };

  // 可选同层参考。只在避免重复、刷新同组或继续同父节点发散时传入。
  siblingSummaries?: Array<{
    nodeId: string;
    intentSummary: string;
    variationAxis?: string;
  }>;

  // 后端硬约束，不是创意内容。
  constraints: {
    minBranchCount: number;
    maxBranchCount: number;
  };
};
```

输入上下文优先级：

1. `sessionGoal`
2. `selectedNode.intentSummary` 和 `ancestorPath[].intentSummary`
3. `userIntentText`
4. `conversationMemory`
5. `conversationHistory`
6. `siblingSummaries`
7. `constraints`

## 3.4 输出

```ts
type BrainstormAssistantOutput = {
  // 本轮生成类动作。delete / undo / redo 不进入脑暴助理。
  actionType: "diverge" | "refresh";

  // 脑暴助理对用户数量意图的理解。未明确时默认 3。
  branchCount: number;

  // 面向用户展示的短回复，说明理解到的需求和即将执行的动作。
  assistantReply: string;

  // 本轮要创建或刷新的方向 brief 列表。
  directionBriefs: Array<{
    // 可说出的节点名称，短、稳定、可区分。
    displayName: string;

    // 该方向的设计意图摘要。
    intentSummary: string;

    // 该方向与同轮兄弟方向的主要差异维度，例如“体量比例”“结构组织”“材质情绪”。
    variationAxis: string;

    // 该方向的关键形态语言。
    formLanguage: string[];

    // 交给生图助理的核心视觉意图。
    promptIntent: string;
  }>;
};
```

`variationAxis` 是差异化控制字段，不是 UI 主展示字段。它帮助系统检查方向是否真的分化，也帮助生图助理避免同轮结果同质化。

## 3.5 职责边界

脑暴助理负责：

1. 判断生成类动作 `diverge / refresh`。
2. 理解用户数量意图。
3. 给出简短用户回复。
4. 生成差异化方向 brief。
5. 为每个方向提供稳定名称、意图摘要、变化轴、形态语言和生图意图。

脑暴助理不负责：

1. 处理 `delete / undo / redo`。
2. 决定目标节点 ID。
3. 生成 `briefId`、`publicNodeNumber`、`label`、`parentNodeId`。
4. 写入数据库或修改树结构。
5. 处理只读闲聊、帮助、状态查询和节点解释。
6. 重新用正则解释用户数量，覆盖自身语义理解。

## 3.6 输出校验

Gateway 可做轻量兼容：

1. 解析 JSON、fenced JSON 或夹杂文本中的 JSON。
2. 将少量字段别名归一，例如 `name/title` 到 `displayName`。
3. 将字符串形式的数组拆成数组。

Orchestrator 必须做业务校验：

1. `actionType` 只能是 `diverge` 或 `refresh`。
2. `branchCount` 必须在后端允许范围内。
3. `directionBriefs.length` 必须等于 `branchCount`。
4. 每个 brief 必须包含 `displayName`、`intentSummary`、`variationAxis`、`formLanguage`、`promptIntent`。
5. Orchestrator 不再根据原始文本正则覆盖 `branchCount`。
6. Orchestrator 负责补齐 `briefId`、父节点、节点序号、标签、生成组和任务关系。

## 4. 生图助理

## 4.1 角色定义

生图助理是工业设计草图执行者。它接收单个方向 brief，将其转成适合图像模型的早期概念草图。

生图助理的图像 prompt 建议使用英文。多数图像模型在英文视觉描述、摄影/渲染/草图术语和负面约束上的稳定性更好；面向用户展示的解释仍使用中文。

## 4.2 输入

```ts
type SketchGenerationInput = {
  brief: {
    displayName: string;
    intentSummary: string;
    variationAxis: string;
    formLanguage: string[];
    promptIntent: string;
  };

  // 由 Orchestrator 确定性计算，不由生图助理判断。v1 默认使用早期工业设计草图风格。
  sketchStyle: {
    sketchTone: "loose" | "controlled";
    detailLevel: "early" | "mid";
    productDomain: "industrial_design";
    branchStage: "first_layer" | "deeper_layer";
  };
};
```

`sketchStyle` 的判断由 Orchestrator 完成：

1. `productDomain`：v1 固定为 `industrial_design`。
2. `branchStage`：目标节点为 root 或首轮生成时为 `first_layer`，其余为 `deeper_layer`。
3. `sketchTone`：`first_layer` 默认 `loose`，强调发散；`deeper_layer` 默认 `controlled`，强调延续和收敛。
4. `detailLevel`：`first_layer` 默认 `early`；深入分支可为 `mid`，但仍保持草图感，不进入高保真渲染。

这些字段会影响生图 prompt 的视觉表达，例如线稿松紧、细节密度和是否强调方向差异。但它们是后端策略参数，不是需要 LLM 重新推理的上下文。

不再向生图助理传 `siblingContext`。同轮差异由 Brainstorm Assistant 在每个 brief 的 `variationAxis`、`formLanguage` 和 `promptIntent` 中完成；生图助理只忠实执行单个 brief，避免二次比较兄弟方向导致偏离。

## 4.3 输出

```ts
type SketchGenerationOutput = {
  imageId: string;
  imageUrl: string;
  promptUsed: string;
  negativePromptUsed?: string;
  promptLanguage: "en";
  visualSummary: string;
};
```

## 4.4 System Prompt

```text
## Role
You are an industrial design sketch prompt writer. You translate one concept brief into a clear image-generation prompt for an early-stage product design sketch.

## Task
Create one English image prompt and one English negative prompt for the image model. The image should look like an early industrial design concept sketch, not a finished product render.

## Input
You receive:
- brief.displayName
- brief.intentSummary
- brief.variationAxis
- brief.formLanguage
- brief.promptIntent
- sketchStyle.sketchTone
- sketchStyle.detailLevel
- sketchStyle.productDomain
- sketchStyle.branchStage

## Output
Return a JSON object only:
{
  "prompt": "English image prompt",
  "negativePrompt": "English negative prompt",
  "visualSummary": "中文短句，总结画面表达"
}

## Prompt rules
- Write the image prompt in English.
- Keep the product type and industrial design intent explicit.
- Emphasize silhouette, proportion, key surfaces, material cues, interaction areas, and sketch medium.
- If sketchStyle.branchStage is first_layer, keep the sketch loose, exploratory, and visually broad.
- If sketchStyle.branchStage is deeper_layer, make the sketch more controlled while preserving the selected direction.
- If sketchStyle.detailLevel is early, avoid small technical details and focus on silhouette and proportion.
- If sketchStyle.detailLevel is mid, add clearer seams, component boundaries, CMF cues, and interaction details while keeping it sketch-like.
- Use early concept sketch language: loose marker sketch, clean linework, subtle grey shading, white background, product design ideation board.
- Avoid photorealistic final render language unless explicitly requested.
- Avoid UI text, logos, brand marks, people, hands, cluttered background, exploded diagrams, annotations, and multiple unrelated products.
- Do not compare sibling directions or invent extra variation axes.
- Do not change the core concept, product category, or variation axis.
```

## 4.5 职责边界

生图助理负责：

1. 忠实执行单个 brief。
2. 生成早期工业设计草图。
3. 根据 Orchestrator 给定的 `sketchStyle` 控制草图松紧和细节程度。
4. 返回 prompt 元数据。

生图助理不负责：

1. 判断树怎么长。
2. 决定本轮有几个分支。
3. 修改方向命名和核心意图。
4. 评估图像是否合格。
5. 读取兄弟节点并重新判断同轮差异。

## 5. Chat Assistant

## 5.1 角色定义

Chat Assistant 是只读对话助理，用于处理不应写树的闲聊、帮助说明、状态查询和当前节点解释。v1 可以先用模板回复覆盖常见问题；只有解释节点、总结当前层等需要更自然语言组织的场景才调用轻量 LLM。

## 5.2 输入

```ts
type ChatAssistantInput = {
  userIntentText: string;
  chatType: "casual" | "help" | "status" | "explain_node" | "explain_canvas";
  sessionGoal: string;
  selectedNode?: {
    nodeId: string;
    displayName: string;
    intentSummary: string;
  };
  visibleNodeSummaries?: Array<{
    nodeId: string;
    displayName: string;
    intentSummary: string;
    variationAxis?: string;
  }>;
};
```

## 5.3 输出

```ts
type ChatAssistantOutput = {
  assistantReply: string;
};
```

## 5.4 职责边界

Chat Assistant 负责：

1. 回答工具使用方式。
2. 解释当前选中节点或当前可见方向。
3. 总结当前画布状态。
4. 处理普通寒暄和非生成类问题。

Chat Assistant 不负责：

1. 生成方向 brief。
2. 调用生图。
3. 修改树结构。
4. 决定 `diverge / refresh / delete / undo / redo`。

## 6. Memory Summarizer

## 6.1 角色定义

Memory Summarizer 是轻量上下文压缩节点，用于把过长的消息历史压缩成可控记忆。它不是创意决策节点，也不是状态写入者。

v1 不需要每轮都调用它。建议在以下情况触发：

1. 最近消息超过固定条数。
2. 估算 token 超过 Brainstorm Assistant 输入预算。
3. 用户连续多轮表达偏好、约束、否定方向或开放问题。

## 6.2 输入

```ts
type MemorySummarizerInput = {
  sessionGoal: string;
  selectedNode?: {
    nodeId: string;
    intentSummary: string;
  };
  recentMessages: Array<{
    role: "user" | "assistant" | "system";
    kind: "intent" | "summary" | "chat" | "node_explanation" | "status";
    content: string;
  }>;
  previousMemory?: {
    stablePreferences: string[];
    activeConstraints: string[];
    rejectedDirections: string[];
    openQuestions: string[];
  };
};
```

## 6.3 输出

```ts
type MemorySummarizerOutput = {
  stablePreferences: string[];
  activeConstraints: string[];
  rejectedDirections: string[];
  openQuestions: string[];
  shortSummary: string;
};
```

## 6.4 System Prompt

```text
## 角色
你是工业设计脑暴会话的记忆摘要助理。

## 任务
把近期消息压缩成短、稳定、可被下游 agent 使用的记忆。只保留会影响后续设计生成或解释的事实。

## 输入
你会收到 sessionGoal、当前节点、近期消息和可选 previousMemory。

## 输出
只能输出 JSON object：
{
  "stablePreferences": ["用户持续偏好的设计倾向"],
  "activeConstraints": ["仍然有效的限制条件"],
  "rejectedDirections": ["用户已经否定或不想继续的方向"],
  "openQuestions": ["仍未解决但会影响后续生成的问题"],
  "shortSummary": "80 字以内中文摘要"
}

## 规则
- 不要创造用户没说过的偏好或约束。
- 不要记录寒暄、状态提示、临时错误和纯系统日志。
- 新消息与 previousMemory 冲突时，以新消息为准。
- 不要决定下一步动作，不要生成方向 brief，不要输出数据库字段。
```

## 6.5 职责边界

Memory Summarizer 负责：

1. 压缩近期消息。
2. 提取稳定偏好、有效约束、已否定方向和开放问题。
3. 为 Brainstorm Assistant 和 Chat Assistant 提供较短上下文。

Memory Summarizer 不负责：

1. 判断 `chat / generation / tree_op`。
2. 判断 `diverge / refresh` 或数量。
3. 生成方向 brief。
4. 写入树结构。

## 7. Orchestrator

## 7.1 角色定义

Orchestrator 是流程控制器和唯一树状态写入者。它优先是程序逻辑，不是自由推理 agent。

## 7.2 职责

Orchestrator 负责：

1. 接收语音、文字和画布操作。
2. 将输入来源归一为标准意图。
3. 做 turn 级意图分流：`chat`、确定性树操作、生成类任务。
4. 为 `chat` 调用模板或 Chat Assistant，并只写入消息。
5. 直接执行 `delete / undo / redo`。
6. 为 `diverge / refresh` 构造 Brainstorm Assistant 输入。
7. 在上下文过长时调用 Memory Summarizer，并把摘要作为下游输入。
8. 校验 Brainstorm Assistant 输出。
9. 创建 generation task 和 branch task。
10. 调用生图助理。
11. 写入 tree nodes、messages、tree operations。
12. 维护当前选中节点、最近执行目标、redo 语义和节点编号。

Orchestrator 不负责：

1. 生成创意方向。
2. 用正则覆盖 LLM 对数量的语义判断。
3. 替代生图助理做视觉表达。
4. 让 agent 直接决定数据库关系。

## 7.3 标准意图归一

```ts
type StandardTurnIntent = {
  sessionId: string;
  userIntentText: string;
  intentKind: "chat" | "generation" | "tree_op";
  requestedAction?: "diverge" | "refresh" | "delete" | "undo" | "redo";
  chatType?: "casual" | "help" | "status" | "explain_node" | "explain_canvas";
  targetNodeId: string;
  source: "voice" | "text" | "canvas";
};
```

`source` 只用于日志、调试和质量评估，不进入 Brainstorm Assistant 的核心创意判断。

## 7.4 Orchestrator 输出

```ts
type OrchestratorTurnResult = {
  taskId?: string;
  operationId?: string;
  stage: "queued" | "reasoning" | "generating" | "responded" | "completed" | "failed";
  affectedNodeIds: string[];
  assistantReply?: string;
  errorMessage?: string;
};
```

## 8. 跨 Agent 验收

1. 不同输入来源能被归一到同一套标准意图。
2. Brainstorm Assistant 不依赖语音专属字段。
3. “设计一个咖啡壶”不得被误判为只生成一个方向。
4. 用户明确要求数量时，Brainstorm Assistant 在 `branchCount` 中体现该理解。
5. Orchestrator 不用正则覆盖 `branchCount`。
6. `delete / undo / redo` 不进入生图链路。
7. `chat` 不创建生成任务、不调用生图、不写树操作。
8. `Memory Summarizer` 只压缩上下文，不影响动作分流和树写入。
9. 生图助理使用英文图像 prompt，用户可见解释保持中文。
10. 每次写树都产生可回放的 `TreeOperation`。
11. 单个分支生图失败时，其余分支仍可落树。

## 9. 评测数据集建议

1. `Standard Intent Set`：原始输入来源、标准意图、目标节点、动作金标。
2. `Brainstorm Output Set`：标准意图、上下文、期望 branchCount 和方向差异评分。
3. `Tree Operation Set`：delete / undo / redo 的目标节点和期望树变化。
4. `Quantity Understanding Set`：区分“设计一个产品”和“只生成一个方向”。
5. `Chat Routing Set`：区分普通帮助、状态查询、节点解释和生成请求。
6. `Memory Summary Set`：验证偏好、约束、否定方向和开放问题是否被正确压缩。
7. `Sketch Prompt Set`：验证英文生图 prompt 是否忠实执行 brief 并保持同轮差异。
