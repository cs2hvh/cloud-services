"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle2, Cpu } from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const BRAND = "#0095FF";

const HERO_METRICS = [
  { value: "<10m",  label: "Phi-4 run" },
  { value: "$0.10", label: "Typical cost" },
  { value: "8+",    label: "Open bases" },
  { value: "1-click", label: "Managed serving" },
];

// Static "real-looking" training loss curve, normalized into a 280×120
// viewbox. The marker that walks along this path animates the latest
// position. Shape: high start, quick drop, plateau with noise.
const LOSS_PATH = "M 0 18 C 12 22, 22 32, 30 48 S 50 80, 60 90 S 78 100, 88 102 S 110 96, 122 100 S 140 105, 152 102 S 172 99, 184 103 S 200 100, 212 105 S 232 104, 244 103 S 264 106, 280 104";

type FineTuningHeroSectionProps = {
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
};

export default function FineTuningHeroSection({
  primaryAction,
  secondaryAction,
}: FineTuningHeroSectionProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  // Live-ish training mock state — ticks up while the card is in view.
  const [step, setStep] = useState(112);
  const [loss, setLoss] = useState(1.58);
  const [elapsedSec, setElapsedSec] = useState(168);
  const maxSteps = 300;

  useEffect(() => {
    if (!cardRef.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.2 }
    );
    obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    const t = window.setInterval(() => {
      setStep((s) => Math.min(s + 1, maxSteps));
      // Loss tracks a noisy plateau around 1.42, slight downward drift.
      setLoss((l) => Math.max(1.38, l - 0.003 + (Math.random() - 0.5) * 0.04));
      setElapsedSec((e) => e + 2);
    }, 2000);
    return () => window.clearInterval(t);
  }, [inView]);

  const progressPct = (step / maxSteps) * 100;
  const elapsedM = Math.floor(elapsedSec / 60);
  const elapsedS = elapsedSec % 60;
  const elapsed = `${elapsedM}m ${String(elapsedS).padStart(2, "0")}s`;

  return (
    <section className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-[#04060a] pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
      {/* Atmospheric backdrop — same PixelBlast as inference for consistency */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.55]"
      >
        <PixelBlast
          variant="circle"
          color={BRAND}
          pixelSize={5}
          patternScale={3}
          patternDensity={0.7}
          pixelSizeJitter={0.4}
          enableRipples={false}
          speed={0.3}
          edgeFade={0.4}
          transparent
        />
      </div>

      <Container className="relative z-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-16">
          {/* ─── Left: copy ──────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 border border-white/[0.1] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/56">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
              A.I. Labs — Fine-Tuning
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-[400] leading-[0.96] tracking-tight text-white sm:text-5xl lg:text-[5.15rem]">
              Train your model.
              <span className="block text-[#8ecaff]">Ship your adapter.</span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-8 text-white/62 sm:text-[17px]">
              LoRA training on managed GPUs. Frontier open-source bases, automatic eval gate, live progress. From $0.10 per run.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {primaryAction ? (
                <Link
                  href={primaryAction.href}
                  className="inline-flex h-11 items-center gap-2 bg-white px-6 text-sm font-medium text-black transition hover:bg-white/90"
                >
                  {primaryAction.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}

              {secondaryAction ? (
                <Link
                  href={secondaryAction.href}
                  className="inline-flex h-11 items-center gap-2 border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-medium text-white/78 transition hover:bg-white/[0.08] hover:text-white"
                >
                  {secondaryAction.label}
                </Link>
              ) : null}
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-4">
              {HERO_METRICS.map((metric) => (
                <div key={metric.label} className="border-t border-white/[0.1] pt-4">
                  <div className="text-[1.15rem] font-medium tracking-tight text-white">
                    {metric.value}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
                    {metric.label}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ─── Right: live training card ───────────────────────── */}
          <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="relative"
          >
            <div className="relative mx-auto w-full max-w-[540px]">
              {/* Outer glow */}
              <div
                aria-hidden
                className="absolute -inset-6 rounded-3xl opacity-50 blur-2xl"
                style={{
                  background:
                    "radial-gradient(60% 60% at 50% 40%, rgba(0,149,255,0.35), transparent 70%)",
                }}
              />

              <div className="relative overflow-hidden rounded-xl border border-white/[0.10] bg-[#0b0d12] shadow-[0_24px_64px_rgba(0,0,0,0.55)]">
                {/* Card header */}
                <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#33adff] opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#33adff]" />
                    </span>
                    <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#33adff]">
                      Training
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                    <Cpu className="h-3 w-3" />
                    <span>A40 · 48GB</span>
                  </div>
                </div>

                {/* Job id + base */}
                <div className="px-5 pt-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                    Job
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className="font-mono text-[13.5px] font-semibold text-white">
                      ft-job-a1b2c3d4
                    </p>
                    <span className="font-mono text-[10.5px] text-white/45">
                      · microsoft/phi-4
                    </span>
                  </div>
                </div>

                {/* Loss chart */}
                <div className="px-5 pt-4">
                  <div className="flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                    <span>Loss</span>
                    <span className="tabular-nums text-white/65">
                      {loss.toFixed(3)}
                    </span>
                  </div>
                  <div className="mt-1.5 overflow-hidden rounded-[5px] border border-white/[0.06] bg-black/30 p-2">
                    <svg viewBox="0 0 280 120" className="h-24 w-full">
                      {/* Grid lines */}
                      {[24, 48, 72, 96].map((y) => (
                        <line
                          key={y}
                          x1="0"
                          x2="280"
                          y1={y}
                          y2={y}
                          stroke="rgba(255,255,255,0.04)"
                          strokeWidth="1"
                        />
                      ))}

                      {/* Filled area under the curve */}
                      <defs>
                        <linearGradient id="lossFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0095FF" stopOpacity="0.28" />
                          <stop offset="100%" stopColor="#0095FF" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path
                        d={`${LOSS_PATH} L 280 120 L 0 120 Z`}
                        fill="url(#lossFill)"
                      />

                      {/* The line itself — animated stroke-dash entrance */}
                      <motion.path
                        d={LOSS_PATH}
                        fill="none"
                        stroke="#33adff"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0 }}
                        animate={inView ? { pathLength: 1 } : {}}
                        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                        style={{
                          filter: "drop-shadow(0 0 4px rgba(0,149,255,0.55))",
                        }}
                      />

                      {/* Moving cursor at the latest position */}
                      {inView && (
                        <motion.g
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 1.6 }}
                        >
                          <circle cx="244" cy="103" r="3.5" fill="#33adff" />
                          <circle
                            cx="244"
                            cy="103"
                            r="6"
                            fill="none"
                            stroke="#33adff"
                            strokeWidth="1"
                            opacity="0.5"
                          >
                            <animate
                              attributeName="r"
                              from="3.5"
                              to="10"
                              dur="1.8s"
                              repeatCount="indefinite"
                            />
                            <animate
                              attributeName="opacity"
                              from="0.6"
                              to="0"
                              dur="1.8s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        </motion.g>
                      )}
                    </svg>
                  </div>
                </div>

                {/* Progress + metrics */}
                <div className="px-5 pt-4">
                  <div className="flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                    <span>Step {step.toLocaleString()} / {maxSteps.toLocaleString()}</span>
                    <span className="tabular-nums text-white/55">
                      epoch 1.{Math.floor(step / 10) % 100}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, #0095FF 0%, #33adff 100%)",
                        boxShadow: "0 0 10px rgba(0,149,255,0.5)",
                      }}
                    />
                  </div>
                </div>

                {/* Footer — eval gate badge + cost */}
                <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                  <span className="inline-flex items-center gap-1.5 text-emerald-400/85">
                    <CheckCircle2 className="h-3 w-3" />
                    Eval gate ready
                  </span>
                  <span className="text-white/65">
                    {elapsed}
                    <span className="mx-2 text-white/20">·</span>
                    <span className="text-emerald-400/85">$0.07</span>
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
