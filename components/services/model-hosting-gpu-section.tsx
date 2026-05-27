"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Cpu } from "lucide-react";

import { Container } from "@/components/ui/container";

type Gpu = {
  sku: string;
  vram: string;
  rate: string;
  bestFor: string;
  examples: string;
  accent: string;
  picked?: boolean;
};

const GPUS: Gpu[] = [
  {
    sku: "A40",
    vram: "48 GB",
    rate: "$0.40 /hr",
    bestFor: "7B–14B base models, fine-tuning, embeddings",
    examples: "phi-4 · mistral-7b · llama-3.3-8b · bge-m3",
    accent: "#22c55e",
  },
  {
    sku: "L40S",
    vram: "48 GB",
    rate: "$0.80 /hr",
    bestFor: "Latency-sensitive 7B–14B serving with FP8 paths",
    examples: "phi-4 · llama-3.3-8b · qwen-coder-14b",
    accent: "#06b6d4",
  },
  {
    sku: "A100 80GB",
    vram: "80 GB",
    rate: "$1.20 /hr",
    bestFor: "27B–32B mid-size models with comfortable context",
    examples: "llama-4-scout · qwen-3-32b · gemma-3-27b · deepseek-v3",
    accent: "#33adff",
    picked: true,
  },
  {
    sku: "H100 80GB",
    vram: "80 GB",
    rate: "$2.90 /hr",
    bestFor: "Frontier MoE and large dense models, long context",
    examples: "llama-4-maverick · deepseek-v3-671b shards",
    accent: "#a855f7",
  },
];

export default function ModelHostingGpuSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.12 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden bg-[#04060a] py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          background:
            "radial-gradient(50% 50% at 80% 30%, rgba(0,149,255,0.22), transparent 70%), radial-gradient(40% 40% at 10% 80%, rgba(168,85,247,0.18), transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-16 lg:items-start">
          {/* Sticky header */}
          <div className="lg:sticky lg:top-32">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                GPU SKUs
              </p>
              <h2 className="mt-4 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[2.9rem]">
                Pick the GPU{" "}
                <span className="text-[#8ecaff]">that fits the workload.</span>
              </h2>
              <p className="mt-5 max-w-md text-[14.5px] leading-7 text-white/55">
                Per-second metering on the SKU you pick. Burst up to your max, scale to zero when idle. No reservations, no minimum commits.
              </p>

              <p className="mt-6 max-w-md text-[12px] leading-relaxed text-white/40">
                <Cpu className="mr-1 inline h-3 w-3 -translate-y-px text-white/45" />
                Pricing shown is GPU-only. A small per-request platform fee covers gateway, routing, observability, and the autoscaler.
              </p>

              <motion.a
                href="/signup"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="group mt-8 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#33adff] transition-colors hover:text-white"
              >
                Deploy a model
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </motion.a>
            </motion.div>
          </div>

          {/* GPU cards */}
          <div className="space-y-3">
            {GPUS.map((g, i) => (
              <motion.div
                key={g.sku}
                initial={{ opacity: 0, x: 14 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{
                  duration: 0.5,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.05 + i * 0.07,
                }}
                className={`group relative overflow-hidden rounded-[8px] border px-5 py-5 transition-all duration-300 ${
                  g.picked
                    ? "border-[#33adff]/40 bg-[#0095FF]/[0.05]"
                    : "border-white/[0.07] bg-white/[0.015] hover:border-white/[0.18] hover:bg-white/[0.04]"
                }`}
              >
                {g.picked && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)",
                      boxShadow: "0 0 14px rgba(0,149,255,0.55)",
                    }}
                  />
                )}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[2px] opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background: `linear-gradient(180deg, ${g.accent}, transparent)`,
                    boxShadow: `0 0 10px ${g.accent}`,
                  }}
                />

                <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,0.7fr)] sm:gap-4">
                  {/* SKU + VRAM */}
                  <div>
                    <div className="flex items-baseline gap-2">
                      <p className="font-mono text-[15px] font-semibold tracking-tight text-white">
                        {g.sku}
                      </p>
                      {g.picked && (
                        <span className="rounded-[3px] border border-[#33adff]/40 bg-[#0095FF]/[0.10] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[#33adff]">
                          Popular
                        </span>
                      )}
                    </div>
                    <p
                      className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em]"
                      style={{ color: `${g.accent}d9` }}
                    >
                      {g.vram} VRAM
                    </p>
                  </div>

                  {/* Best-for + examples */}
                  <div>
                    <p className="text-[12.5px] leading-snug text-white/80">
                      {g.bestFor}
                    </p>
                    <p className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-white/40">
                      {g.examples}
                    </p>
                  </div>

                  {/* Rate */}
                  <div className="text-right">
                    <p className="font-mono text-[15px] font-semibold tabular-nums text-white">
                      {g.rate}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-400/85">
                      per-second metered
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}

            <p className="px-2 pt-3 text-[10.5px] leading-relaxed text-white/35">
              Need a SKU not listed (B200, MI300X, multi-GPU)? Reach out — we plumb new accelerators in days, not quarters.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
