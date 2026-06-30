import "@xyflow/react/dist/style.css";
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: {
    default: "概念树工作台",
    template: "%s | 概念树工作台",
  },
  description:
    "概念树工作台帮助工业设计师把模糊需求展开成多条可比较、可回看的概念方向。",
  keywords: ["工业设计", "概念探索", "概念树", "设计发散", "AI 设计工作台"],
  openGraph: {
    title: "概念树工作台",
    description: "把模糊需求展开成多条可比较、可回看的概念方向。",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
