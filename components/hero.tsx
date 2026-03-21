"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";

import { Container } from "@/components/ui/container";
import { LooperBackground } from "@/components/ui/looper-background";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      delay: 0.15 + i * 0.12,
      ease: [0.25, 0.4, 0.25, 1] as const,
    },
  }),
};

export function Hero() {
  return (
    <section className="relative w-full overflow-x-hidden bg-[#0E0F0F] min-h-screen flex flex-col border-b border-[#737373]">
      <div className="absolute inset-0">
        <LooperBackground className="z-0" />
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_30%,#0a0a0a_75%)] pointer-events-none" />
      </div>

      <div className="relative z-10 flex-1 flex items-center w-full pt-20 pb-12 sm:pt-24 sm:pb-16 md:pt-28 md:pb-20">
        <Container>
          <div className="flex w-full flex-col items-center gap-8 sm:gap-10 md:gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
            <div className="w-full flex-shrink-0 lg:w-1/2 lg:max-w-xl">
              <div className="flex flex-col gap-4 sm:gap-5 md:gap-6">
                <motion.div
                  className="inline-flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-3 py-1.5 mx-auto lg:mx-0 w-fit"
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={0}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0095FF] animate-pulse" />
                  <span className="text-[11px] text-white/50 font-medium tracking-wide whitespace-nowrap">
                    Cloud Infrastructure for Modern Teams
                  </span>
                </motion.div>

                <motion.h1
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight leading-tight sm:leading-tight text-white text-center lg:text-left"
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={1}
                >
                  <span className="text-[#ECECFB] block">Deploy at the</span>
                  <span className="text-[#0095FF] block">Speed of Light</span>
                </motion.h1>

                <motion.p
                  className="text-sm sm:text-base md:text-lg leading-relaxed text-white/50 max-w-xl text-center lg:text-left mx-auto lg:mx-0"
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={2}
                >
                  GPU instances, Kubernetes, databases, app deployment, and AI agents
                  - everything you need to build and scale, in one platform.
                </motion.p>

                <motion.div
                  className="flex flex-wrap items-center justify-center lg:justify-start gap-3 sm:gap-4 pt-2"
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={3}
                >
                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 bg-white text-black px-5 sm:px-6 h-10 sm:h-11 text-xs sm:text-sm font-medium hover:bg-white/90 transition-colors"
                  >
                    Get Started Free
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M6 3l5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                  <Link
                    href="/signin"
                    className="inline-flex items-center justify-center gap-2 border border-white/[0.12] bg-white/[0.04] backdrop-blur-sm text-white/80 px-5 sm:px-6 h-10 sm:h-11 text-xs sm:text-sm font-medium hover:bg-white/[0.08] hover:text-white transition-colors"
                  >
                    View Console
                  </Link>
                </motion.div>

                <motion.div
                  className="flex flex-wrap items-center justify-center lg:justify-start gap-2 pt-2"
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={4}
                >
                  {[
                    "99.99% Uptime SLA",
                    "12 Global Regions",
                    "<50ms Deploy Time",
                    "SOC 2 Compliant",
                  ].map((item) => (
                    <div key={item} className="flex items-center">
                      <span className="text-xs sm:text-sm text-white/80 px-3 py-1.5 border border-white/[0.08] bg-white/[0.03]">
                        {item}
                      </span>
                    </div>
                  ))}
                </motion.div>
              </div>
            </div>

            <motion.div
              className="w-full flex-shrink-0 lg:w-1/2"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={3}
            >
              <div className="relative mx-auto aspect-square w-full max-w-[280px] sm:max-w-[360px] md:max-w-[440px] lg:max-w-[520px]">
                <Image
                  src="/images/main-page/home-section-1.png"
                  alt="Cloud infrastructure illustration"
                  width={100}
                  height={100}
                  className="h-full w-full object-contain"
                  loading="eager"
                />
              </div>
            </motion.div>
          </div>
        </Container>
      </div>
    </section>
  );
}
