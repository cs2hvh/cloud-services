"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Container } from "@/components/ui/container";

const FEATURES: { label: string; body: string }[] = [
  {
    label: "Single-tenant pod",
    body: "One GPU per customer — never shared.",
  },
  {
    label: "Bring your model",
    body: "HuggingFace id or Docker image, your token encrypted at rest.",
  },
  {
    label: "Auto-stop when idle",
    body: "Pod tears down past your window. Cold-start returns 503 + Retry-After.",
  },
];

export default function InferencePrivateHostingSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (e) => { if (e[0]?.isIntersecting) setInView(true); },
      { threshold: 0.15 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  return (
    <section
      ref={ref}
      className="relative z-10 overflow-clip bg-[#04060a] py-16 lg:py-24"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          background:
            "radial-gradient(45% 35% at 50% 30%, rgba(0,149,255,0.30), transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        {/* ─── TOP: editorial header ─── */}
        <div className="max-w-3xl">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[11px] uppercase tracking-[0.22em] text-white/40"
          >
            Private hosting
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 text-4xl font-semibold leading-[1.04] tracking-[-0.025em] text-white sm:text-5xl lg:text-[56px]"
          >
            Your model.{" "}
            <span className="text-white/30">/</span>{" "}
            <span className="text-[#33adff]">Your GPU.</span>{" "}
            <span className="text-white/30">/</span>{" "}
            <span className="block sm:inline">Your data path.</span>
          </motion.h2>
        </div>

        {/* ─── MIDDLE: wide isolation illustration ─── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-12 lg:mt-16"
        >
          {/* Soft brand-blue wash behind the image */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-8 -inset-y-6 opacity-50 blur-3xl"
            style={{
              background:
                "radial-gradient(55% 60% at 50% 50%, rgba(0,149,255,0.22), transparent 70%)",
            }}
          />
          <div className="relative w-full">
            <Image
              src="/ailabs/raod.png"
              alt="Single-tenant request path — your traffic stays in your lane"
              width={1920}
              height={760}
              priority={false}
              className="h-auto w-full object-contain"
              sizes="(min-width: 1280px) 1100px, 92vw"
            />
          </div>
        </motion.div>

        {/* ─── BOTTOM: features row ─── */}
        <div className="mt-12 grid gap-px border-t border-white/[0.06] sm:grid-cols-3 lg:mt-16">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, y: 10 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.25 + i * 0.08,
              }}
              className="border-b border-white/[0.06] py-6 sm:border-b-0 sm:border-r sm:pr-6 sm:pl-0 sm:last:border-r-0 [&:not(:first-child)]:sm:pl-6"
            >
              <p className="text-[14.5px] font-semibold text-white">
                {f.label}
              </p>
              <p className="mt-1.5 text-[13px] leading-[1.6] text-white/50">
                {f.body}
              </p>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
