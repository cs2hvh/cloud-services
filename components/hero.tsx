"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";

import { Container } from "@/components/ui/container";

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
    <section className="relative w-full min-h-screen overflow-x-hidden border-b border-[#737373] bg-[#0E0F0F] flex flex-col">
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-40"
          style={{ backgroundImage: 'url("/images/main-page/hero-bg.svg")' }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_25%,#080a0c_75%)] pointer-events-none" />
      </div>

      <div className="relative z-10 flex flex-1 items-center w-full pt-20 pb-12 sm:pt-24 sm:pb-16 md:pt-28 md:pb-20">
        <Container>
          <div className="flex w-full flex-col items-center gap-8 sm:gap-10 md:gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
            <div className="w-full flex-shrink-0 lg:w-1/2 lg:max-w-xl">
              <div className="flex flex-col gap-4 sm:gap-5 md:gap-6">
                <motion.h1
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight leading-tight sm:leading-tight text-white text-center md:text-left"
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={1}
                >
                  <span className="block text-[#0095FF]">Deploy at the</span>
                  <span className="block text-[#ECECFB] md:pl-16 lg:pl-20">Speed of Light</span>
                </motion.h1>

                <motion.p
                  className="mx-auto max-w-xl text-sm sm:text-base md:text-lg leading-relaxed text-[#ECECFB] text-center md:text-left md:mx-0"
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  custom={2}
                >
                  Deploy, scale, and manage your applications with enterprise-grade security.
                  From GPU instances to AI agents, we provide the tools modern businesses need.
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

      <div className="relative z-10 w-full pb-6 sm:pb-8 md:pb-10">
        {/* Whats New */}
        <Container>
          <motion.div
            className="w-full max-w-[620px] overflow-hidden rounded-[30px] border border-white/15 shadow-[0_16px_30px_rgba(0,0,0,0.35)]"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={5}
          >
            <div className="flex min-h-[138px] sm:min-h-[152px]">
              <div className="flex w-[44%] items-center justify-center bg-[#1B1B1B] px-3 py-3 sm:px-4">
                <Image
                  src="/images/main-page/hero-sec-1-whats-new.svg"
                  alt="New GPU infrastructure"
                  width={320}
                  height={170}
                  className="h-auto w-full max-w-[250px] object-contain"
                />
              </div>
              <div className="flex flex-1 flex-col justify-center bg-[#FBD55A] px-4 py-4 sm:px-5">
                <p className="text-[22px] leading-none font-semibold tracking-tight text-[#0095FF]">
                  📣 What&apos;s New
                </p>
                <h3 className="mt-1 text-xl sm:text-[30px] font-bold leading-[1.05] text-[#000000]">
                  Next-Gen GPU Instances are Here
                </h3>
                <p className="mt-1 text-sm sm:text-base leading-snug text-[#000000]">
                  Experience a massive leap in compute density. Our new
                  instances are engineered for:
                </p>
                <ul className="mt-1 list-disc pl-5 text-[13px] sm:text-sm leading-snug text-[#000000]">
                  <li>LLM Training &amp; Inference</li>
                  <li>Real-time 8K Rendering</li>
                  <li>Complex Scientific Simulations</li>
                </ul>
              </div>
            </div>
          </motion.div>
        </Container>
      </div>
    </section>
  );
}
