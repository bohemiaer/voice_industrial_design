# 语音脑暴 MVP 实施计划

> **给执行任务的 agent：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐条执行。步骤使用 `- [ ]` 复选框格式追踪进度。

**目标：** 完成第一版纯语音工业设计脑暴画布 MVP，包括语音输入、语音选中、脑暴规划、高风险确认、草图生成、树写入和单次撤销。

**架构：** 采用单仓库结构，包含 `apps/web`、`apps/server`、`packages/shared`。前端负责纯语音工作台和状态呈现，后端负责任务状态机、树状态写入、节点编号、硅基流动模型调用和确认机制。

**技术栈：** TypeScript、Next.js、Fastify、PostgreSQL、Redis、BullMQ、React Flow、OpenAI 兼容 SDK 或直接 HTTP 客户端、Zod、Vitest、Playwright、Zustand、Drizzle。

---

## 一、路线决策

这一阶段不是写代码，而是冻结实现路线，避免后面返工。

### 已冻结的核心决策

- [x] MVP 只支持语音主链路，不依赖鼠标和键盘输入
- [x] 高风险操作使用固定确认规则表
- [x] 每个节点都有稳定名称和全局唯一数字序号 `publicNodeNumber`
- [x] `refresh_layer` 使用版本化层替换，不做新旧版本对比 UI
- [x] MVP 只支持撤销最近一次已确认操作，不支持 redo
- [x] MVP 不启用视觉 review 主链路
- [x] 模型供应商固定为硅基流动（SiliconFlow）
- [x] ASR 固定为 `FunAudioLLM/SenseVoiceSmall`
- [x] Brainstorm LLM 固定为 `deepseek-ai/DeepSeek-V4-Flash`
- [x] 图像生成固定为 `Tongyi-MAI/Z-Image-Turbo`
- [x] VLM 不进入 MVP 主链路，后续扩展再评估
- [x] 后端框架固定为 `Fastify`
- [x] 数据访问层固定为轻量 `query builder` 路线，最终采用 `Drizzle`
- [x] 前端状态管理固定为 `Zustand`
- [x] 本地开发方式固定为“应用本地运行 + PostgreSQL / Redis 使用 Docker”

### 开发前还要确认的执行约束

- [ ] 在 PR 1 中明确 `Fastify` 的目录结构与插件注册方式
- [x] 在 PR 1 中明确最终 query builder 为 `Drizzle`
- [ ] 在 PR 1 中明确 `Zustand` store 划分边界
- [ ] 在 PR 1 中补齐 Docker 本地依赖启动说明和环境变量模板

### 当前模型路线说明

- `ASR` 先采用 `FunAudioLLM/SenseVoiceSmall`，优先保证接入稳定和中文语音转写可用。
- `Brainstorm LLM` 先采用 `deepseek-ai/DeepSeek-V4-Flash`，优先满足中文理解、结构化输出和低延迟。
- `图像生成` 先采用 `Tongyi-MAI/Z-Image-Turbo`，优先满足多分支快速出图。
- `VLM` 暂不进入 MVP 主链路；如果后续恢复视觉 review，再评估 `Qwen/Qwen3-Omni-30B-A3B-Instruct`。
- 如后续测试发现结构化输出稳定性不足，`LLM` 备选切换到 `Pro/zai-org/GLM-4.7`。
- 如后续测试发现草图质量明显不足，`图像生成` 备选切换到 `Tongyi-MAI/Z-Image`。
- `后端` 固定采用 `Fastify`，优先保持链路直接、抽象轻量，避免第一版被过重框架拖慢。
- `数据访问层` 固定采用轻量 `query builder` 路线，当前明确采用 `Drizzle`，优先兼顾类型安全与树状态写入可控性。
- `前端状态管理` 固定采用 `Zustand`，前端主要管理 UI 状态和 API 查询结果，不承载复杂业务规则。
- `本地开发方式` 固定为“应用本地运行 + PostgreSQL / Redis 使用 Docker”，兼顾开发效率和环境一致性。

### 本阶段交付物

- 一句话技术路线说明
- 统一的目录结构
- 环境变量清单
- 本地启动方式约定

## 二、开发主线

主线顺序建议如下，后面所有 TODO 和 PR 都围绕这条主线展开：

1. 先把 shared contracts 和数据模型定下来
2. 再把后端任务状态机和树写入语义做扎实
3. 然后打通硅基流动调用和纯语音编排流程
4. 最后接入前端真实页面和交互

### 主线原则

- [ ] 先有 schema，再写 service
- [ ] 先有 mock 流程，再接真实 provider
- [ ] 先让“首轮生成 + 确认 + 写树 + 撤销”闭环跑通，再做 UI 打磨
- [ ] 任何阶段都不把视觉 review 塞回主链路

## 三、页面和流程设计

这一阶段的目标是把页面、状态和交互路径先画清楚，再开始搭前端。

### 页面层级

- [x] 进入应用后直接进入单 `session` 工作台，不单独设计首页跳转
- [x] 页面采用左右双栏：左侧主画布，右侧轻会话区
- [x] 页面顶部只保留轻量 `TopBar`，展示会话标题、连接状态和任务运行状态
- [x] 左侧 `CanvasWorkspace` 作为主空间，展示概念树、当前选中节点、最近新增结果高亮
- [x] 节点卡片最小展示固定为：名称、数字序号、图片、层内序号
- [x] 右侧会话区默认保持简洁，只保留当前节点、录音入口、本轮状态、确认卡片和少量摘要消息
- [x] 系统反馈历史在运行时展开显示，任务完成后自动折叠为一条摘要

### 页面模块

- [x] `TopBar`
- [x] `CanvasWorkspace`
- [x] `CurrentTargetBanner`
- [x] `ConversationPanel`
- [x] `RecordingBar`
- [x] `IntentStatusCard`
- [x] `ConfirmationCard`

### 页面模块要求

- [x] `CurrentTargetBanner` 始终展示当前目标节点名称、数字序号和层内位置
- [x] `ConversationPanel` 必须显示用户转写文本
- [x] `ConversationPanel` 在运行中展示系统反馈历史，完成后自动折叠
- [x] `RecordingBar` 是页面最主要 CTA，始终位于右侧底部
- [x] `IntentStatusCard` 在 reasoning 阶段展示识别到的操作类型、目标节点和预计结果
- [x] `ConfirmationCard` 在高风险操作时展示改写后的执行意图和语音确认提示

### 流程设计

- [x] 首轮流程固定为：录音 -> 转写 -> reasoning -> generating -> 展示首层分支 -> 折叠系统反馈摘要
- [x] 高风险流程固定为：录音 -> 转写 -> reasoning -> `IntentStatusCard` -> awaiting_confirmation -> `ConfirmationCard` -> confirm/cancel -> generating 或结束
- [x] 单次撤销流程固定为：用户发起 -> 系统复述“将撤销最近一次已确认操作” -> 用户确认 -> 回滚最近操作 -> 展示撤销摘要
- [x] 节点选中流程固定为：数字序号优先 -> 名称匹配 -> 层内序号匹配 -> 歧义时进入澄清或确认

### 关键流程约束

- [x] 首轮生成完成后，系统自动选中当前默认活跃节点或当前层
- [x] 高风险取消时，本轮保持只读，不写树
- [x] 节点选择只更新 session 上下文，不直接改树
- [x] 所有完成态都要生成一条短摘要，供右侧会话区折叠显示

### 本阶段交付物

- [ ] 一张页面结构图
- [ ] 一条 happy path 流程图
- [ ] 一条高风险确认流程图
- [ ] 一条单次撤销流程图
- [ ] 一条节点选中流程图

## 四、数据模型和类型

这一阶段优先级很高，建议最先做成第一个可落地 PR。

### Shared schema

- [ ] 定义 `Session`
- [ ] 定义 `Message`
- [ ] 定义 `TreeNode`
- [ ] 定义 `GenerationTask`
- [ ] 定义 `BranchTask`
- [ ] 定义 `TreeOperation`
- [ ] 定义 `BrainstormAssistantInput/Output`
- [ ] 定义 `SketchGenerationInput/Output`

### 关键字段

- [ ] `TreeNode.publicNodeNumber`
- [ ] `TreeNode.displayName`
- [ ] `TreeNode.layerVersion`
- [ ] `GenerationTask.confirmationRequired`
- [ ] `GenerationTask.confirmationStatus`
- [ ] `GenerationTask.rewrittenIntentForConfirmation`
- [ ] `TreeOperation.type`
- [ ] `TreeOperation.supersededNodeIds`
- [ ] `TreeOperation.restoredNodeIds`

### 类型约束

- [ ] 固化高风险确认规则表
- [ ] 固化任务状态枚举
- [ ] 固化单次撤销约束
- [ ] 固化节点命名规则

### 本阶段交付物

- [ ] `packages/shared` 初版完成
- [ ] schema 测试通过
- [ ] 所有后端和前端后续开发都引用 shared 类型

## 五、前端基础和组件

这一阶段先不接真实后端，先把工作台基础结构搭起来。

### 基础工程

- [ ] 初始化 `apps/web`
- [ ] 接入基础样式方案
- [ ] 接入 React Flow
- [ ] 配置 session store

### 基础组件

- [ ] `CanvasWorkspace`
- [ ] `BrainstormNodeCard`
- [ ] `ConversationPanel`
- [ ] `RecordingButton`
- [ ] `IntentStatusCard`
- [ ] `ConfirmationCard`
- [ ] `CurrentTargetBanner`

### 组件要求

- [ ] 节点卡片必须展示数字序号
- [ ] 会话区必须展示当前选中节点
- [ ] 必须有 `awaiting_confirmation` 的视觉状态
- [ ] 页面不得依赖鼠标操作才能展示主状态

### 本阶段交付物

- [ ] 可运行但未接后端的基础页面
- [ ] 基础组件可独立渲染
- [ ] 组件状态可由本地 mock store 驱动

## 六、Mock 前端页面和交互

这一阶段让前端先用假数据把产品走通。

### Mock 数据

- [ ] 构造 mock session
- [ ] 构造 mock tree nodes
- [ ] 构造 mock messages
- [ ] 构造 mock task states
- [ ] 构造 mock confirmation payload

### Mock 流程

- [ ] 模拟首轮生成成功
- [ ] 模拟高风险确认等待
- [ ] 模拟用户确认后进入生成
- [ ] 模拟单次撤销确认与回滚结果
- [ ] 模拟单个 branch 失败但其余成功

### 本阶段交付物

- [ ] 页面能完整演示 happy path
- [ ] 页面能完整演示高风险确认
- [ ] 页面能完整演示单次撤销

## 七、真实后端和产品 API

这一阶段是后端主实现，建议拆成两个 PR：持久层/状态机一个，编排/接口一个。

### 持久层

- [ ] 建 sessions 表
- [ ] 建 messages 表
- [ ] 建 tree_nodes 表
- [ ] 建 generation_tasks 表
- [ ] 建 branch_tasks 表
- [ ] 建 image_assets 表
- [ ] 建 tree_operations 表

### 服务层

- [ ] `session.service.ts`
- [ ] `task.service.ts`
- [ ] `tree.service.ts`
- [ ] `voice-control.service.ts`
- [ ] `orchestrator.service.ts`
- [ ] `confirmation.service.ts`

### API

- [ ] `POST /api/sessions`
- [ ] `POST /api/sessions/:sessionId/voice-turns`
- [ ] `GET /api/tasks/:taskId`
- [ ] `POST /api/tasks/:taskId/confirm`
- [ ] `POST /api/tasks/:taskId/cancel`
- [ ] `POST /api/sessions/:sessionId/undo`
- [ ] `GET /api/sessions/:sessionId/tree`
- [ ] `GET /api/sessions/:sessionId/messages`

### 硅基流动接入

- [ ] `FunAudioLLM/SenseVoiceSmall`
- [ ] `deepseek-ai/DeepSeek-V4-Flash`
- [ ] `Tongyi-MAI/Z-Image-Turbo`
- [ ] provider timeout / retry / parse guard

### 本阶段交付物

- [ ] 后端可本地运行
- [ ] 首轮生成 API 能返回任务状态
- [ ] 高风险确认 API 可运行
- [ ] 单次撤销 API 可运行

## 八、替换 mock 数据源

这一阶段把前端从本地 mock store 切换到真实 API。

### 替换内容

- [ ] 录音上传改为真实请求
- [ ] session 初始化改为真实请求
- [ ] task 查询改为真实请求
- [ ] confirm/cancel 改为真实请求
- [ ] undo 改为真实请求
- [ ] tree/messages 改为真实请求

### 状态同步

- [ ] 前端读取真实 `activeNodeId`
- [ ] 前端读取真实 `pendingNodeId`
- [ ] 前端读取真实 `publicNodeNumber`
- [ ] 前端正确展示 `awaiting_confirmation`
- [ ] 前端正确处理 branch 部分失败

### 本阶段交付物

- [ ] 前端移除主要 mock 数据源
- [ ] 页面可连真实后端跑通主流程

## 九、视觉、状态和响应式验收

这一阶段不再加新能力，重点做产品验收。

### 页面验收

- [ ] 左右布局在桌面端正常
- [ ] 小屏幕下不破版
- [ ] 节点卡片信息密度合理
- [ ] 确认卡片足够清晰

### 状态验收

- [ ] `queued` 状态可见
- [ ] `transcribing` 状态可见
- [ ] `reasoning` 状态可见
- [ ] `awaiting_confirmation` 状态可见
- [ ] `generating` 状态可见
- [ ] `completed` 状态可见
- [ ] `failed` 状态可见

### 交互验收

- [ ] 不点击鼠标也能走通主链路
- [ ] 节点数字序号始终可见
- [ ] 单次撤销提示明确
- [ ] 错误态不会静默失败

### 本阶段交付物

- [ ] 一版可演示页面
- [ ] 一版答辩可截图页面

## 十、测试和验证

这是最后的收口阶段，但关键测试可以提前插入各开发阶段。

### 单元与集成测试

- [ ] shared schema 测试
- [ ] 任务状态机测试
- [ ] 语音控制解析测试
- [ ] 高风险确认规则测试
- [ ] `refresh_layer` 测试
- [ ] 单次撤销测试
- [ ] branch 部分失败测试

### 端到端测试

- [ ] 首轮语音输入 -> 首层生成
- [ ] 高风险操作 -> 等待确认 -> 用户确认 -> 成功写树
- [ ] 高风险操作 -> 用户取消 -> 不写树
- [ ] 单次撤销 -> 回滚最近操作

### 手工验证

- [ ] 用真实语音走一遍 happy path
- [ ] 用歧义节点引用走一遍确认路径
- [ ] 用“12 号节点”走一遍数字序号优先路径
- [ ] 用 branch 失败样本看是否部分成功

### 本阶段交付物

- [ ] `pnpm test` 通过
- [ ] `pnpm playwright test` 通过
- [ ] 一份演示 checklist

---

## 十一、PR 计划

这里不按技术层拆，而按你给的推进流程和实际闭环需求来拆。

### PR 1：路线冻结 + shared contracts

**目的：** 先把路线、类型、规则定死，避免后面返工。

**包含：**
- monorepo 基础结构
- `packages/shared`
- 高风险确认规则表
- 节点命名规则
- 任务状态枚举

**不要包含：**
- 真实 provider 调用
- 前端复杂页面

### PR 2：页面骨架 + mock 交互

**目的：** 先让产品页面和主要状态在前端跑起来。

**包含：**
- `apps/web` 基础页面
- 画布和会话区组件
- mock session/tree/task/messages
- mock 确认和撤销交互

**不要包含：**
- 真实 API
- 真实录音上传

### PR 3：持久层 + 后端任务主干

**目的：** 让后端具备真实 session/task/tree 基础能力。

**包含：**
- 数据库 schema
- session / task / tree service
- API 基础接口
- 单次撤销底层模型

**不要包含：**
- 硅基流动真调用
- 前端接入

### PR 4：硅基流动编排链路

**目的：** 跑通转写、脑暴、确认、生图、树写入这条主链路。

**包含：**
- SiliconFlow gateway
- voice control service
- orchestrator
- generation worker
- confirm / cancel 逻辑

**不要包含：**
- 前端真实替换
- 视觉 review

### PR 5：前端接真实 API

**目的：** 把前端从 mock 切到真实后端。

**包含：**
- 录音上传
- 任务状态查询
- 确认/取消/撤销接口接入
- 真实树与消息加载

**不要包含：**
- 视觉 polish
- 非 MVP 新功能

### PR 6：验收与测试收口

**目的：** 收敛 bug、补测试、完成演示准备。

**包含：**
- 集成测试
- e2e
- 响应式与状态验收
- README / demo seed / checklist

---

## 十二、建议的实际开发顺序

如果只看“今天开始写代码先做什么”，建议这样排：

1. PR 1
2. PR 3
3. PR 4
4. PR 2
5. PR 5
6. PR 6

原因是：
- 共享类型和规则必须先定
- 后端主干比前端 mock 更值得优先打稳
- 真实链路打通后，再让前端替换 mock 会更省时间

## 十三、可直接使用的 PR 标题

1. `chore: freeze mvp contracts and shared schemas`
2. `feat: add mock voice brainstorming workbench`
3. `feat: add persistence layer and task backbone`
4. `feat: implement openai orchestration pipeline`
5. `feat: connect web workbench to real backend`
6. `test: add validation coverage and demo readiness`
