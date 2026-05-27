"use client";

import { motion } from "motion/react";
import { Bot, Brain, Code2, FileSearch } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const BRAND = "#0095FF";

const CASES: { icon: LucideIcon; label: string; sub: string }[] = [
  { icon: Bot, label: "Chatbots & Agents", sub: "Streaming · Tools · Memory" },
  { icon: Brain, label: "RAG & Knowledge", sub: "Vectors · Reranking · Citations" },
  { icon: Code2, label: "Code Generation", sub: "Completion · Refactoring · Review" },
  { icon: FileSearch, label: "Document Intel", sub: "Extraction · JSON · Batches" },
];

export default function UseCasesHeroSection() {
  return (
    <section className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-[#0E0F0F] pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
      <div className="absolute inset-0 -z-10">
        <PixelBlast
          variant="circle"
          color={BRAND}
          pixelSize={5}
          patternScale={3}
          patternDensity={0.7}
          pixelSizeJitter={0.5}
          speed={0.3}
          edgeFade={0.4}
          transparent
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 50% 0%, rgba(0,149,255,0.10), transparent 70%)",
          }}
        />
      </div>

      <Container className="relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#33adff] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#33adff]" />
            </span>
            Use cases
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="mt-7 text-4xl font-[400] leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-[4.2rem]"
          >
            What you can build{" "}
            <span className="text-[#8ecaff]">with the platform.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.14 }}
            className="mx-auto mt-5 max-w-lg text-[15.5px] leading-7 text-white/50"
          >
            One API, one bill. Four patterns that cover how teams ship AI.
          </motion.p>
        </div>

        {/* Four cards — minimal text, icon-forward */}
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {CASES.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.55,
                  delay: 0.25 + i * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="group relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-white/[0.015] p-5 transition-all duration-500 hover:border-white/[0.18] hover:bg-white/[0.03]"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-50 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)",
                    boxShadow: "0 0 14px rgba(0,149,255,0.4)",
                  }}
                />

                <div className="relative mb-4">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-2 rounded-2xl opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-80"
                    style={{
                      background: "radial-gradient(50% 50%, rgba(0,149,255,0.40), transparent 70%)",
                    }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-[3px] rounded-[13px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: "conic-gradient(from 140deg, rgba(51,173,255,0.55), rgba(0,149,255,0.05), rgba(51,173,255,0.55))",
                    }}
                  />
                  <div className="relative flex h-11 w-11 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.025] transition-all duration-500 group-hover:border-[#33adff]/40 group-hover:bg-[#0095FF]/[0.08]">
                    <Icon className="h-5 w-5 text-[#33adff] transition-colors duration-500" strokeWidth={1.6} />
                  </div>
                </div>

                <p className="text-[14px] font-medium tracking-tight text-white">
                  {c.label}
                </p>
                <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">
                  {c.sub}
                </p>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
