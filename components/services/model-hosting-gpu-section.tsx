"use client";

import { useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { ArrowUpRight, Cpu, Gauge, Timer, Zap } from "lucide-react";

import { Container } from "@/components/ui/container";

type Gpu = {
  sku: string;
  vram: string;
  rate: string;
  costSec: string;
  bestFor: string;
  models: string[];
  accent: string;
  perf: number;
};

const GPUS: Gpu[] = [
  {
    sku: "A40",
    vram: "48 GB",
    rate: "$0.40 /hr",
    costSec: "$0.00011",
    bestFor: "7B–14B base models, embeddings, fine-tuning",
    models: ["phi-4", "mistral-7b", "llama-3.3-8b", "bge-m3"],
    accent: "#22c55e",
    perf: 35,
  },
  {
    sku: "L40S",
    vram: "48 GB",
    rate: "$0.80 /hr",
    costSec: "$0.00022",
    bestFor: "Latency-sensitive 7B–14B with FP8 paths",
    models: ["phi-4", "llama-3.3-8b", "qwen-coder-14b"],
    accent: "#06b6d4",
    perf: 55,
  },
  {
    sku: "A100 80GB",
    vram: "80 GB",
    rate: "$1.20 /hr",
    costSec: "$0.00033",
    bestFor: "27B–32B models with comfortable context",
    models: ["qwen-3-32b", "gemma-3-27b", "mixtral-8x7b", "command-r-35b"],
    accent: "#33adff",
    perf: 78,
  },
  {
    sku: "H100 80GB",
    vram: "80 GB",
    rate: "$2.90 /hr",
    costSec: "$0.00081",
    bestFor: "70B-class dense and MoE, long context",
    models: ["llama-3.3-70b", "qwen-3-32b", "mixtral-8x7b"],
    accent: "#a855f7",
    perf: 100,
  },
];

export default function ModelHostingGpuSection() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(2);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 80%", "start 20%"],
  });

  const headerY = useTransform(scrollYProgress, [0, 1], [30, 0]);
  const headerOpacity = useTransform(scrollYProgress, [0, 0.4], [0, 1]);

  const selected = GPUS[selectedIdx]!;

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-clip bg-[#04060a] py-28 sm:py-36"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.20]"
        style={{
          background:
            "radial-gradient(50% 50% at 80% 30%, rgba(0,149,255,0.22), transparent 70%), radial-gradient(40% 40% at 10% 80%, rgba(168,85,247,0.16), transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        {/* Header */}
        <motion.div
          style={{ y: headerY, opacity: headerOpacity }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
            <span
              aria-hidden
              className="block h-1.5 w-1.5 rounded-full bg-[#33adff]"
              style={{ boxShadow: "0 0 8px rgba(0,149,255,0.7)" }}
            />
            GPU fleet
          </div>
          <h2 className="mt-6 text-3xl font-[400] leading-[1.04] tracking-tight text-white sm:text-4xl lg:text-[3.6rem]">
            Pick the GPU{" "}
            <span className="text-[#0095FF]">that fits the workload.</span>
          </h2>
          <p className="mt-6 text-[15px] leading-7 text-white/55 sm:text-[16.5px]">
            Per-second metering. Burst up to your max, scale to zero when idle. No reservations, no minimum commits.
          </p>
        </motion.div>

        {/* ─── GPU selector + detail ─── */}
        <div className="mt-16 grid gap-6 lg:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-10">
          {/* Left: GPU cards */}
          <div className="space-y-3">
            {GPUS.map((g, i) => {
              const isSelected = i === selectedIdx;
              return (
                <motion.button
                  key={g.sku}
                  onClick={() => setSelectedIdx(i)}
                  initial={{ opacity: 0, x: -14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{
                    duration: 0.5,
                    ease: [0.16, 1, 0.3, 1],
                    delay: 0.05 + i * 0.06,
                  }}
                  className="group relative w-full overflow-hidden rounded-[12px] border px-5 py-4 text-left transition-all duration-400"
                  style={{
                    borderColor: isSelected
                      ? `${g.accent}50`
                      : "rgba(255,255,255,0.06)",
                    background: isSelected
                      ? `${g.accent}06`
                      : "rgba(255,255,255,0.015)",
                  }}
                >
                  {/* Left accent rail */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px] transition-opacity duration-400"
                    style={{
                      opacity: isSelected ? 1 : 0.4,
                      background: `linear-gradient(180deg, ${g.accent}, transparent)`,
                      boxShadow: isSelected
                        ? `0 0 12px ${g.accent}99`
                        : "none",
                    }}
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-3">
                      <span
                        className="font-mono text-[16px] font-semibold tracking-tight transition-colors duration-400"
                        style={{
                          color: isSelected
                            ? "#0095FF"
                            : "rgba(255,255,255,0.70)",
                        }}
                      >
                        {g.sku}
                      </span>
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/35">
                        {g.vram}
                      </span>
                    </div>
                    <span
                      className="font-mono text-[14px] font-semibold tabular-nums transition-colors duration-400"
                      style={{
                        color: isSelected ? g.accent : "rgba(255,255,255,0.50)",
                      }}
                    >
                      {g.rate}
                    </span>
                  </div>

                  <p
                    className="mt-1.5 text-[12px] leading-relaxed transition-colors duration-400"
                    style={{
                      color: isSelected
                        ? "rgba(255,255,255,0.55)"
                        : "rgba(255,255,255,0.35)",
                    }}
                  >
                    {g.bestFor}
                  </p>

                  {/* Performance bar */}
                  <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${g.perf}%` }}
                      viewport={{ once: true }}
                      transition={{
                        duration: 0.7,
                        delay: 0.3 + i * 0.1,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="h-full rounded-full"
                      style={{
                        background: g.accent,
                        boxShadow: `0 0 8px ${g.accent}88`,
                      }}
                    />
                  </div>
                </motion.button>
              );
            })}

            <p className="px-2 pt-2 text-[10.5px] leading-relaxed text-white/30">
              Need B200, MI300X, or multi-GPU? Reach out — we plumb new
              accelerators in days, not quarters.
            </p>
          </div>

          {/* Right: selected GPU detail */}
          <motion.div
            key={selectedIdx}
            initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.5)]"
          >
            {/* Top accent */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{
                background: `linear-gradient(90deg, transparent, ${selected.accent}cc, transparent)`,
                boxShadow: `0 0 16px ${selected.accent}55`,
              }}
            />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4 sm:px-8">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-[10px] border"
                  style={{
                    background: `linear-gradient(135deg, ${selected.accent}30, ${selected.accent}08)`,
                    borderColor: `${selected.accent}50`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 14px ${selected.accent}30`,
                  }}
                >
                  <Cpu
                    className="h-4.5 w-4.5 text-white"
                    strokeWidth={1.6}
                  />
                </div>
                <div>
                  <p className="font-mono text-[16px] font-semibold tracking-tight text-[#0095FF]">
                    {selected.sku}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    {selected.vram} VRAM
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className="font-mono text-[20px] font-semibold tabular-nums"
                  style={{ color: selected.accent }}
                >
                  {selected.rate}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                  per-second metered
                </p>
              </div>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-3 border-b border-white/[0.06]">
              {[
                {
                  icon: Timer,
                  label: "Cold start",
                  value: "<1s",
                },
                {
                  icon: Gauge,
                  label: "Per-second",
                  value: selected.costSec,
                },
                {
                  icon: Zap,
                  label: "Perf index",
                  value: `${selected.perf}/100`,
                },
              ].map((m) => {
                const MIcon = m.icon;
                return (
                  <div
                    key={m.label}
                    className="border-r border-white/[0.04] px-5 py-4 last:border-r-0 sm:px-6"
                  >
                    <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
                      <MIcon className="h-3 w-3" strokeWidth={1.75} />
                      {m.label}
                    </div>
                    <p className="mt-1.5 font-mono text-[15px] font-semibold tabular-nums text-white">
                      {m.value}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Best for */}
            <div className="px-6 py-5 sm:px-8">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/35">
                Best for
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-white/70">
                {selected.bestFor}
              </p>

              <p className="mt-6 font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/35">
                Example models
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.models.map((m) => (
                  <span
                    key={m}
                    className="rounded-[6px] border px-3 py-1.5 font-mono text-[11px] transition-colors duration-300"
                    style={{
                      borderColor: `${selected.accent}25`,
                      background: `${selected.accent}06`,
                      color: "rgba(255,255,255,0.75)",
                    }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-3.5 sm:px-8">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
                pricing is gpu-only · platform fee per-request
              </span>
              <a
                href="/signup"
                className="group inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#33adff] transition-colors hover:text-white"
              >
                Deploy now
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
