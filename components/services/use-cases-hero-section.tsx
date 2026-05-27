"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ArrowRight, Bot, Brain, Code2, FileSearch } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const CASES: { icon: LucideIcon; label: string; sub: string; href: string }[] = [
  { icon: Bot, label: "Chatbots & Agents", sub: "Streaming · Tools · Memory", href: "#chatbots" },
  { icon: Brain, label: "RAG & Knowledge", sub: "Vectors · Reranking · Citations", href: "#rag" },
  { icon: Code2, label: "Code Generation", sub: "Completion · Refactoring · Review", href: "#codegen" },
  { icon: FileSearch, label: "Document Intel", sub: "Extraction · JSON · Batches", href: "#docs" },
];

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, delay: 0.2 + i * 0.1, ease: [0.25, 0.4, 0.25, 1] as const },
  }),
};

export default function UseCasesHeroSection() {
  return (
    <section className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-black pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
      <div className="absolute inset-0 -z-10">
        <PixelBlast
          variant="circle"
          color="#0095FF"
          pixelSize={5}
          patternScale={3}
          patternDensity={0.7}
          pixelSizeJitter={0.5}
          speed={0.3}
          edgeFade={0.4}
          transparent
        />
      </div>

      <Container className="relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[11px] uppercase tracking-[0.22em] text-white/45"
          >
            Use cases
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: [0.25, 0.4, 0.25, 1] }}
            className="mt-5 text-5xl font-semibold leading-[1.04] tracking-[-0.035em] text-white sm:text-6xl lg:text-[72px]"
          >
            What you can build
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="mx-auto mt-5 max-w-md text-[15px] leading-[1.65] text-white/55"
          >
            One API, one bill. Four patterns that cover how teams ship AI.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-8 flex justify-center"
          >
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 bg-white px-5 py-2.5 text-[13px] font-semibold text-black transition-all hover:bg-white/90"
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>

        {/* Four use-case cards */}
        <div className="mx-auto mt-20 grid max-w-5xl grid-cols-2 gap-[1px] border border-white/[0.06] bg-white/[0.04] sm:grid-cols-4">
          {CASES.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.a
                key={c.label}
                href={c.href}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
                className="group relative bg-[#0a0a0a] px-5 py-6 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#111]"
              >
                <Icon
                  className="h-6 w-6 text-[#0095FF] transition-colors duration-300"
                  strokeWidth={1.5}
                />
                <p className="mt-4 text-[14px] font-semibold tracking-tight text-white">
                  {c.label}
                </p>
                <p className="mt-1.5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.12em] text-white/35">
                  {c.sub}
                </p>
                <ArrowRight className="mt-4 h-3.5 w-3.5 text-white/20 transition-all duration-300 group-hover:translate-x-1 group-hover:text-[#0095FF]" />
              </motion.a>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
