import Link from "next/link";

/*
 * Aesthetic direction: editorial industrial lab.
 * Typography: high-contrast serif display with practical Chinese UI body text.
 * Palette: ink, paper, calibrated green, signal red, and soft zinc neutrals.
 * Motion: one restrained staggered reveal, tactile hover states, reduced-motion support.
 * Spatial approach: full-width product story with a large interface artifact as the visual anchor.
 */

const proofStats = [
  { value: "3x", label: "更快整理早期方向" },
  { value: "12+", label: "单次探索可回看分支" },
  { value: "1", label: "一个画布承接完整路径" }
];

const benefits = [
  {
    marker: "01",
    title: "把方向拉开",
    description:
      "从一个粗略需求同时展开多个造型路径，让团队先看到足够大的探索空间。"
  },
  {
    marker: "02",
    title: "把关系留下",
    description:
      "每一轮结果都保留父子关系、层级位置和最近变化，不再散落成一堆难以复盘的图。"
  },
  {
    marker: "03",
    title: "把判断说清",
    description:
      "每个方向配有简短说明，帮助设计师快速理解它回应了哪些场景、气质和结构诉求。"
  },
  {
    marker: "04",
    title: "把推进变轻",
    description:
      "继续展开、刷新当前层、撤回上一轮，都围绕当前节点发生，探索节奏更连续。"
  }
];

const testimonials = [
  {
    quote:
      "它最有价值的地方不是多出几张图，而是把我们为什么走到这个方向讲清楚了。",
    name: "林乔",
    role: "消费电子设计负责人"
  },
  {
    quote:
      "评审前我们能快速看到几条完全不同的路线，讨论不再卡在第一张草图上。",
    name: "Mira Chen",
    role: "工业设计策略顾问"
  },
  {
    quote:
      "概念树让团队更容易回到上一个判断点，少了很多反复翻文件的时间。",
    name: "周衍",
    role: "智能硬件产品经理"
  },
  {
    quote:
      "它像一个早期方向整理台，把模糊想法变成可以继续讨论的结构。",
    name: "Alex Yu",
    role: "设计创新工作室主理人"
  }
];

const faqs = [
  {
    question: "它适合替代最终渲染或建模工具吗？",
    answer:
      "不适合。概念树工作台聚焦前期概念探索，帮助团队更快展开方向、记录演化路径和判断依据。"
  },
  {
    question: "第一次进入后需要配置复杂参数吗？",
    answer:
      "不需要。页面会直接进入工作台，你可以从一个初始产品想法开始，让系统生成第一层概念方向。"
  },
  {
    question: "生成结果之间的关系会被保留吗？",
    answer:
      "会。每次展开都会记录目标节点、层级和新结果，形成一棵可以继续深入和回看的概念树。"
  },
  {
    question: "它更适合个人还是团队使用？",
    answer:
      "当前更适合设计师个人或小团队在早期整理方向。后续可以扩展到更完整的协作评审流程。"
  },
  {
    question: "为什么首页没有强调输入方式？",
    answer:
      "因为核心价值不是某一种输入方式，而是把需求持续展开成结构清晰、可判断、可推进的概念路径。"
  }
];

export const metadata = {
  title: "工业设计概念探索工作台 | 概念树工作台",
  description:
    "概念树工作台帮助工业设计师把模糊需求展开成多条可比较、可回看的概念方向。",
  keywords: ["工业设计", "概念探索", "概念树", "设计发散", "AI 设计工作台"],
  openGraph: {
    title: "工业设计概念探索工作台",
    description: "把模糊需求展开成多条可比较、可回看的概念方向。"
  }
};

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-header" aria-label="概念树工作台导航">
        <Link href="/" className="landing-logo" aria-label="概念树工作台首页">
          <span className="landing-logo__mark">CT</span>
          <span>概念树工作台</span>
        </Link>
        <nav className="landing-nav" aria-label="页面导航">
          <a href="#benefits">收益</a>
          <a href="#media">界面</a>
          <a href="#faq">FAQ</a>
        </nav>
        <Link href="/workbench" className="landing-header__cta">
          进入工作台
        </Link>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__content">
          <p className="landing-kicker">工业设计概念探索</p>
          <h1 id="landing-title">概念树工作台</h1>
          <p className="landing-hero__lede">
            把模糊需求展开成多条可比较、可回看的概念方向。它帮助工业设计师在前期探索中更快拉开空间，
            保留分支关系，并沿着更有潜力的路径继续推进。
          </p>
          <div className="landing-hero__actions">
            <Link href="/workbench" className="landing-button landing-button--primary">
              立即体验
              <span aria-hidden="true">→</span>
            </Link>
            <a href="#media" className="landing-button landing-button--secondary">
              查看工作台
            </a>
          </div>
          <div className="landing-proof" aria-label="设计团队正在用它整理早期方向">
            <p>设计团队正在用它整理早期方向</p>
            <div className="landing-proof__stats">
              {proofStats.map((item) => (
                <strong key={item.label}>
                  {item.value}
                  <span>{item.label}</span>
                </strong>
              ))}
            </div>
          </div>
        </div>

        <div className="landing-hero__artifact" aria-label="概念树工作台产品预览">
          <div className="landing-artifact">
            <div className="landing-artifact__topbar">
              <span>Session 04</span>
              <strong>办公设备概念探索</strong>
            </div>
            <div className="landing-artifact__body">
              <div className="landing-artifact__canvas">
                <div className="landing-node landing-node--root">模糊需求</div>
                <div className="landing-node-row">
                  <div className="landing-node">轻薄办公感</div>
                  <div className="landing-node landing-node--active">柔和家居感</div>
                  <div className="landing-node">模块工具感</div>
                </div>
                <div className="landing-node-row landing-node-row--child">
                  <div className="landing-node">低重心比例</div>
                  <div className="landing-node">隐藏式接口</div>
                </div>
              </div>
              <aside className="landing-artifact__panel">
                <span>当前方向</span>
                <strong>柔和家居感 / 第 2 个方向</strong>
                <p>
                  通过更圆润的边界、低对比材质和克制的部件线条，让产品更容易融入桌面环境。
                </p>
              </aside>
            </div>
          </div>
        </div>
      </section>

      <section id="media" className="landing-media" data-section="product-media">
        <div className="landing-section-copy">
          <p className="landing-kicker">Product View</p>
          <h2>一边看到概念树，一边看到每一步为什么发生</h2>
          <p>
            左侧承载不断生长的分支结构，右侧保留当前方向、最近变化和系统反馈。
            探索过程不再只是一串结果，而是一条可以继续判断的路径。
          </p>
        </div>
        <div className="landing-media__frame" aria-label="工作台界面示意">
          <div className="landing-media__canvas">
            <span className="landing-media__tag">白色画布</span>
            <span className="landing-media__tag">分支路径</span>
            <span className="landing-media__tag">当前节点</span>
          </div>
          <div className="landing-media__sidebar">
            <strong>本轮摘要</strong>
            <p>已基于第 12 号方向生成 3 个更轻薄的子方向。</p>
          </div>
        </div>
      </section>

      <section id="benefits" className="landing-benefits" data-section="benefits">
        <div className="landing-section-copy">
          <p className="landing-kicker">Benefits</p>
          <h2>为前期发散而设计，不把设计师逼进单一答案</h2>
        </div>
        <div className="landing-benefits__grid">
          {benefits.map((item) => (
            <article key={item.title} className="landing-benefit">
              <span>{item.marker}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-testimonials" data-section="testimonials">
        <div className="landing-section-copy">
          <p className="landing-kicker">Teams</p>
          <h2>来自早期设计评审场景的反馈</h2>
        </div>
        <div className="landing-testimonials__grid">
          {testimonials.map((item) => (
            <figure key={item.name} className="landing-quote">
              <blockquote>“{item.quote}”</blockquote>
              <figcaption>
                <span>{item.name}</span>
                <small>{item.role}</small>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="faq" className="landing-faq" data-section="faq">
        <div className="landing-section-copy">
          <p className="landing-kicker">FAQ</p>
          <h2>进入工作台前，你可能想确认的几件事</h2>
        </div>
        <div className="landing-faq__list">
          {faqs.map((item) => (
            <details key={item.question} className="landing-faq__item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-final" data-section="final-cta">
        <p className="landing-kicker">Start Now</p>
        <h2>从一个模糊想法开始，展开你的第一棵概念树</h2>
        <p>进入工作台，快速生成多个概念方向，并沿着更值得继续的路径推进下去。</p>
        <Link href="/workbench" className="landing-button landing-button--primary">
          立即体验
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      <footer className="landing-footer">
        <div>
          <Link href="/" className="landing-logo">
            <span className="landing-logo__mark">CT</span>
            <span>概念树工作台</span>
          </Link>
          <p>面向工业设计前期概念探索的可视化工作台。</p>
        </div>
        <div>
          <strong>产品</strong>
          <Link href="/workbench">立即体验</Link>
          <a href="#media">工作台预览</a>
        </div>
        <div>
          <strong>支持</strong>
          <a href="mailto:hello@concept-tree.local">联系我们</a>
          <a href="#faq">常见问题</a>
        </div>
        <div>
          <strong>法律</strong>
          <a href="#privacy">隐私政策</a>
          <a href="#terms">服务条款</a>
        </div>
      </footer>
    </main>
  );
}
