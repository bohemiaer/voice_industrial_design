import LandingPage from "./_components/LandingPage";

export const metadata = {
  title: "工业设计概念探索工作台 | 概念树工作台",
  description:
    "概念树工作台帮助工业设计师把模糊需求展开成多条可比较、可回看的概念方向。",
  keywords: ["工业设计", "概念探索", "概念树", "设计发散", "AI 设计工作台"],
  openGraph: {
    title: "工业设计概念探索工作台",
    description: "把模糊需求展开成多条可比较、可回看的概念方向。",
  },
};

export default function HomePage() {
  return <LandingPage />;
}
