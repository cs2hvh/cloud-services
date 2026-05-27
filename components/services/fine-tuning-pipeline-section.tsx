"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  FileJson,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";

type Step = {
  icon: LucideIcon;
  label: string;
  body: string;
  detail: string;
};

const STEPS: Step[] = [
  {
    icon: Upload,
    label: "Upload",
    body: "JSONL of chat turns, up to 200MB.",
    detail: '{"messages":[{"role":"user",...}]}',
  },
  {
    icon: FileJson,
    label: "Validate",
    body: "Schema + token-count + cost preview.",
    detail: "1,238 rows · ~412k tokens · est $0.10",
  },
  {
    icon: Cpu,
    label: "Pick GPU",
    body: "A40 → H100 depending on base size.",
    detail: "A40 · 48GB · $0.40/hr",
  },
  {
    icon: Sparkles,
    label: "Train",
    body: "LoRA with live step / loss progress.",
    detail: "step 142 / 300 · loss 1.42",
  },
  {
    icon: ShieldCheck,
    label: "Eval gate",
    body: "Auto-rejects diverged adapters.",
    detail: "loss 1.42 < baseline 1.58 ✓",
  },
  {
    icon: ScrollText,
    label: "Deploy",
    body: "Docker on your GPU, or one-click managed.",
    detail: "ahura/phi-4:ft-a1b2c3d4",
  },
];

export default function FineTuningPipelineSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  // Sequentially light up the steps — each ~600ms after the previous.
  // The "current" step shows the pulse + accent ring; earlier steps
  // get a check; later ones stay dim.
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.2 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    let i = 0;
    setActive(0);
    const t = window.setInterval(() => {
      i += 1;
      if (i > STEPS.length) {
        // Loop — small pause at end before restarting so the user sees
        // the "all green" state.
        i = 0;
        window.setTimeout(() => setActive(0), 2000);
      }
      setActive(i);
    }, 1400);
    return () => window.clearInterval(t);
  }, [inView]);

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden bg-[#0E0F0F] py-24 sm:py-32"
    >
      {/* Atmospheric backdrop — radial wash + dotted grid mask */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.20]"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 30%, rgba(0,149,255,0.25), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse 65% 60% at 50% 50%, black, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 65% 60% at 50% 50%, black, transparent 75%)",
        }}
      />

      <Container className="relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            From dataset to deployed
          </p>
          <h2 className="mt-4 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
            Six steps.{" "}
            <span className="text-[#8ecaff]">Zero infra.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-white/55 sm:text-[16px]">
            We run the GPUs, the queue, the eval, the upload, the registry. You bring the JSONL.
          </p>
        </div>

        {/* ─── Stepped flow ───────────────────────────────────────
            On desktop: 6 columns side-by-side with animated connector
            lines. On mobile: stacks vertically. */}
        <div className="relative mt-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-6">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const done = i < active;
              const current = i === active && active < STEPS.length;
              return (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] }}
                  className="relative flex flex-col items-center text-center"
                >
                  {/* Connector line to the next step — hidden on the last */}
                  {i < STEPS.length - 1 && (
                    <div
                      aria-hidden
                      className="absolute left-[calc(50%+28px)] top-7 hidden h-px lg:block"
                      style={{ width: "calc(100% - 56px)" }}
                    >
                      <div
                        className="h-full w-full origin-left transition-all duration-700"
                        style={{
                          background: done || (current && i + 1 === active)
                            ? "linear-gradient(90deg, #33adff, rgba(51,173,255,0.15))"
                            : "linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                          boxShadow: done ? "0 0 6px rgba(51,173,255,0.5)" : "none",
                        }}
                      />
                    </div>
                  )}

                  {/* Step number + icon badge */}
                  <div className="relative">
                    {current && (
                      <span
                        aria-hidden
                        className="absolute -inset-2 rounded-full border border-[#33adff]/40"
                        style={{ animation: "pipeline-pulse 1.6s ease-in-out infinite" }}
                      />
                    )}
                    <div
                      className="relative flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-500"
                      style={
                        done
                          ? {
                              background:
                                "linear-gradient(135deg, rgba(34,197,94,0.20), rgba(34,197,94,0.05))",
                              borderColor: "rgba(74,222,128,0.45)",
                              boxShadow: "0 4px 20px rgba(34,197,94,0.20)",
                            }
                          : current
                            ? {
                                background:
                                  "linear-gradient(135deg, rgba(0,149,255,0.30), rgba(0,149,255,0.08))",
                                borderColor: "rgba(51,173,255,0.55)",
                                boxShadow: "0 4px 24px rgba(0,149,255,0.30)",
                              }
                            : {
                                background: "rgba(255,255,255,0.015)",
                                borderColor: "rgba(255,255,255,0.08)",
                              }
                      }
                    >
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" strokeWidth={2} />
                      ) : (
                        <Icon
                          className={`h-5 w-5 transition-colors duration-500 ${
                            current ? "text-[#33adff]" : "text-white/35"
                          }`}
                          strokeWidth={1.75}
                        />
                      )}
                    </div>
                    {/* Step number floating chip */}
                    <span
                      className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.12] bg-[#0E0F0F] font-mono text-[9px] font-semibold text-white/50"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>

                  {/* Label + body */}
                  <h3 className="mt-5 text-[14px] font-semibold tracking-tight text-white">
                    {step.label}
                  </h3>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/55">
                    {step.body}
                  </p>

                  {/* Detail chip */}
                  <span
                    className={`mt-3 inline-block max-w-full truncate rounded-[3px] border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] transition-all duration-500 ${
                      done
                        ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-300/85"
                        : current
                          ? "border-[#33adff]/40 bg-[#0095FF]/[0.10] text-[#33adff]"
                          : "border-white/[0.08] bg-white/[0.02] text-white/40"
                    }`}
                  >
                    {step.detail}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Container>

      <style jsx global>{`
        @keyframes pipeline-pulse {
          0%, 100% { transform: scale(1);    opacity: 0.8; }
          50%      { transform: scale(1.15); opacity: 0.0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="pipeline-pulse"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
