"use client";

import { motion } from "motion/react";
import { ArrowDown, Bot, Brain, Code2, FileSearch } from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const BRAND = "#0095FF";

const CASES = [
  { icon: Bot, label: "Chatbots & Agents", accent: "#33adff" },
  { icon: Brain, label: "RAG & Knowledge", accent: "#22c55e" },
  { icon: Code2, label: "Code Generation", accent: "#a855f7" },
  { icon: FileSearch, label: "Document Intel", accent: "#f59e0b" },
] as const;

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
            transition={{
              duration: 0.65,
              delay: 0.06,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="mt-7 text-4xl font-[400] leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-[4.2rem]"
          >
            What you can build{" "}
            <span className="text-[#8ecaff]">with the platform.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.14 }}
            className="mx-auto mt-6 max-w-2xl text-[16px] leading-[1.7] text-white/55 sm:text-[17px]"
          >
            Inference, embeddings, vector search, fine-tuning — one API, one
            bill. Four patterns that cover how most teams ship AI into
            production.
          </motion.p>
        </div>

        {/* ─── Four use-case cards as a preview strip ─── */}
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {CASES.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.55,
                  delay: 0.25 + i * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="group relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-white/[0.015] px-5 py-5 transition-all duration-500 hover:border-white/[0.16] hover:bg-white/[0.03]"
              >
                {/* Top accent */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-60 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${c.accent}cc, transparent)`,
                    boxShadow: `0 0 12px ${c.accent}44`,
                  }}
                />

                {/* Icon */}
                <div className="relative mb-4">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-2 rounded-2xl opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-80"
                    style={{
                      background: `radial-gradient(50% 50%, ${c.accent}40, transparent 70%)`,
                    }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-[3px] rounded-[13px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `conic-gradient(from 140deg, ${c.accent}55, ${c.accent}08, ${c.accent}55)`,
                    }}
                  />
                  <div
                    className="relative flex h-11 w-11 items-center justify-center rounded-[10px] border transition-all duration-500"
                    style={{
                      borderColor: "rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.025)",
                    }}
                  >
                    <Icon
                      className="h-5 w-5 transition-colors duration-500"
                      strokeWidth={1.6}
                      style={{ color: c.accent }}
                    />
                  </div>
                </div>

                <p className="text-[14px] font-medium tracking-tight text-white">
                  {c.label}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-16 flex justify-center"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.02]"
          >
            <ArrowDown className="h-3.5 w-3.5 text-white/40" />
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}
