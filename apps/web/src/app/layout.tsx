import "@xyflow/react/dist/style.css";
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "概念树工作台",
  description: "面向工业设计前期概念探索的可视化工作台。"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
