import "@xyflow/react/dist/style.css";
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Voice Industrial Design",
  description: "Voice-driven industrial design brainstorming workspace."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
