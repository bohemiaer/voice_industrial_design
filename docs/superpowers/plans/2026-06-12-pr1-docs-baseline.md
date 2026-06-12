# PR 1 Draft: 补充 MVP 文档基线

## 建议分支名

`contest/docs-baseline`

## 建议 PR 标题

`[contest] 补充语音工业设计脑暴 MVP 文档基线`

## 建议 commit 粒度

1. `docs: freeze MVP requirements and technical decisions`
2. `docs: add contest TODO and PR plan`
3. `docs: add repository baseline files`

## PR 描述草稿

### 功能描述

- 补充并冻结语音工业设计脑暴 MVP 的需求文档、技术方案、Agent PRD 和实施计划
- 新增根目录 `TODO.md`，明确从路线冻结到联调测试的开发清单
- 新增比赛 PR 计划，约束后续以小粒度 PR 持续提交
- 新增仓库基线文件：`README.md`、`.gitignore`、`.env.example`、`docker-compose.yml`、PR 模板

### 实现思路

- 先把产品边界、纯语音交互模型、高风险确认规则、任务与树状态模型、页面与流程设计全部冻结，避免后续大范围返工
- 仓库基线阶段不直接假装已有完整工程，而是明确当前主分支处于“文档基线 + 预览原型”状态
- 在 `README.md` 中提前写清第三方依赖、原创功能范围、本地查看方式与未完成项，满足比赛对依赖说明和 PR 描述一致性的要求
- 将后续开发拆成连续小 PR，保证每个 PR 只做一件事，且主分支随时可检查

### 测试方式

- 文档路径手工检查，确认索引可读
- 手工检查 `README.md` 是否包含项目目标、MVP 范围、依赖说明、本地启动方式和未完成项
- 运行以下命令确认当前预览测试仍可通过：

```powershell
node --test tests/preview/workbench-preview.test.mjs
```

### 备注

- 当前 PR 主要为文档和仓库基线整理，不包含完整 `Next.js + Fastify` 工程初始化
- 当前计划技术栈包括 `Next.js`、`React Flow`、`Zustand`、`Fastify`、`BullMQ`、`PostgreSQL`、`Redis`、`Drizzle`、硅基流动 API；其中大部分会在后续 PR 中逐步引入
- 当前未复用外部业务代码；如后续复用作者既有代码，会在对应 PR 中单独说明来源和改造范围
