"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const BRAND = "#0095FF";

const HERO_METRICS = [
  { value: "50+", label: "Models" },
  { value: "0%", label: "Markup" },
  { value: "<300ms", label: "p95 Latency" },
  { value: "Edge", label: "Multi-region" },
];

type InferenceHeroSectionProps = {
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
};

export default function InferenceHeroSection({
  primaryAction,
  secondaryAction,
}: InferenceHeroSectionProps) {
  return (
    <section className="relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-[#04060a] pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24">
      {/* Same PixelBlast ambient backdrop the other service pages use. */}
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
              A.I. Labs — Inference
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-[400] leading-[0.96] tracking-tight text-white sm:text-5xl lg:text-[5.15rem]">
              Every model.
              <span className="block text-[#0095FF]">One API.</span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-8 text-white/62 sm:text-[17px]">
              One OpenAI- and Anthropic-compatible endpoint for 50+ models. Streaming, tools, BYOK, and semantic cache — zero markup.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {primaryAction ? (
                <Link
                  href={primaryAction.href}
                  className="inline-flex h-11 items-center gap-2 bg-white px-6 text-sm font-medium text-black transition hover:bg-[#0095FF] hover:text-white"
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
                  <div className="text-[1.15rem] font-medium tracking-tight text-[#0095FF]">
                    {metric.value}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
                    {metric.label}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ─── Right: hero illustration ────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="relative"
          >
            <div className="relative mx-auto aspect-square w-full max-w-[560px]">
              {/* Soft brand-blue halo behind the illustration */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(0,149,255,0.18), transparent 70%)",
                  filter: "blur(48px)",
                }}
              />
              <Image
                src="/ailabs/inference.png"
                alt="Inference API illustration"
                fill
                priority
                className="object-contain"
                style={{
                  filter:
                    "drop-shadow(0 30px 50px rgba(0,0,0,0.55)) drop-shadow(0 0 32px rgba(0,149,255,0.16))",
                }}
                sizes="(min-width: 1024px) 560px, 90vw"
              />
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
