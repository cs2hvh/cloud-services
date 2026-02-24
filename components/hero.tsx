"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { LooperBackground } from "@/components/ui/looper-background";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: 0.15 + i * 0.12, ease: [0.25, 0.4, 0.25, 1] as const },
  }),
};

export function Hero() {
  return (
    <section className="relative w-full h-screen min-h-[600px] max-h-[1080px] bg-[#0a0a0a] overflow-hidden">

      {/* ── Looper background ── */}
      <LooperBackground className="z-0" />

      {/* ── Edge vignette ── */}
      <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_30%,#0a0a0a_75%)] pointer-events-none" />

      {/* ── Content — centered ── */}
      <div className="absolute inset-0 z-10 flex items-center justify-center max-[400px]:pt-20 max-[400px]:items-start">
        <div className="w-full max-w-[820px] mx-auto px-6 text-center">

          {/* Tag */}
          <motion.div
            className="inline-flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm rounded-full px-4 py-1.5 mb-6"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#0095FF] animate-pulse" />
            <span className="text-[11px] text-white/50 font-medium tracking-wide">Cloud Infrastructure for Modern Teams</span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="font-normal text-[clamp(36px,5.5vw,80px)] leading-[1.06] tracking-tight"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
          >
            <span className="text-[#ECECFB] block">Deploy at the</span>
            <span className="text-[#0095FF] block">Speed of Light</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="mt-5 text-[#ECECFB]/50 text-[clamp(15px,1.1vw,18px)] leading-[1.7] max-w-[560px] mx-auto"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={2}
          >
            GPU instances, Kubernetes, databases, app deployment, and AI agents
            — everything you need to build and scale, in one platform.
          </motion.p>

          {/* CTAs */}
          <motion.div
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
          >
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 bg-[#0095FF] px-7 py-3 text-sm font-medium text-white transition-all hover:bg-[#007ad6] hover:shadow-[0_0_32px_rgba(0,149,255,0.35)]"
            >
              Get Started Free
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link
              href="/signin"
              className="inline-flex items-center border border-white/10 bg-white/[0.04] backdrop-blur-sm px-7 py-3 text-sm font-medium text-[#ECECFB]/80 transition-all hover:bg-white/[0.08] hover:border-white/20"
            >
              View Console
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div
            className="mt-12 flex flex-wrap items-center justify-center gap-8 text-xs text-[#ECECFB]/35"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={4}
          >
            <div className="flex items-center gap-2">
              <span className="text-[#0095FF] font-semibold text-sm">99.99%</span>
              <span>Uptime SLA</span>
            </div>
            <div className="h-3 w-px bg-white/8" />
            <div className="flex items-center gap-2">
              <span className="text-[#0095FF] font-semibold text-sm">12</span>
              <span>Global Regions</span>
            </div>
            <div className="h-3 w-px bg-white/8" />
            <div className="flex items-center gap-2">
              <span className="text-[#0095FF] font-semibold text-sm">&lt;50ms</span>
              <span>Deploy Time</span>
            </div>
            <div className="h-3 w-px bg-white/8" />
            <div className="flex items-center gap-2">
              <span className="text-[#0095FF] font-semibold text-sm">SOC 2</span>
              <span>Compliant</span>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
