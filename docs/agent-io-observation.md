# V1 Agent 输入输出观察口径

更新时间：2026-06-25

## 范围

本文整理 V1 当前代码中可观察到的 Brainstorm Assistant、Prompt Router、可选 Image Prompt Writer 和 Sketch Generation Gateway 输入输出。观察层只记录链路数据，不改变业务逻辑。

V1 统一口径：

1. Brainstorm Assistant 只负责生成类创意决策，输出方向 brief 和推荐小卡，不负责树写入或完整图像 prompt。
2. Prompt Router / Orchestrator 负责动作分流、目标节点解析、分支任务创建和 `SketchGenerationInput` 构造。
3. 图像 prompt 默认由确定性 Prompt Builder 生成。
4. Image Prompt Writer 是可选调试增强，只在 `IMAGE_PROMPT_WRITER_ENABLED=true` 时调用；失败或输出不合格时回退 Prompt Builder。
5. Sketch Generation Gateway 只负责把最终 prompt set 交给图片模型，并返回图片结果和实际使用的 prompt。

## 总览链路

| 阶段 | 代码位置 | 输入来源 | 输出去向 |
| --- | --- | --- | --- |
| Brainstorm Assistant | `apps/server/src/agents/siliconflow.ts` 的 `runBrainstormAssistant` | `apps/server/src/orchestrator/service.ts` 的 `buildBrainstormInput` | `BrainstormAssistantOutput`，随后进入 Prompt Router |
| Prompt Router / Orchestrator | `apps/server/src/orchestrator/service.ts` 的 `processVoiceTurn`、`persistGeneratedBranches`、`buildSketchInput` | 脑暴输出的 `actionType`、`targetNodeId`、`directionBriefs` | 每个 direction brief 被转换为 `SketchGenerationInput` |
| Image Prompt Writer | `apps/server/src/agents/siliconflow.ts` 的 `resolveSketchPromptSet` | `SketchGenerationInput` 和确定性 fallback prompt set | 改写后的 prompt set；失败时返回 fallback |
| Sketch Generation Gateway | `apps/server/src/agents/siliconflow.ts` 的 `generateSketch` | 最终 prompt set | `/images/generations` 请求与 `SketchGenerationOutput` |

## Brainstorm Assistant

| 项 | 内容 |
| --- | --- |
| 输入类型 | `BrainstormAssistantInput` |
| 输出类型 | `BrainstormAssistantOutput` |
| 模型配置 | `DEEPSEEK_BRAINSTORM_MODEL` 或 `SILICONFLOW_BRAINSTORM_MODEL`，取决于 gateway 路径 |
| 请求格式 | Chat completion JSON mode |
| 系统约束 | 只能输出 JSON object；决定 `diverge` 或 `refresh`；保留初始设计目标、父节点上下文和祖先链路；默认直接执行；每个 brief 必须有 3 条 `suggestedFollowups` |

### 脑暴输入字段

| 字段 | 类型/结构 | 来源 | 作用 |
| --- | --- | --- | --- |
| `sessionGoal` | string | 当前 session 的 `goal` | 全局设计目标，后续轮次必须继承 |
| `transcriptText` | string | 用户输入或语音转写文本 | 本轮用户需求 |
| `selectedNodeId` | string | 当前选中节点或 root session id | 本轮操作目标 |
| `selectedNodeSummary` | object | 当前节点摘要；root 时由 session title/goal 构造 | 告诉脑暴助理当前基准节点是什么 |
| `ancestorPath` | array | `buildAncestorPath(targetNode, treeNodes)` | 保留从 root 到当前节点的语义链路 |
| `conversationHistory` | array | `buildConversationHistory(sessionMessages)` | 最近 transcript/summary/chat 等对话上下文 |
| `conversationMemory` | optional object | 记忆摘要助理输出 | 长对话后的稳定偏好、约束、拒绝方向等 |
| `siblingSummaries` | array | 与目标节点同父级的节点摘要 | 防止同层方向重复 |
| `constraints` | object | config + 当前 action/node 推导 | 控制分支数量、产品域、草图阶段、输入模式 |

### 脑暴输出字段

| 字段 | 类型/结构 | 下游用途 |
| --- | --- | --- |
| `actionType` | `diverge` 或 `refresh` | 决定是新增子方向还是刷新当前层最新 child group |
| `targetNodeId` | string | 写入 `GenerationTask.targetNodeId`，并作为生成挂载目标 |
| `branchCount` | number | 决定创建几个 `BranchTask` |
| `designIntentSummary` | string | 写入任务摘要 |
| `assistantReply` | string | 作为 assistant summary message 显示给用户 |
| `promptHints` | string[] | 脑暴侧提示词线索，目前主要保留在输出对象中 |
| `directionBriefs` | `VisualDirectionBrief[]` | 后续每个 brief 都会进入 Prompt Router 和生图链路 |

### `VisualDirectionBrief` 结构

| 字段 | 用途 |
| --- | --- |
| `briefId` | brief 内部 id |
| `targetParentNodeId` | 目标父节点 id |
| `label` / `displayName` | 节点短标签和显示名 |
| `intentSummary` | 方向意图摘要，进入节点卡和生图 prompt |
| `formLanguage` | 形态语言关键词 |
| `userNeedResponse` | 对用户需求的响应点 |
| `inspirationHints` | 灵感参考关键词 |
| `suggestedFollowups` | 节点下方 3 个推荐发散小卡 |
| `variationAxis` | 同轮方向差异轴 |
| `promptIntent` | 生图核心视觉意图的主要来源 |

## Prompt Router / Orchestrator

这里不是独立模型，而是后端编排逻辑。

| 输入 | 处理逻辑 | 输出 |
| --- | --- | --- |
| `assistantOutput.actionType` | `refresh` 时找到目标父节点下最新 child group 并 supersede；`diverge` 时新增一组子方向 | 节点挂载策略、layer version、child group id |
| `assistantOutput.targetNodeId` | 解析目标节点；root 时 `parentNodeId = null` | 节点深度、父子关系 |
| `assistantOutput.directionBriefs` | 逐个创建/更新 `BranchTask`，并传入 `buildSketchInput` | `SketchGenerationInput[]` |
| `session.goal`、`targetNode`、`treeNodes`、`conversationHistory` | 拼入 brief 的 `promptIntent` 扩展上下文 | 生图 prompt 的上下文增强 |

### `buildSketchInput` 对 brief 的增强

| 增强片段 | 内容来源 |
| --- | --- |
| 原始 `brief.promptIntent` | 脑暴输出 |
| `主需求：...` | `session.goal` |
| `线路上下文：...` | session goal + ancestor path + target node intent |
| `当前延展节点：...` | target node displayName + intentSummary，root 时为 `root 总需求` |
| `最近对话历史：...` | user/assistant conversation history |
| `同轮差异轴：...` | sibling brief displayName + variationAxis |

## Image Prompt Writer

| 项 | 内容 |
| --- | --- |
| 开关 | `IMAGE_PROMPT_WRITER_ENABLED` |
| 模型配置 | `DEEPSEEK_IMAGE_PROMPT_MODEL`，未配置时回退到脑暴模型 |
| 输入 | `SketchGenerationInput` + Prompt Builder 生成的 fallback prompt set |
| 输出 | `{ prompt, negativePrompt, visualSummary }` |
| 回退 | 调用失败、JSON 解析失败或字段不完整时使用 fallback prompt set |

Image Prompt Writer 不参与树语义决策。它不能改写 `actionType`、`branchCount`、`directionBriefs`、节点关系或任务写入策略，只负责把已确定的 brief 改写成更适合图片模型的 prompt。

## Sketch Generation Gateway

| 项 | 内容 |
| --- | --- |
| 输入类型 | `SketchGenerationInput` |
| 默认 prompt 来源 | `apps/server/src/agents/sketch-prompt-builder.ts` |
| 可选 prompt 来源 | Image Prompt Writer |
| 模型配置 | `.env` 的 `SILICONFLOW_IMAGE_MODEL` |
| API | `POST /images/generations` |
| 输出类型 | `SketchGenerationOutput` |

### 生图输入字段

| 字段 | 类型/结构 | 来源 | 作用 |
| --- | --- | --- | --- |
| `brief` | `VisualDirectionBrief` | 脑暴输出 + 编排增强后的 `promptIntent` | 生图主内容 |
| `sessionStyle.sketchTone` | string | Orchestrator 策略 | 控制草图松散程度 |
| `sessionStyle.detailLevel` | string | Orchestrator 策略 | 控制早期草图阶段 |
| `sessionStyle.productDomain` | string | 固定为 `industrial_design` | 产品域 |
| `depthContext.depth` | number | 目标节点深度 | 判断首层/深层 |
| `depthContext.branchStage` | `first_layer` 或 `deeper_layer` | depth 推导 | 控制宽泛发散或沿选中方向收敛 |
| `siblingContext` | array | 同轮 brief 摘要 | 强化差异化对比 |

### Prompt set 字段

| 字段 | 内容 |
| --- | --- |
| `briefId` | brief id |
| `prompt` | 英文生图 prompt |
| `negativePrompt` | 负向 prompt |
| `promptLanguage` | `en` |
| `visualSummary` | 中文视觉摘要 |

### 默认 Prompt Builder 结构

| 顺序 | Prompt 片段 |
| --- | --- |
| 1 | `Early industrial design concept sketch for product design ideation.` |
| 2 | `Concept direction: {displayName}.` |
| 3 | `Design intent: {intentSummary}.` |
| 4 | `Variation axis: {variationAxis}.` |
| 5 | `Form language: {formLanguage}.` |
| 6 | `User need response: {userNeedResponse}.` |
| 7 | `Inspiration cues: {inspirationHints}.` |
| 8 | `Core visual intent: {promptIntent}.` |
| 9 | `Sketch tone: loose/controlled.` |
| 10 | `Detail level: early/mid.` |
| 11 | `Branch stage: first_layer/deeper_layer.` |
| 12 | 首层强调 loose、exploratory；深层强调 controlled、continuity |
| 13 | early 阶段避免小技术细节 |
| 14 | 强调 silhouette、proportion、key surfaces、material cues、interaction areas |
| 15 | 固定加入 loose marker sketch、clean linework、subtle grey shading、white background |
| 16 | 要求 one coherent product concept only |

### 生图 API 请求体

| 字段 | 当前值 |
| --- | --- |
| `model` | `.env` 的 `SILICONFLOW_IMAGE_MODEL` |
| `prompt` | 最终 prompt set 的 `prompt` |
| `negative_prompt` | 最终 prompt set 的 `negativePrompt` |
| `batch_size` | `1` |

### 生图输出字段

| 字段 | 来源 | 下游用途 |
| --- | --- | --- |
| `imageId` | `siliconflow-{seed 或 briefId}` | 输出记录 id |
| `briefId` | 输入 brief id | 对齐 branch |
| `imageUrl` | SiliconFlow 响应的 `images[0].url` 或 `data[0].url` | 写入 branch task 和 tree node |
| `promptUsed` | 最终 prompt set 的 prompt | 返回给编排层，观察层会记录 |
| `negativePromptUsed` | 最终 prompt set 的 negative prompt | 返回给编排层，观察层会记录 |
| `visualSummary` | 最终 prompt set 的 visual summary | 返回给编排层，观察层会记录 |

## 当前可见性缺口

| 缺口 | 现状 | 影响 |
| --- | --- | --- |
| 脑暴原始模型响应未持久化 | 解析后只保存任务摘要、assistantReply、briefs；观察层记录规范化前输出 | 无法从业务 API 回看原始 JSON 文本和规范化前差异 |
| 生图 `promptUsed` 未持久化到业务记录 | `generateSketch` 返回，但只把 `imageUrl` 写入 branch task/node；观察层记录 `promptSet` 和 `sketchOutput` | 事后无法从 tree API 查到每张图实际使用的 prompt |
| Prompt 路由决策没有业务表记录 | 观察层记录路由输入和创建出的 branch tasks | 仍未持久化，只能从日志或 Markdown 回看 |

## 已加观察层

后端现在会向 stdout 输出结构化 JSON 日志，并把同一份内容追加写入 `logs/agent-observation.md`。stdout 统一格式如下：

```json
{
  "event": "agent_observation",
  "stage": "brainstorm_assistant.input",
  "timestamp": "2026-06-25T13:29:10.840Z",
  "payload": {}
}
```

| stage | 触发位置 | payload 主要内容 |
| --- | --- | --- |
| `brainstorm_assistant.input` | 调用脑暴助理前 | `sessionId`、`selectedNodeId`、`transcriptText`、`assistantInput` |
| `brainstorm_assistant.output` | 脑暴助理返回后、规范化前 | `sessionId`、`selectedNodeId`、`rawAssistantOutput` |
| `prompt_router.input` | 脑暴输出校验通过后 | `sessionId`、`selectedNodeId`、`transcriptText`、`assistantOutput` |
| `prompt_router.output` | branch tasks 创建后 | `sessionId`、`taskId`、`actionType`、`targetNodeId`、`branchTasks` |
| `image_prompt_writer.input` | 可选 Prompt Writer 调用前 | `model`、`briefId`、`sketchInput`、`fallbackPromptSet` |
| `image_prompt_writer.output` | 可选 Prompt Writer 返回或回退时 | `model`、`briefId`、`promptSet`、`fallback`、`error` |
| `image_assistant.input` | 生图 API 调用前 | `model`、`briefId`、`sketchInput`、`promptSet` |
| `image_assistant.output` | 生图输出解析后 | `model`、`briefId`、`sketchOutput` |

## 后续可选增强

| 方案 | 做什么 | 优点 | 注意 |
| --- | --- | --- | --- |
| Debug API | 暴露最近 N 条 agent trace | 前端/浏览器可查看 | 需要注意只在 dev 开启 |
| 持久化 agent trace 表 | 记录 input/output/promptUsed/imageUrl | 可回溯历史 | 改动较大，涉及 schema |
