"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Lock } from "lucide-react";

import { Container } from "@/components/ui/container";
import { ProviderLogo } from "@/components/services/provider-logos";

// ─── Supported base catalog ──────────────────────────────────────────
//
// Mix of the bases the runner actually trains (validated against
// the FT validation lib + the model catalog). Featured + approximate
// recommended GPU + typical-cost band so the customer can pick by
// budget, not by reading docs.
type Base = {
  family: string;
  model: string;
  size: string;
  gpu: string;
  costBand: string;
  gated?: boolean;
  accent: string;
};

const BASES: Base[] = [
  { family: "Microsoft", model: "phi-4",                 size: "14B",  gpu: "A40",       costBand: "~$0.10",  accent: "#0078d4" },
  { family: "Meta",      model: "llama-3.3-8B-instruct", size: "8B",   gpu: "A40",       costBand: "~$0.20",  gated: true, accent: "#0866ff" },
  { family: "Meta",      model: "llama-4-scout",         size: "17B",  gpu: "B200 80GB", costBand: "~$0.80",  gated: true, accent: "#0866ff" },
  { family: "Meta",      model: "llama-4-maverick",      size: "128B", gpu: "H100 80GB", costBand: "~$3-5",   gated: true, accent: "#0866ff" },
  { family: "DeepSeek",  model: "deepseek-v3",           size: "37B",  gpu: "B200 80GB", costBand: "~$1.20",  accent: "#7c3aed" },
  { family: "DeepSeek",  model: "deepseek-coder-v3",     size: "33B",  gpu: "B300 80GB", costBand: "~$1.00",  accent: "#7c3aed" },
  { family: "Qwen",      model: "qwen-3-32b",            size: "32B",  gpu: "B300 80GB", costBand: "~$1.00",  accent: "#615ced" },
  { family: "Qwen",      model: "qwen-coder-32b",        size: "32B",  gpu: "B300 80GB", costBand: "~$1.00",  accent: "#615ced" },
  { family: "Mistral",   model: "mistral-7b-instruct",   size: "7B",   gpu: "A40",       costBand: "~$0.15",  accent: "#fa520f" },
  { family: "Google",    model: "gemma-3-27b-it",        size: "27B",  gpu: "B200 80GB", costBand: "~$0.80",  gated: true, accent: "#4285f4" },
];

export default function FineTuningBasesSection() {
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
            "radial-gradient(60% 50% at 80% 30%, rgba(0,149,255,0.22), transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16 lg:items-start">
          {/* Left header */}
          <div className="lg:sticky lg:top-32">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[2.9rem]">
                Train on the models{" "}
                <span className="text-[#0095FF]">worth training on.</span>
              </h2>
              <p className="mt-5 max-w-md text-[14.5px] leading-7 text-white/55">
                Frontier open-weight families: Llama 4, DeepSeek, Qwen, Mistral, Phi, Gemma. Cost-banded per GPU recommendation so you can pick by budget.
              </p>

              <p className="mt-6 max-w-md text-[12px] leading-relaxed text-white/40">
                <Lock className="mr-1 inline h-3 w-3 -translate-y-px text-white/45" />
                Gated bases require your HuggingFace token — stored encrypted at rest, decrypted at the edge during pod provisioning.
              </p>

              <motion.a
                href="/signup"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="group mt-8 inline-flex items-center gap-1.5 text-[13px] font-medium text-white transition-colors hover:text-[#0095FF]"
              >
                Start a fine-tune
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </motion.a>
            </motion.div>
          </div>

          {/* Right: table-like rows */}
          <div className="space-y-2">
            {/* Header row */}
            <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,0.5fr)_minmax(0,0.8fr)_minmax(0,0.6fr)] gap-3 px-4 pb-2 sm:grid">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">
                Base
              </p>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">
                Size
              </p>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">
                Recommended GPU
              </p>
              <p className="text-right font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">
                Typical cost
              </p>
            </div>

            {BASES.map((b, i) => (
              <motion.div
                key={b.model}
                initial={{ opacity: 0, x: 12 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{
                  duration: 0.45,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.05 + i * 0.04,
                }}
                className="group relative overflow-hidden rounded-[6px] border border-white/[0.06] bg-white/[0.015] px-4 py-3.5 transition-all duration-300 hover:border-white/[0.18] hover:bg-white/[0.04]"
              >
                {/* Provider-tinted left rail */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[2px] opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background: `linear-gradient(180deg, ${b.accent}, transparent)`,
                    boxShadow: `0 0 10px ${b.accent}`,
                  }}
                />

                <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.5fr)_minmax(0,0.8fr)_minmax(0,0.6fr)] sm:gap-3">
                  {/* Base + family */}
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Family brand mark — tinted via accent (currentColor),
                        glyph fallback when no logo exists. */}
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border font-mono text-[9px] font-semibold tracking-[0.04em]"
                      style={{
                        background: `linear-gradient(135deg, ${b.accent}22, ${b.accent}08)`,
                        borderColor: `${b.accent}40`,
                        color: b.accent,
                      }}
                    >
                      <ProviderLogo provider={b.family} size={15} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="truncate font-mono text-[13px] font-semibold text-white">
                          {b.model}
                        </p>
                        {b.gated && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-[3px] border border-amber-300/25 bg-amber-300/[0.06] px-1 py-px font-mono text-[8.5px] uppercase tracking-[0.14em] text-amber-300/85"
                            title="HF-gated base — your token required"
                          >
                            <Lock className="h-2 w-2" />
                            Gated
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                        {b.family}
                      </p>
                    </div>
                  </div>

                  {/* Size pill */}
                  <p
                    className="font-mono text-[11.5px] font-semibold tracking-tight"
                    style={{ color: b.accent }}
                  >
                    {b.size}
                  </p>

                  {/* GPU */}
                  <p className="font-mono text-[11px] text-white/65">{b.gpu}</p>

                  {/* Cost */}
                  <p className="text-right font-mono text-[11.5px] tabular-nums text-emerald-400/85 sm:font-semibold">
                    {b.costBand}
                  </p>
                </div>
              </motion.div>
            ))}

            <p className="px-2 pt-3 text-[10.5px] leading-relaxed text-white/35">
              Cost shown is the typical training run on the recommended GPU for a moderate dataset (~10k–50k rows). Your actual run is metered per GPU-second and previewed in the dashboard before submit.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
