"use client";

import { assetUrl } from "@/lib/asset-url";
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
    body: "Spins down after your idle window; restarts automatically on the next request.",
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
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]"
          >
            Dedicated GPUs,
            <br />
            <span className="text-[#33adff]">private by default.</span>
          </motion.h2>
        </div>

        {/* ─── MIDDLE: wide data-path illustration (tablet / laptop / desktop) ───
            Hidden on phones — the numbered steps below carry the same story in
            text form. On md+ the full 1920×516 diagram renders uncropped with
            object-contain, so the whole flowchart stays visible and nothing
            clips at any width. */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-12 hidden md:block lg:mt-16"
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
          {/* raod.png is a wide 1920×516 flowchart that spans nearly the full
              canvas (source cluster → path → destination node). Render it at its
              native aspect ratio with object-contain so the whole diagram stays
              visible and never clips at any width. Break it out of the text
              column (w-screen, centered) so the wide banner reads at a larger
              size; the section is overflow-clip, so this never scrolls the page. */}
          <div className="relative left-1/2 w-screen -translate-x-1/2">
            <div className="mx-auto w-[92%] max-w-[1360px]">
              <div className="relative aspect-[1920/516] w-full">
                <Image
                  src={assetUrl("/ailabs/raod.png")}
                  alt="Single-tenant request path — your traffic stays in your lane"
                  fill
                  priority={false}
                  className="object-contain"
                  sizes="(min-width: 1024px) 1360px, 92vw"
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─── BOTTOM: the data path as text ───
            On phones (where the diagram is hidden) these read as a numbered,
            connected step sequence — the request path in words. At md+ they lay
            out as the divider row beneath the illustration. */}
        <div className="mt-10 grid gap-px border-t border-white/[0.06] md:mt-14 md:grid-cols-3">
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
              className="relative flex gap-4 py-5 md:block md:gap-0 md:border-r md:border-white/[0.06] md:py-6 md:pr-6 md:pl-0 md:last:border-r-0 [&:not(:first-child)]:md:pl-6"
            >
              {/* Step index + connector — phones only (replaces the diagram) */}
              <div className="flex flex-col items-center md:hidden" aria-hidden>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#0095FF]/40 bg-[#0095FF]/10 text-[12px] font-semibold text-[#33adff]">
                  {i + 1}
                </span>
                {i < FEATURES.length - 1 && (
                  <span className="mt-1.5 w-px flex-1 bg-gradient-to-b from-[#0095FF]/35 to-white/[0.05]" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[14.5px] font-semibold text-[#0095FF]">
                  {f.label}
                </p>
                <p className="mt-1.5 text-[13px] leading-[1.6] text-white/50">
                  {f.body}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
