"use client";

import { motion } from "motion/react";
import { ArrowRight, Sparkles, Network, FileSearch, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  OverviewIllustration,
  RootInputIllustration,
  FirstGenIllustration,
  NodeBubbleIllustration,
  ToolbarIllustration,
  ExportIllustration,
} from "./Illustrations";

function ResponsiveArtboard({
  baseWidth,
  baseHeight,
  className,
  sizeClassName,
  children,
}: {
  baseWidth: number;
  baseHeight: number;
  className?: string;
  sizeClassName?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden [container-type:inline-size] ${sizeClassName ?? "w-full"} ${className ?? ""}`}
      style={{ aspectRatio: `${baseWidth} / ${baseHeight}` }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          transform: `translate(-50%, -50%) scale(min(1, calc(100cqw / ${baseWidth}px)))`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-[#1A1A1A]/10 selection:text-[#1A1A1A]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-[#FDFCFB]/90 backdrop-blur border-b border-[#1A1A1A]/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="font-bold text-xl tracking-tighter">概念树工作台</div>
          <Link
            href="/login"
            className="text-[10px] font-semibold uppercase tracking-widest hover:opacity-50 transition-opacity"
          >
            登录 / 注册
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[calc(100vh-65px)] min-h-[550px] max-h-[850px] flex flex-col pt-6 pb-4 overflow-hidden">
        <div className="max-w-[1200px] mx-auto w-full px-4 md:px-6 flex flex-col h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center shrink-0 mb-4 md:mb-6 space-y-3 mt-2"
          >
            <h1 className="text-[48px] md:text-[60px] font-bold tracking-tight text-slate-900 leading-[1]">
              把需求展开为设计概念树
            </h1>
            <p className="text-[12px] md:text-[14px] text-slate-500 font-medium">
              为工业设计早期探索准备的创意工作台
            </p>
            <div className="flex justify-center pt-2 md:pt-3">
              <Link
                href="/workbench"
                className="px-6 py-2 md:px-8 md:py-3 rounded-full bg-slate-900 text-white text-[10px] md:text-[11px] uppercase tracking-widest font-bold hover:scale-105 transition-transform flex items-center gap-2 shadow-lg"
              >
                立即体验
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </motion.div>

          {/* Hero Image Mockup */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex-1 w-full min-h-0 relative flex justify-center items-center pb-2 md:pb-4"
          >
            <div className="w-full max-w-[1500px] mx-auto">
              <ResponsiveArtboard
                baseWidth={1500}
                baseHeight={776}
                sizeClassName="h-full max-h-[600px] w-auto max-w-full"
              >
                <OverviewIllustration />
              </ResponsiveArtboard>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Value Propositions */}
      <section className="py-24 bg-[#F3F2EE] border-y border-[#1A1A1A]/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-serif italic tracking-tight text-[#1A1A1A]">
              不只生成图片，更帮你把思路整理清楚
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {[
              {
                icon: <Sparkles className="w-6 h-6 text-[#1A1A1A]" />,
                title: "更快打开思路",
                desc: "当需求还不够清楚时，先生成几条差异明显的方向，帮助你快速看到更多可能性。",
              },
              {
                icon: <Network className="w-6 h-6 text-[#1A1A1A]" />,
                title: "保留探索过程",
                desc: "每次选择、继续深入或换一组结果，都会留在同一棵树里。你能清楚看到每个方向从哪里来，又是怎么一步步变化的。",
              },
              {
                icon: <FileSearch className="w-6 h-6 text-[#1A1A1A]" />,
                title: "看图，也看原因",
                desc: "每个方向都会配一段简短说明，解释它想解决什么问题、为什么值得继续看。",
              },
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="bg-[#FDFCFB] p-8 shadow-sm border border-[#1A1A1A]/10 hover:-translate-y-1 transition-transform"
              >
                <div className="w-12 h-12 bg-[#1A1A1A]/5 rounded-full flex items-center justify-center mb-6">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold tracking-tighter mb-3">{item.title}</h3>
                <p className="text-[#1A1A1A]/70 leading-relaxed text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Showcase */}
      <section className="py-32">
        <div className="max-w-7xl mx-auto px-6 space-y-32">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl md:text-6xl font-serif tracking-tight leading-[0.9] mb-6 text-[#1A1A1A]">
              从一句想法开始，
              <br />
              <span className="italic font-normal">一步步长出更多设计方向</span>
            </h2>
          </div>

          {/* Feature 1: Root + Input */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="order-2 md:order-1"
            >
              <ResponsiveArtboard
                baseWidth={720}
                baseHeight={540}
                className="bg-[#F3F2EE] border border-[#1A1A1A]/10"
              >
                <RootInputIllustration />
              </ResponsiveArtboard>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="order-1 md:order-2 space-y-6 md:pl-12"
            >
              <div className="inline-block bg-[#1A1A1A] text-white text-[10px] px-3 py-1 uppercase tracking-[0.2em] font-medium">
                Step 01
              </div>
              <h3 className="text-3xl font-serif italic tracking-tight">说出你的产品想法</h3>
              <p className="text-lg text-[#1A1A1A]/80 leading-relaxed">
                可以描述产品类型、使用场景、目标用户、气质偏好或想解决的问题。提供的信息越具体，生成的方向越精准。
              </p>
            </motion.div>
          </div>

          {/* Feature 2: First Gen */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-6 md:pr-12"
            >
              <div className="inline-block bg-[#1A1A1A] text-white text-[10px] px-3 py-1 uppercase tracking-[0.2em] font-medium">
                Step 02
              </div>
              <h3 className="text-3xl font-serif italic tracking-tight">生成第一组方向</h3>
              <p className="text-lg text-[#1A1A1A]/80 leading-relaxed">
                系统会围绕你的想法生成多个不同的草图方向，让你先横向比较。这就像是设计师头脑风暴时的第一批便利贴。
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <ResponsiveArtboard
                baseWidth={960}
                baseHeight={540}
                className="bg-[#F3F2EE] border border-[#1A1A1A]/10"
              >
                <FirstGenIllustration />
              </ResponsiveArtboard>
            </motion.div>
          </div>

          {/* Feature 3: Node Branching */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="order-2 md:order-1"
            >
              <ResponsiveArtboard
                baseWidth={720}
                baseHeight={540}
                className="bg-[#F3F2EE] border border-[#1A1A1A]/10"
              >
                <NodeBubbleIllustration />
              </ResponsiveArtboard>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="order-1 md:order-2 space-y-6 md:pl-12"
            >
              <div className="inline-block bg-[#1A1A1A] text-white text-[10px] px-3 py-1 uppercase tracking-[0.2em] font-medium">
                Step 03
              </div>
              <h3 className="text-3xl font-serif italic tracking-tight">点击提示气泡继续发散</h3>
              <p className="text-lg text-[#1A1A1A]/80 leading-relaxed">
                看到有潜力的方向后，可以沿着它继续生成新的分支，让想法越来越具体，逐渐收敛到最终的理想形态。
              </p>
            </motion.div>
          </div>

          {/* Feature 4 & 5: Tools & Export */}
          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-[#F3F2EE] border border-[#1A1A1A]/10 p-8 md:p-12 flex flex-col group hover:bg-[#E6E4E0] transition-colors"
            >
              <div className="space-y-4 mb-8">
                <h3 className="text-2xl font-serif italic tracking-tight">随心操作工具区</h3>
                <p className="text-[#1A1A1A]/70">
                  撤回、重做、拖动、放大缩小画布拖动、全局视窗等便捷操作，让你的探索过程丝滑顺畅。
                </p>
              </div>
              <ResponsiveArtboard
                baseWidth={480}
                baseHeight={320}
                className="flex-1 bg-[#FDFCFB] border border-[#1A1A1A]/10 min-h-[300px]"
              >
                <ToolbarIllustration />
              </ResponsiveArtboard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-[#F3F2EE] border border-[#1A1A1A]/10 p-8 md:p-12 flex flex-col group hover:bg-[#E6E4E0] transition-colors"
            >
              <div className="space-y-4 mb-8">
                <h3 className="text-2xl font-serif italic tracking-tight">导出概念树</h3>
                <p className="text-[#1A1A1A]/70">
                  支持一键导出所有生成的节点图，方便你将探索成果分享给团队或汇编入汇报文档。
                </p>
              </div>
              <ResponsiveArtboard
                baseWidth={390}
                baseHeight={360}
                className="flex-1 bg-[#FDFCFB] border border-[#1A1A1A]/10 min-h-[300px]"
              >
                <ExportIllustration />
              </ResponsiveArtboard>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Constraints / Boundaries - Dark Section */}
      <section className="py-24 bg-[#1A1A1A] text-[#FDFCFB]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16 md:w-2/3">
            <h2 className="text-3xl md:text-5xl font-serif tracking-tight mb-6">
              它适合早期探索，
              <br />
              <span className="italic font-normal">不替代最终设计交付</span>
            </h2>
            <p className="text-[#FDFCFB]/70 text-lg">
              了解工具的边界，以便更好地发挥它的价值。
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-x-12 gap-y-0 border-t border-[#FDFCFB]/10">
            {[
              "输出更接近早期草图，用来比较方向，不是最终效果图",
              "不负责建模、生产文件或复杂工程细节",
              "不会塞进大量参数控制，重点是帮助你自然地表达和判断",
              "普通提问只会得到回答，不会自动触发新的图片生成",
            ].map((text, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-start gap-4 p-8 border-b border-[#FDFCFB]/10 hover:bg-[#FDFCFB]/5 transition-colors"
              >
                <div className="mt-1 flex-shrink-0">
                  <XCircle className="w-5 h-5 text-[#FDFCFB]/40" />
                </div>
                <p className="text-[#FDFCFB]/90 leading-relaxed text-lg">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-32 bg-[#F3F2EE] border-b border-[#1A1A1A]/10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <h2 className="text-4xl md:text-6xl font-serif tracking-tight text-[#1A1A1A] leading-[0.9]">
              从一个模糊想法开始，
              <br />
              <span className="italic font-normal">生成你的第一棵设计树</span>
            </h2>
            <p className="text-xl text-[#1A1A1A]/80 leading-relaxed max-w-2xl mx-auto">
              进入工作台，用语音或文字描述需求，快速得到多个可比较的设计方向，并沿着更有潜力的方向继续深入。
            </p>
            <div className="pt-4 flex justify-center">
              <Link
                href="/workbench"
                className="px-10 py-5 rounded-full bg-[#1A1A1A] text-[#FDFCFB] text-xs uppercase tracking-widest font-bold hover:scale-105 transition-transform flex items-center gap-2"
              >
                立即体验
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-[#FDFCFB] text-center text-[#1A1A1A]/60 text-[10px] uppercase tracking-widest font-bold">
        <p>© {new Date().getFullYear()} 概念树工作台. All rights reserved.</p>
      </footer>
    </div>
  );
}
