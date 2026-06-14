# Voice Industrial Design MVP TODO

> 当前 TODO 基于以下文档整理：
> - `D:\Users\HCI_lab\Documents\voice-painting\docs\superpowers\specs\需求文档.md`
> - `D:\Users\HCI_lab\Documents\voice-painting\docs\superpowers\specs\技术方案.md`
> - `D:\Users\HCI_lab\Documents\voice-painting\docs\superpowers\specs\agent-PRD.md`

## 0. 路线冻结与仓库准备

- [x] 确认 `packages/shared`、`apps/web`、`apps/server`、`tests` 的目录结构
- [x] 在仓库根目录新增 `README.md`，写明比赛背景、项目目标、MVP 范围
- [x] 在 `README.md` 列明依赖和框架：`Next.js`、`React Flow`、`Zustand`、`Fastify`、`BullMQ`、`PostgreSQL`、`Redis`、`Drizzle`、硅基流动 API
- [x] 在 `README.md` 明确原创功能范围：纯语音交互、树状态写入、节点命名、确认机制、单次撤销
- [x] 在仓库补充 `.gitignore`
- [x] 选择最终 query builder：`Drizzle`
- [x] 补充 `.env.example`
- [x] 补充 `docker-compose.yml`，至少包含 `PostgreSQL` 和 `Redis`

## 1. 文档与比赛合规

- [ ] 整理并统一文档命名，避免同一概念多文件重复表述
- [ ] 检查三份规格文档中的字段命名是否一致
- [x] 在 `README.md` 补充本地启动步骤
- [x] 在 `README.md` 补充第三方服务说明和申请方式
- [x] 在 `README.md` 补充“当前未完成项与原因”
- [x] 准备 PR 描述模板，包含比赛要求的 4 个部分
- [x] 准备 commit 命名约定和 PR 命名约定

## 2. Shared Contracts 与常量

- [x] 初始化 `packages/shared`
- [x] 定义 `Session` schema
- [x] 定义 `Message` schema
- [x] 定义 `TreeNode` schema
- [x] 定义 `GenerationTask` schema
- [x] 定义 `BranchTask` schema
- [x] 定义 `TreeOperation` schema
- [x] 定义 `BrainstormAssistantInput/Output`
- [x] 定义 `SketchGenerationInput/Output`
- [x] 固化任务状态枚举：`queued`、`transcribing`、`reasoning`、`awaiting_confirmation`、`generating`、`completed`、`failed`、`cancelled`
- [x] 固化高风险确认规则表
- [x] 固化节点命名规则
- [x] 固化节点引用优先级：数字序号 -> 名称 -> 层内序号
- [x] 为 shared schema 写测试

## 3. 数据库与持久层

- [x] 设计 `sessions` 表
- [x] 设计 `messages` 表
- [x] 设计 `tree_nodes` 表
- [x] 设计 `generation_tasks` 表
- [x] 设计 `branch_tasks` 表
- [x] 设计 `tree_operations` 表
- [x] 定义 `publicNodeNumber` 的分配策略
- [x] 定义 `layerVersion` 的写入策略
- [x] 定义 `supersededNodeIds` 与 `restoredNodeIds` 的回滚语义
- [x] 补充第一版 SQL DDL 草案
- [ ] 用 `Drizzle` 落正式 migration
- [ ] 实现 repository / data-access 层
- [ ] 为持久层写集成测试

## 4. 后端基础骨架

- [x] 初始化 `apps/server`
- [x] 搭建 `Fastify` 应用入口
- [x] 注册配置模块
- [ ] 注册数据库连接
- [ ] 注册 Redis / BullMQ
- [ ] 搭建基础日志和错误处理
- [x] 定义 `sessions` 模块
- [x] 定义 `tasks` 模块
- [x] 定义 `tree` 模块
- [x] 定义 `orchestrator` 模块
- [x] 定义 `agents` 模块
- [ ] 定义 `media` 模块

## 5. 后端 API

- [x] 实现 `POST /api/sessions`
- [x] 实现 `GET /api/sessions/:sessionId/tree`
- [x] 实现 `GET /api/sessions/:sessionId/messages`
- [x] 实现 `POST /api/sessions/:sessionId/voice-turns`
- [x] 实现 `GET /api/tasks/:taskId`
- [x] 实现 `POST /api/tasks/:taskId/confirm`
- [x] 实现 `POST /api/tasks/:taskId/cancel`
- [x] 实现 `POST /api/sessions/:sessionId/undo`
- [x] 为 API 写请求校验
- [x] 为 API 写集成测试

## 6. Orchestrator 与任务状态机

- [x] 实现语音 turn 接收与任务创建
- [x] 实现 ASR 调用编排
- [x] 实现上下文收集：当前节点、祖先路径、兄弟节点摘要
- [x] 实现 Brainstorm Assistant 调用
- [x] 实现 assistant 输出 schema 校验
- [x] 实现高风险操作判断
- [x] 实现复述改写文本生成与 `awaiting_confirmation`
- [ ] 实现确认后继续生成
- [x] 实现取消后只读结束
- [ ] 实现 BranchTask 拆分与并发
- [ ] 实现所有结果写回 session、message、task、tree
- [x] 为状态机写测试

## 7. 树写入与单次撤销

- [x] 实现 `expand_branches` 写树
- [ ] 实现 `refresh_layer` 写树
- [ ] 实现 `branch_deeper` 写树
- [x] 实现 `TreeOperation` 记录
- [ ] 实现单次撤销的可撤销检查
- [ ] 实现单次撤销的确认流程
- [ ] 实现单次撤销的树恢复逻辑
- [ ] 为写树与撤销写集成测试

## 8. 硅基流动模型接入

- [x] 实现 `SiliconFlowGateway`
- [ ] 接入 `FunAudioLLM/SenseVoiceSmall`
- [ ] 接入 `deepseek-ai/DeepSeek-V4-Flash`
- [ ] 接入 `Tongyi-MAI/Z-Image-Turbo`
- [ ] 实现 provider timeout / retry / parse guard
- [ ] 记录 prompt 与模型元数据
- [ ] 为 provider 层准备 mock fixtures

## 9. 前端基础骨架

- [x] 初始化 `apps/web`
- [x] 搭建 `Next.js` 基础页面
- [x] 接入基础样式
- [x] 接入 `React Flow`
- [x] 搭建 `Zustand` store
- [x] 定义服务端状态镜像结构
- [x] 定义本地 UI 状态结构

## 10. 前端核心组件

- [x] 实现 `TopBar`
- [x] 实现 `CanvasWorkspace`
- [x] 实现 `BrainstormNodeCard`
- [x] 实现 `ConversationPanel`
- [x] 实现 `CurrentTargetBanner`
- [x] 实现 `RecordingBar`
- [x] 实现 `IntentStatusCard`
- [x] 实现 `ConfirmationCard`
- [x] 实现运行中展开、完成后折叠的消息展示策略
- [x] 实现节点高亮与当前目标态

## 11. Mock 页面与交互

- [x] 用 mock 数据跑通首轮生成页面
- [x] 用 mock 数据跑通高风险确认页面
- [x] 用 mock 数据跑通单次撤销页面
- [x] 用 mock 数据跑通节点选中页面
- [x] 准备演示用 fixture：首层 4 个方向、下钻 3 个方向、刷新当前层结果

## 12. 前后端联调

- [x] 用真实 API 替换 session mock
- [x] 用真实 API 替换 tree mock
- [x] 用真实 API 替换 message mock
- [x] 用真实 API 替换 task mock
- [x] 接通 confirm / cancel / undo
- [x] 接通真实录音上传
- [x] 确认 `awaiting_confirmation` 页面状态正确
- [x] 确认 branch 部分失败可以正确展示

## 13. 测试与验收

- [ ] 跑通 shared schema 测试
- [x] 跑通后端集成测试
- [ ] 跑通前端组件测试
- [ ] 跑通首轮生成 e2e
- [ ] 跑通高风险确认 e2e
- [ ] 跑通单次撤销 e2e
- [ ] 跑通节点选中 e2e
- [ ] 检查主分支在每次合并后都可运行

## 14. 演示与交付

- [ ] 准备比赛演示脚本
- [ ] 准备比赛截图素材
- [ ] 在 `README.md` 补充演示说明
- [ ] 在 `README.md` 补充依赖说明
- [ ] 在 `README.md` 补充已知限制
- [ ] 整理最终提交前的自检清单
