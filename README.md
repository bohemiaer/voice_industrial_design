# Voice Industrial Design

一个面向工业设计前期发散场景的纯语音脑暴工作台。用户不依赖鼠标和键盘做主要输入，只通过语音描述目标、选择方向、确认高风险树操作，并在需要时撤销最近一次已确认操作，让模糊需求逐步长成一棵概念草图树。

## 项目现状

当前仓库已经具备一套可继续迭代的 monorepo 基线，包含：

- `apps/web`：Next.js 工作台页面骨架，已接入会话初始化、状态管理和画布基础布局
- `apps/server`：Fastify 服务端、基础路由、配置读取、agent gateway 与 orchestrator 起步实现
- `packages/shared`：共享 schema、常量和类型导出
- `preview/`：独立 HTML 预览工作台原型
- `tests/`：预览、workspace、shared schema、server API 与 SiliconFlow gateway 测试

当前后端已经从“前端直接提交 agent 结果”的占位形态，推进到由 server orchestrator 自主调用 agent gateway、校验结构化输出，并写入首轮 `expand_branches` 分支结果。默认测试使用 memory persistence 和 mock provider，不依赖真实外部模型调用。

## MVP 范围

当前 MVP 计划覆盖：

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
- CAD 或建模链路集成
- 鼠标驱动的复杂白板编辑
- 键盘文字输入作为主要创作路径
- 视觉 review 主链路

## 技术栈

- 前端：`Next.js 14`、`React 18`、`TypeScript`、`@xyflow/react`、`Zustand`
- 后端：`Fastify`、`TypeScript`
- 共享层：`Zod`
- 数据层规划：`PostgreSQL`、`Redis`、`BullMQ`、`Drizzle ORM`
- 测试：`node:test`
- 模型服务规划：SiliconFlow
  - `FunAudioLLM/SenseVoiceSmall`
  - `deepseek-ai/DeepSeek-V4-Flash`
  - `Tongyi-MAI/Z-Image-Turbo`

## 目录结构

```text
voice-painting/
  apps/
    server/
    web/
  docs/
    superpowers/
      plans/
      specs/
  infra/
  packages/
    shared/
  preview/
  tests/
```

## 快速开始

### 1. 安装依赖

```powershell
corepack pnpm install
```

### 2. 准备环境变量

```powershell
Copy-Item .env.example .env
```

默认本地开发可直接使用：

- `PERSISTENCE_MODE=memory`
- `AGENT_PROVIDER=mock`
- `SERVER_PORT=8787`

这意味着即使没有 PostgreSQL、Redis 或 SiliconFlow API Key，也可以先跑通当前骨架和测试。

### 3. 启动前后端

```powershell
corepack pnpm dev
```

也可以分别启动：

```powershell
corepack pnpm dev:web
corepack pnpm dev:server
```

默认访问地址：

- Web：`http://localhost:3000`
- Server：`http://localhost:8787`

## 当前可运行内容

### Web 工作台骨架

`apps/web` 已经接入：

- 页面级工作台布局
- 会话初始化
- React Flow 画布容器
- 会话状态与 API 状态展示

### Server API 骨架

`apps/server` 当前已提供并经过测试的能力包括：

- `GET /health`
- `POST /api/sessions`
- `GET /api/sessions/:sessionId/tree`
- `GET /api/sessions/:sessionId/messages`
- `POST /api/sessions/:sessionId/voice-turns`
- `GET /api/tasks/:taskId`
- `POST /api/tasks/:taskId/confirm`
- `POST /api/tasks/:taskId/cancel`

其中语音回合链路已经覆盖：

- transcript 驱动的后端编排
- mock agent gateway 输出结构化脑暴结果
- `expand_branches` 首轮写树
- 高风险操作确认 / 取消状态流转

### 静态预览原型

可以直接打开 [preview/index.html](./preview/index.html)，或在仓库根目录启动静态服务：

```powershell
python -m http.server 4173
```

然后访问 [http://localhost:4173/preview/index.html](http://localhost:4173/preview/index.html)。

## 常用命令

```powershell
corepack pnpm dev
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:server
corepack pnpm test:web
corepack pnpm test:preview
corepack pnpm test:workspace
corepack pnpm test:shared
```

## 测试说明

### 运行完整测试

```powershell
corepack pnpm test
```

当前会执行：

- 预览结构测试
- workspace 结构测试
- shared schema 测试
- server API 测试
- server 配置测试
- SiliconFlow gateway 测试

### 单独运行后端测试

```powershell
corepack pnpm test:server
```

后端测试默认使用：

- memory persistence
- mock agent gateway

因此不会触发真实的 SiliconFlow 网络请求。

## 环境变量

根目录 `.env.example` 当前包含以下核心配置：

```text
NODE_ENV=development
WEB_PORT=3000
SERVER_PORT=8787
PERSISTENCE_MODE=memory
AGENT_PROVIDER=mock
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/voice_painting
REDIS_URL=redis://localhost:6379
SILICONFLOW_API_KEY=your_siliconflow_api_key
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_ASR_MODEL=FunAudioLLM/SenseVoiceSmall
SILICONFLOW_BRAINSTORM_MODEL=deepseek-ai/DeepSeek-V4-Flash
SILICONFLOW_IMAGE_MODEL=Tongyi-MAI/Z-Image-Turbo
DEFAULT_BRANCH_COUNT=4
MAX_BRANCH_COUNT=4
SESSION_DOMAIN=industrial_design
```

当前行为说明：

- 当 `AGENT_PROVIDER=mock` 时，服务端使用本地 mock provider
- 当 `AGENT_PROVIDER=siliconflow` 时，服务端会切换到真实 SiliconFlow provider adapter
- 当 `PERSISTENCE_MODE=memory` 时，当前数据不会持久化到 PostgreSQL
- 当设置 `DATABASE_URL` 或在生产环境运行时，服务端会优先走 `postgres` 模式

## 第三方服务

如需接入真实 SiliconFlow，需要：

1. 注册 SiliconFlow 账号
2. 创建 API Key
3. 将 Key 写入根目录 `.env`
4. 把 `AGENT_PROVIDER` 切换为 `siliconflow`

当前计划模型分工：

- `FunAudioLLM/SenseVoiceSmall`：语音转写
- `deepseek-ai/DeepSeek-V4-Flash`：语音理解与结构化脑暴
- `Tongyi-MAI/Z-Image-Turbo`：概念草图生成

## 已知未完成项

- multipart 音频上传解析
- Redis / BullMQ 异步 worker
- `packages/shared` 更细粒度的 domain schema 拆分
- `refresh_layer` 与 `branch_deeper` 的完整树写入
- 单次撤销的完整恢复逻辑
- SiliconFlow 真实线上联调
- 前后端联调后的完整语音闭环

## 文档索引

- [需求文档](./docs/superpowers/specs/需求文档.md)
- [技术方案](./docs/superpowers/specs/技术方案.md)
- [Agent PRD](./docs/superpowers/specs/agent-PRD.md)
- [数据库与持久层设计](./docs/superpowers/specs/数据库与持久层设计.md)
- [测试文档](./docs/superpowers/specs/测试文档.md)
- [MVP 实施计划](./docs/superpowers/plans/2026-06-12-voice-brainstorm-mvp-implementation-plan.md)
- [比赛 PR 计划](./docs/superpowers/plans/2026-06-12-contest-pr-plan.md)
- [HTML 预览计划](./docs/superpowers/plans/2026-06-12-html-preview-workbench.md)
- [开发 TODO](./TODO.md)
