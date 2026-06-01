"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Rocket,
  Server,
  Terminal,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const BRAND = "#0095FF";

type Action = { label: string; href: string };
type Props = { primaryAction?: Action; secondaryAction?: Action };

const STEPS = [
  { key: "upload", label: "Uploading source", dur: "8s" },
  { key: "build", label: "Building image", dur: "35s" },
  { key: "register", label: "Registering endpoint", dur: "8s" },
  { key: "warm", label: "Warming worker", dur: "11s" },
  { key: "live", label: "Serving on /v1", dur: "—" },
] as const;

export default function ModelHostingHeroSection({
  primaryAction = { label: "Deploy a model", href: "/signup" },
  secondaryAction = { label: "View documentation", href: "/api-docs" },
}: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step < STEPS.length - 1) {
      const t = window.setTimeout(() => setStep((s) => s + 1), 900);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setStep(0), 2800);
    return () => window.clearTimeout(t);
  }, [step]);

  const isLive = step === STEPS.length - 1;

  return (
    <section className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-[#0E0F0F] pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
      {/* PixelBlast backdrop */}
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
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-20">
          {/* ── LEFT: copy ── */}
          <div>
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
              Model Hosting
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="mt-7 text-4xl font-[400] leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-[3.8rem]"
            >
              Your weights.{" "}
              <span className="text-[#8ecaff]">Our autoscaler.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="mt-6 max-w-xl text-[15.5px] leading-7 text-white/60 sm:text-[16.5px]"
            >
              Bring a docker image or a HuggingFace model id. We build,
              register, and expose it as a serverless endpoint — autoscaled,
              billed per second, OpenAI-compatible.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Link
                href={primaryAction.href}
                className="group inline-flex items-center gap-2 rounded-[8px] bg-[#0095FF] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_24px_rgba(0,149,255,0.35)] transition-all hover:bg-[#33adff] hover:shadow-[0_10px_30px_rgba(0,149,255,0.5)]"
              >
                {primaryAction.label}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href={secondaryAction.href}
                className="inline-flex items-center gap-2 rounded-[8px] border border-white/[0.10] bg-white/[0.02] px-5 py-2.5 text-[13.5px] font-medium text-white/85 transition-colors hover:border-white/25 hover:bg-white/[0.05]"
              >
                {secondaryAction.label}
              </Link>
            </motion.div>

            {/* Metric strip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.36 }}
              className="mt-12 flex flex-wrap gap-x-8 gap-y-3"
            >
              {[
                { v: "<1s", l: "Cold start" },
                { v: "0 → N", l: "Autoscale" },
                { v: "Per second", l: "Billing" },
                { v: "4 SKUs", l: "A40 → H100" },
              ].map((m) => (
                <div key={m.l} className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[15px] font-semibold tabular-nums text-white">
                    {m.v}
                  </span>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/40">
                    {m.l}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ── RIGHT: deploy pipeline card ── */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 0.8,
              delay: 0.2,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative"
          >
            {/* Outer glow */}
            <div
              aria-hidden
              className="absolute -inset-8 rounded-[28px] opacity-60 blur-3xl"
              style={{
                background:
                  "radial-gradient(55% 50% at 50% 40%, rgba(0,149,255,0.50), transparent 70%)",
              }}
            />

            <div className="relative overflow-hidden rounded-[16px] border border-white/[0.10] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.6)]">
              {/* Top accent */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)",
                  boxShadow: "0 0 16px rgba(0,149,255,0.55)",
                }}
              />

              {/* Title bar */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                  <Terminal className="h-3.5 w-3.5 text-[#33adff]" />
                  deploy pipeline
                </div>
                <div className="flex items-center gap-1.5">
                  {STEPS.map((_, i) => (
                    <span
                      key={i}
                      className="block h-1 rounded-full transition-all duration-500"
                      style={
                        step === i
                          ? {
                              width: "14px",
                              background: "#33adff",
                              boxShadow: "0 0 6px rgba(0,149,255,0.7)",
                            }
                          : step > i
                            ? {
                                width: "8px",
                                background: "rgba(74,222,128,0.55)",
                              }
                            : {
                                width: "8px",
                                background: "rgba(255,255,255,0.10)",
                              }
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Source row */}
              <div className="border-b border-white/[0.04] bg-black/25 px-5 py-4">
                <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">
                  <Server className="h-3 w-3" />
                  source
                </div>
                <p className="mt-2 break-all font-mono text-[13px] leading-relaxed text-white">
                  huggingface://meta-llama/Llama-3.3-8B-Instruct
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["A100 80GB", "min 0 · max 4", "idle 5m"].map((t) => (
                    <span
                      key={t}
                      className="rounded-[4px] border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 font-mono text-[9.5px] text-white/50"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Step list */}
              <div className="relative px-3 py-3">
                {STEPS.map((s, i) => {
                  const isActive = i === step;
                  const isDone = i < step;
                  const isPending = i > step;
                  return (
                    <div
                      key={s.key}
                      className="relative flex items-center gap-3 rounded-[8px] px-3 py-2.5 transition-all duration-400"
                      style={{
                        background: isActive
                          ? "rgba(0,149,255,0.06)"
                          : "transparent",
                      }}
                    >
                      {/* Vertical connector */}
                      {i < STEPS.length - 1 && (
                        <span
                          aria-hidden
                          className="absolute bottom-0 left-[21px] h-[10px] w-px transition-colors duration-500"
                          style={{
                            background: isDone
                              ? "rgba(74,222,128,0.35)"
                              : "rgba(255,255,255,0.06)",
                          }}
                        />
                      )}

                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {isDone && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 400 }}
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-400/90" />
                          </motion.div>
                        )}
                        {isActive && (
                          <Loader2 className="h-4 w-4 animate-spin text-[#33adff]" />
                        )}
                        {isPending && (
                          <CircleDashed className="h-4 w-4 text-white/20" />
                        )}
                      </span>

                      <span
                        className="flex-1 font-mono text-[12px] transition-colors duration-400"
                        style={{
                          color: isDone
                            ? "rgba(255,255,255,0.55)"
                            : isActive
                              ? "rgba(255,255,255,0.95)"
                              : "rgba(255,255,255,0.32)",
                        }}
                      >
                        {s.label}
                      </span>

                      <span
                        className="font-mono text-[10px] tabular-nums transition-colors duration-400"
                        style={{
                          color:
                            isDone || isActive
                              ? "rgba(255,255,255,0.45)"
                              : "rgba(255,255,255,0.18)",
                        }}
                      >
                        {s.dur}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Result block */}
              <AnimatePresence>
                {isLive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: 8 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: 8 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden border-t border-emerald-400/20 bg-emerald-400/[0.04]"
                  >
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="block h-1.5 w-1.5 rounded-full bg-emerald-400"
                          style={{
                            boxShadow: "0 0 8px rgba(74,222,128,0.6)",
                          }}
                        />
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300/85">
                          endpoint live
                        </p>
                      </div>
                      <p className="mt-2 break-all font-mono text-[13px] font-semibold text-white">
                        ahura/llama-3.3-8b:deploy-9f2a1c
                      </p>
                      <p className="mt-1.5 font-mono text-[10.5px] text-white/50">
                        POST https://api.cs2hvh.com/v1/chat/completions
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
