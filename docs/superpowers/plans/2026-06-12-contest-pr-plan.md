# Voice Industrial Design Contest PR Plan

> **给执行任务的 agent：** 提交时严格遵守比赛规则。每个 PR 只做一件事；主分支在每次合并后都必须可运行；所有 PR 描述必须完整填写“功能描述 / 实现思路 / 测试方式”。

**目标：** 将语音工业设计脑暴 MVP 拆成连续、小粒度、可合并的 PR，满足比赛“持续交付、禁止最后一天一次性导入代码”的要求。

**原则：**
1. 每个 PR 只做一件事。
2. PR 粒度尽量小，优先 1 到 3 天内可完成并可合并。
3. 每个 PR 合并后，`main` 必须保持可启动、可演示或至少文档与工程结构一致可检查。
4. 如使用第三方依赖或复用既有代码，必须在 PR 描述和 `README.md` 中说明。

---

## 一、提交节奏要求

- 建议全程维持持续 commit，不要堆到最后一天。
- 建议每个 PR 内保留 2 到 5 个自然 commit。
- 建议每周至少合并 2 到 3 个 PR；如果周期更短，则按“每完成一个闭环就发一个 PR”执行。
- 所有 commit 时间必须落在比赛有效时间窗内。

## 二、分支与命名约定

### 分支命名

- `contest/docs-baseline`
- `contest/repo-scaffold`
- `contest/shared-schemas`
- `contest/frontend-workspace-shell`
- `contest/mock-voice-flow`
- `contest/server-core`
- `contest/confirmation-flow`
- `contest/siliconflow-text`
- `contest/image-generation`
- `contest/integration-and-undo`
- `contest/tests-and-readme`

### commit 命名

- `docs: freeze MVP requirements and technical decisions`
- `chore: scaffold monorepo structure`
- `feat: add shared task and tree schemas`
- `feat: add workspace shell and recording bar`
- `feat: wire confirmation state flow`

### PR 标题格式

- `[contest] 补充 MVP 文档基线`
- `[contest] 初始化 monorepo 工程结构`
- `[contest] 新增 shared schemas 与常量`

## 三、PR 描述模板

每个 PR 都必须至少包含以下四段：

```md
## 功能描述
- 这个 PR 新增/修改了什么
- 用户或开发者怎么使用

## 实现思路
- 为什么这样设计
- 核心实现逻辑或技术选型

## 测试方式
- 运行了哪些命令
- 手动如何验证

## 备注
- 使用了哪些第三方依赖
- 是否复用了既有代码；如有，注明来源和改造范围
```

## 四、PR 拆分计划

### PR 1：补充 MVP 文档基线

**目标：** 先把需求、技术、agent、实施计划、TODO 和比赛提交流程固定下来。

**范围：**
- 文档整理
- `TODO.md`
- PR 计划
- `README.md` 初版

**验证：**
- 文档路径正确
- `README.md` 能说明项目目标、范围和依赖

### PR 2：初始化 monorepo 工程结构

**目标：** 建立 `apps/web`、`apps/server`、`packages/shared`、`tests` 的基本目录与包管理配置。

**范围：**
- workspace 配置
- 基础 package scripts
- `.gitignore`
- `.env.example`
- `docker-compose.yml`

**验证：**
- 安装依赖成功
- 基础命令可运行

### PR 3：新增 shared schemas 与常量

**目标：** 固定前后端共用的核心类型与规则。

**范围：**
- `Session`
- `Message`
- `TreeNode`
- `GenerationTask`
- `BranchTask`
- `TreeOperation`
- 高风险确认规则表
- 节点命名规则
- `Drizzle` 相关共享常量与 schema 对齐约束

**验证：**
- shared schema 测试通过

### PR 4：搭建前端工作台骨架

**目标：** 做出“直接进入工作台”的基本页面结构。

**范围：**
- `TopBar`
- `CanvasWorkspace`
- `ConversationPanel`
- `CurrentTargetBanner`
- `RecordingBar`

**验证：**
- 前端本地启动成功
- 页面结构符合文档设计

### PR 5：补充 mock 语音流程页面

**目标：** 在不接真实后端的前提下，用 mock 数据跑通主交互。

**范围：**
- 首轮生成 mock
- 高风险确认 mock
- 节点选中 mock
- 运行时展开、完成后折叠

**验证：**
- 手工演示 4 条核心流程

### PR 6：实现后端 session / task / tree 主干

**目标：** 完成后端基础数据写入和查询能力。

**范围：**
- 数据库 migration
- repository 层
- `sessions` / `tasks` / `tree` 模块
- 基础 API

**验证：**
- API 集成测试通过

### PR 7：实现高风险确认与状态机

**目标：** 跑通 `awaiting_confirmation` 相关状态流。

**范围：**
- Orchestrator 状态机
- `confirm` / `cancel`
- `IntentStatusCard` 对应状态
- `ConfirmationCard` 对应数据

**验证：**
- 高风险操作确认测试通过
- 取消后不写树

### PR 8：接入硅基流动 ASR 与 Brainstorm LLM

**目标：** 跑通音频转写和结构化脑暴规划。

**范围：**
- `FunAudioLLM/SenseVoiceSmall`
- `deepseek-ai/DeepSeek-V4-Flash`
- provider gateway
- parse guard / retry / timeout

**验证：**
- 一条真实语音可以生成结构化 action

### PR 9：接入生图与树写入

**目标：** 跑通从 brief 到图片再到节点落树的闭环。

**范围：**
- `Tongyi-MAI/Z-Image-Turbo`
- branch task 并发
- `expand_branches`
- `refresh_layer`
- `branch_deeper`

**验证：**
- 树能正确长出新节点
- `refresh_layer` 只替换当前层新版本

### PR 10：实现单次撤销与前后端联调

**目标：** 完成 MVP 最后一个关键交互闭环。

**范围：**
- 单次撤销
- 前端接真实 API
- 真实录音上传
- 真实任务轮询

**验证：**
- “首轮生成 -> 高风险确认 -> 写树 -> 单次撤销”整链路可跑

### PR 11：测试、README 与演示收口

**目标：** 保证比赛评审时主分支可运行、可理解、可复现。

**范围：**
- e2e
- 演示脚本
- `README.md` 依赖说明
- 已知限制
- 比赛提交自检

**验证：**
- `README.md` 足以支持评委运行
- 关键流程可按演示步骤复现

## 五、每次发 PR 前的检查清单

- [ ] 这个 PR 是否只做一件事
- [ ] `git diff` 中是否没有无关文件
- [ ] `README.md` 是否补充了新增依赖
- [ ] 如果复用旧代码，是否在 PR 描述中注明来源
- [ ] PR 描述是否完整填写“功能描述 / 实现思路 / 测试方式”
- [ ] 合并后主分支是否仍可运行
- [ ] 提交时间是否处于比赛允许区间内

## 六、建议的实际合并顺序

1. PR 1：文档基线
2. PR 2：工程结构
3. PR 3：shared schemas
4. PR 4：前端骨架
5. PR 5：mock 交互
6. PR 6：后端主干
7. PR 7：确认状态机
8. PR 8：ASR + LLM
9. PR 9：生图与写树
10. PR 10：撤销与联调
11. PR 11：测试与 README 收口
