"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Rocket,
  Server,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const BRAND = "#0095FF";

type Action = { label: string; href: string };

type ModelHostingHeroSectionProps = {
  primaryAction?: Action;
  secondaryAction?: Action;
};

// Deploy lifecycle that ticks through on a loop. State stays "live" once
// reached and resets after a hold so the customer always lands on the
// happy ending.
const STEPS = [
  { key: "upload",   label: "Uploading source",      latency: "00:08" },
  { key: "build",    label: "Building OCI image",    latency: "00:43" },
  { key: "register", label: "Registering endpoint", latency: "00:51" },
  { key: "warm",     label: "Warming GPU worker",   latency: "01:02" },
  { key: "live",     label: "Serving on /v1",        latency: "01:04" },
] as const;

const METRICS = [
  { value: "<1s", label: "Cold start" },
  { value: "L40S → H100", label: "GPU SKUs" },
  { value: "Per second", label: "Billing" },
  { value: "0 → N", label: "Autoscale" },
];

export default function ModelHostingHeroSection({
  primaryAction = { label: "Deploy a model", href: "/signup" },
  secondaryAction = { label: "View documentation", href: "/api-docs" },
}: ModelHostingHeroSectionProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step < STEPS.length - 1) {
      const t = window.setTimeout(() => setStep((s) => s + 1), 900);
      return () => window.clearTimeout(t);
    }
    // Hold on "live" then reset.
    const t = window.setTimeout(() => setStep(0), 2600);
    return () => window.clearTimeout(t);
  }, [step]);

  const lastModelId = useMemo(() => "ahura/llama-3.3-8b:deploy-9f2a1c", []);

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
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          {/* ── LEFT: copy ── */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/55"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#33adff] opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#33adff]" />
              </span>
              Model Hosting · BYO weights
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="mt-6 text-4xl font-[400] leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-[3.8rem]"
            >
              Your weights.{" "}
              <span className="text-[#8ecaff]">Our autoscaler.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-6 max-w-xl text-[15.5px] leading-7 text-white/60 sm:text-[16.5px]"
            >
              Bring a docker image or a HuggingFace model id. We build, register, and expose it as a serverless endpoint on the same /v1 surface as every other model — autoscaled, billed per second, OpenAI-compatible.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18 }}
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

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-white/[0.07] bg-white/[0.02] sm:grid-cols-4"
            >
              {METRICS.map((m) => (
                <div key={m.label} className="bg-[#0E0F0F] px-4 py-3">
                  <p className="font-mono text-[14px] font-semibold text-white tabular-nums">
                    {m.value}
                  </p>
                  <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">
                    {m.label}
                  </p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ── RIGHT: deploy-lifecycle card ── */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div
              aria-hidden
              className="absolute -inset-6 rounded-3xl opacity-50 blur-2xl"
              style={{
                background:
                  "radial-gradient(60% 50% at 50% 40%, rgba(0,149,255,0.45), transparent 70%)",
              }}
            />
            <div className="relative overflow-hidden rounded-[14px] border border-white/[0.10] bg-[#0b0d12] shadow-[0_24px_64px_rgba(0,0,0,0.55)]">
              {/* Title bar */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/55">
                  <Rocket className="h-3.5 w-3.5 text-[#33adff]" />
                  ahuractl deploy
                </div>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                  pipeline · live
                </span>
              </div>

              {/* Source line */}
              <div className="border-b border-white/[0.04] bg-black/30 px-5 py-3.5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                  <Server className="h-3 w-3" />
                  source
                </div>
                <p className="mt-1.5 break-all font-mono text-[12.5px] text-white">
                  huggingface://meta-llama/Llama-3.3-8B-Instruct
                </p>
                <p className="mt-1 font-mono text-[10px] text-white/40">
                  GPU · A100 80GB · min 0 · max 4 · idle 5m
                </p>
              </div>

              {/* Step list */}
              <ol className="px-2 py-2">
                {STEPS.map((s, i) => {
                  const isActive = i === step;
                  const isDone = i < step;
                  const isPending = i > step;
                  return (
                    <li
                      key={s.key}
                      className="flex items-center gap-3 rounded-[6px] px-3 py-2.5 transition-colors"
                      style={{
                        background: isActive
                          ? "rgba(0,149,255,0.06)"
                          : "transparent",
                      }}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {isDone && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400/90" />
                        )}
                        {isActive && (
                          <Loader2 className="h-4 w-4 animate-spin text-[#33adff]" />
                        )}
                        {isPending && (
                          <CircleDashed className="h-4 w-4 text-white/20" />
                        )}
                      </span>
                      <span
                        className="flex-1 font-mono text-[12px] transition-colors"
                        style={{
                          color: isDone
                            ? "rgba(255,255,255,0.6)"
                            : isActive
                              ? "rgba(255,255,255,0.95)"
                              : "rgba(255,255,255,0.35)",
                        }}
                      >
                        {s.label}
                      </span>
                      <span
                        className="font-mono text-[10.5px] tabular-nums transition-colors"
                        style={{
                          color: isActive || isDone
                            ? "rgba(255,255,255,0.5)"
                            : "rgba(255,255,255,0.20)",
                        }}
                      >
                        {s.latency}
                      </span>
                    </li>
                  );
                })}
              </ol>

              {/* Result block — fades in once at step "live" */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={
                  step === STEPS.length - 1
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 8 }
                }
                transition={{ duration: 0.35 }}
                className="border-t border-white/[0.06] bg-emerald-400/[0.04] px-5 py-4"
              >
                <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-emerald-300/85">
                  ✓ endpoint live
                </p>
                <p className="mt-1 break-all font-mono text-[12.5px] font-semibold text-white">
                  {lastModelId}
                </p>
                <p className="mt-1 font-mono text-[10.5px] text-white/55">
                  POST https://api.cs2hvh.com/v1/chat/completions
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
