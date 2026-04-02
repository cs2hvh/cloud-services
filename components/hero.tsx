"use client";

import Link from "next/link";
import { Fragment } from "react";
import { motion } from "motion/react";
import Image from "next/image";
import { LooperBackground } from "@/components/ui/looper-background";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: custom * 0.1 },
  }),
};

function Container({ children }: { children: React.ReactNode }) {
  return <div className="w-full mx-auto max-w-[92%] sm:max-w-[85%] lg:max-w-[75%] px-4 sm:px-6">{children}</div>;
}

const TRUST_ITEMS = [
  "99.99% Uptime SLA",
  "12 Global Regions",
  "SOC 2 Type II",
  "ISO 27001",
];

export function Hero() {
  return (
    <section
      className="relative w-full h-screen overflow-hidden bg-[#0a0a0a]"
      aria-label="AhuraSense Cloud — Deploy cloud infrastructure at the speed of light"
    >

      {/* Looper oval-line background */}
      <LooperBackground className="z-0" />


      {/* Top fade */}
      <div className="absolute top-0 left-0 right-0 h-40 pointer-events-none z-[1] bg-gradient-to-b from-[#0a0a0a] to-transparent" aria-hidden="true" />

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-[1] bg-gradient-to-t from-[#0a0a0a] to-transparent" aria-hidden="true" />

      {/* Bottom separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      {/* ── Main content ── */}
      <div className="relative z-10 h-full flex items-center pt-16">
        <div className="w-full mx-auto max-w-[92%] sm:max-w-[85%] lg:max-w-[75%] px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 items-center gap-10 lg:gap-6">

            {/* Left — copy */}
            <div className="text-center lg:text-left">

              <motion.h1
                className="text-[clamp(38px,5.2vw,68px)] font-semibold tracking-[-0.04em] leading-[1.07] text-white"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.08 }}
              >
                Deploy at the
                <br />
                <span
                  className="text-transparent bg-clip-text"
                  style={{
                    backgroundImage:
                      "linear-gradient(115deg, rgba(255,255,255,0.40) 0%, rgba(0,149,255,0.75) 100%)",
                  }}
                >
                  speed of light
                </span>
              </motion.h1>

              <motion.p
                className="mt-5 text-[16px] sm:text-[18px] leading-[1.7] text-white/55 max-w-[440px] mx-auto lg:mx-0"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                One platform for compute, databases, Kubernetes, and AI.
                Provision your entire infrastructure in seconds, not hours.
              </motion.p>

              {/* CTAs — sharp corners */}
              <motion.div
                className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.32 }}
              >
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center bg-white text-black w-full sm:w-auto px-8 h-11 text-[14px] font-medium hover:bg-white/90 transition-colors"
                >
                  Get started free
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center border border-white/[0.10] text-white/50 w-full sm:w-auto px-8 h-11 text-[14px] font-medium hover:text-white hover:border-white/20 transition-all"
                >
                  View pricing
                </Link>
              </motion.div>

              {/* Trust indicators */}
              <motion.div
                className="mt-9 flex flex-wrap items-center justify-center lg:justify-start text-[12px] text-white/20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 0.55 }}
              >
                {TRUST_ITEMS.map((item, i) => (
                  <Fragment key={item}>
                    <span className="pr-3 py-1">{item}</span>
                    {i < TRUST_ITEMS.length - 1 && (
                      <span
                        className="hidden sm:block w-px h-3 bg-white/[0.08] mr-3"
                        aria-hidden="true"
                      />
                    )}
                  </Fragment>
                ))}
              </motion.div>
            </div>

            {/* Right — Hero image */}
            <motion.div
              className="hidden lg:flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, delay: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
            >
              <Image
                src="/images/main-page/home-section-1.png"
                alt="Cloud infrastructure visualization"
                width={800}
                height={800}
                className="w-full max-w-[680px] xl:max-w-[780px] h-auto object-contain"
                priority
              />
            </motion.div>

          </div>
        </div>
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
