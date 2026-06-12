# Voice Industrial Design

一个面向工业设计前期发散场景的纯语音脑暴工作台。用户不依赖鼠标和键盘文字输入，只通过语音描述需求、选择方向、确认高风险操作和撤销最近一次树操作，让模糊需求逐步长成一棵概念草图树。

## 当前阶段

当前仓库处于比赛开发早期阶段，已经完成：

- 需求文档、技术方案、Agent PRD、实施计划
- 比赛提交策略与 PR 计划
- 一版 HTML 预览工作台原型
- monorepo 基础工程结构初始化
- `packages/shared` 的首版共享 schema、常量与测试

当前仓库已经补齐 `apps/web`、`apps/server`、`packages/shared` 的基础骨架，并完成了首版共享 schema 建模；主分支目前可复现的是文档基线、静态工作台预览、monorepo 初始化结构和 shared contracts。

## MVP 范围

当前 MVP 计划实现：

- 纯语音工作台
- 树状概念分支画布
- 语音节点选中
- 高风险树操作复述确认
- 多分支草图生成
- 节点稳定命名与数字序号引用
- 单次撤销最近一次已确认树操作

当前 MVP 明确不做：

- 多人协作
- 高保真渲染
- CAD / 建模链路集成
- 鼠标驱动的复杂白板编辑
- 键盘文字输入作为主要创作路径
- 视觉 review 主链路

## 原创功能范围

本项目的原创功能重点为：

- 纯语音交互闭环
- 树状态写入与版本化层替换
- 节点命名与数字序号引用
- 高风险树操作确认机制
- 单次撤销语义与回滚逻辑

第三方框架和模型服务仅作为基础设施，不替代上述核心交互与产品逻辑设计。

## 计划技术栈

以下为当前文档已经冻结、后续将逐步接入仓库的技术选型：

- 前端：`Next.js`、`TypeScript`、`React Flow`、`Zustand`
- 后端：`Fastify`、`TypeScript`
- 数据层：`PostgreSQL`、`Redis`、`BullMQ`
- Query Builder：`Drizzle`
- 校验与测试：`Zod`、`Vitest`、`Playwright`
- 模型服务：硅基流动（SiliconFlow）
  - `FunAudioLLM/SenseVoiceSmall`
  - `deepseek-ai/DeepSeek-V4-Flash`
  - `Tongyi-MAI/Z-Image-Turbo`

说明：

- 当前仓库已经引入 workspace 和 shared schema 所需的基础依赖。
- 本阶段提交的重点是文档基线、预览原型、工程骨架和共享 contracts。
- 后续 PR 会逐步把上述技术栈落到真实业务实现中。

## 规划中的目录结构

当前已冻结的单仓库结构如下，当前仓库已完成其中的基础目录与入口文件初始化：

```text
voice-painting/
  apps/
    web/
    server/
  packages/
    shared/
  infra/
    migrations/
  docs/
    superpowers/
      specs/
      plans/
  preview/
  tests/
```

## 当前可运行内容

### 1. 查看静态预览

当前可以直接打开：

- `D:\Users\HCI_lab\Documents\voice-painting\preview\index.html`

也可以在仓库根目录启动一个静态文件服务，例如：

```powershell
python -m http.server 4173
```

然后访问：

- [http://localhost:4173/preview/index.html](http://localhost:4173/preview/index.html)

### 2. 运行预览测试

```powershell
node --test tests/preview/workbench-preview.test.mjs
```

预期结果：

- 预览页面结构测试通过

### 3. 运行 workspace 结构测试

```powershell
node --test tests/workspace/monorepo-scaffold.test.mjs
```

预期结果：

- monorepo 基础结构测试通过

### 4. 运行 shared schema 测试

在编译 `packages/shared` 后，可运行：

```powershell
corepack pnpm --filter @voice-industrial-design/shared build
node --test tests/workspace/shared-schema.test.mjs
```

预期结果：

- shared schema 构建成功
- shared schema 解析测试通过

### 5. 使用 pnpm 查看工程骨架

安装依赖后，可以分别启动工作台和服务端占位工程：

```powershell
corepack pnpm install
corepack pnpm dev:web
corepack pnpm dev:server
```

## 后续本地开发方式

完整 MVP 工程启动后，开发方式固定为：

- 应用本地运行
- `PostgreSQL` 与 `Redis` 使用 Docker

根目录已经预留：

- `.env.example`
- `docker-compose.yml`

当前已经完成 monorepo 初始化、shared schema 和第一版数据库 DDL 设计草案；后续 PR 将在此基础上逐步补充正式 migration、API 和真实模型接入。

## 第三方服务与依赖说明

### 硅基流动（SiliconFlow）

后续真实模型接入需要：

1. 注册硅基流动账号
2. 创建 API Key
3. 将 Key 写入本地环境变量

当前计划使用：

- `FunAudioLLM/SenseVoiceSmall` 负责语音转写
- `deepseek-ai/DeepSeek-V4-Flash` 负责语音理解与结构化脑暴
- `Tongyi-MAI/Z-Image-Turbo` 负责草图生成

### 其他依赖

后续如引入新的第三方库，会在对应 PR 描述和本 README 中同步补充说明。

## 已知未完成项与原因

当前尚未完成：

- `apps/web` 与 `apps/server` 的真实业务实现
- `packages/shared` 的更细粒度 domain schema 拆分
- 数据库 migration 与 API
- 硅基流动真实模型接入
- 前后端联调与单次撤销闭环

原因：

- 当前阶段优先满足比赛对“持续交付、PR 记录清晰、文档和实现路径明确”的要求
- 先冻结产品、技术、提交流程和目录结构，避免后续返工

## 文档索引

- [需求文档](D:\Users\HCI_lab\Documents\voice-painting\docs\superpowers\specs\需求文档.md)
- [技术方案](D:\Users\HCI_lab\Documents\voice-painting\docs\superpowers\specs\技术方案.md)
- [Agent PRD](D:\Users\HCI_lab\Documents\voice-painting\docs\superpowers\specs\agent-PRD.md)
- [数据库与持久层设计](D:\Users\HCI_lab\Documents\voice-painting\docs\superpowers\specs\数据库与持久层设计.md)
- [MVP 实施计划](D:\Users\HCI_lab\Documents\voice-painting\docs\superpowers\plans\2026-06-12-voice-brainstorm-mvp-implementation-plan.md)
- [比赛 PR 计划](D:\Users\HCI_lab\Documents\voice-painting\docs\superpowers\plans\2026-06-12-contest-pr-plan.md)
- [开发 TODO](D:\Users\HCI_lab\Documents\voice-painting\TODO.md)
