const checklist = [
  "纯语音工作台入口",
  "右侧轻会话区与确认卡片",
  "左侧概念树画布",
  "高风险树操作复述确认",
  "单次撤销最近一次树操作"
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Monorepo Scaffold</p>
        <h1>Voice Industrial Design</h1>
        <p className="summary">
          这一版先完成工程结构初始化，为后续接入纯语音工作台、任务状态机和硅基流动模型链路做准备。
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Workspace Apps</h2>
          <ul>
            <li>`apps/web`：Next.js 工作台</li>
            <li>`apps/server`：Fastify API 与编排层</li>
            <li>`packages/shared`：共享 schema 与常量</li>
          </ul>
        </article>

        <article className="card">
          <h2>MVP Focus</h2>
          <ul>
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
