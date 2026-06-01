"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

export default function HomePopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Defer the popup off the hydration/LCP critical path: wait ~1s, then open
    // during browser idle time so it never competes with first paint or input.
    let idleId: number | undefined;
    const timeoutId = setTimeout(() => {
      if (typeof requestIdleCallback !== "undefined") {
        idleId = requestIdleCallback(() => setOpen(true), { timeout: 1500 });
      } else {
        setOpen(true);
      }
    }, 1000);
    return () => {
      clearTimeout(timeoutId);
      if (idleId !== undefined && typeof cancelIdleCallback !== "undefined") {
        cancelIdleCallback(idleId);
      }
    };
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-md"
            onClick={() => setOpen(false)}
          />

          {/* Card */}
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.94, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-4 top-1/2 z-[1000] mx-auto w-full max-w-[640px] -translate-y-1/2 overflow-hidden rounded-[10px]"
            style={{
              boxShadow:
                "0 0 0 1px rgba(0,149,255,0.18), 0 48px 120px rgba(0,0,0,0.9), 0 0 100px rgba(0,149,255,0.1)",
            }}
          >
            {/* Close */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/60 backdrop-blur-sm transition-all hover:bg-black/90 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex min-h-[420px] flex-col sm:flex-row">

              {/* ══ LEFT PANEL ══ */}
              <div className="flex w-full flex-col sm:w-[42%]">

                {/* Top half — photo */}
                <div className="relative h-[200px] overflow-hidden sm:flex-1">
                  <Image
                    src="/ailabs/B200-GPU-Stack.png"
                    alt="NVIDIA B300 GPU"
                    fill
                    className="object-cover object-center"
                  />
                  {/* Bottom fade into the text panel below */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#060b14] to-transparent" />
                </div>

                {/* Bottom half — text */}
                <div
                  className="flex flex-col justify-center px-6 py-5"
                  style={{
                    background:
                      "linear-gradient(180deg, #060b14 0%, #030610 100%)",
                  }}
                >
                  {/* NVIDIA + Blackwell */}
                  <span
                    className={`${MONO} text-[11px] font-bold uppercase tracking-[0.3em]`}
                    style={{ color: "#76b900" }}
                  >
                    NVIDIA
                  </span>
                  <span
                    className={`${MONO} mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em]`}
                    style={{ color: "#76b900aa" }}
                  >
                    Blackwell Architecture
                  </span>

                  {/* B300 */}
                  <div
                    className="mt-3 select-none text-[60px] font-bold leading-none tracking-[-0.03em]"
                    style={{
                      background:
                        "linear-gradient(150deg, #ffffff 0%, #cce0ff 45%, #7ab8ff 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      filter: "drop-shadow(0 0 20px rgba(0,149,255,0.4))",
                    }}
                  >
                    B300
                  </div>

                  {/* Specs — stacked */}
                  <div className="mt-4 flex flex-col gap-1.5">
                    {[
                      { label: "VRAM", value: "288 GB" },
                      { label: "Memory type", value: "HBM3e" },
                      { label: "Bandwidth", value: "1.8 TB/s" },
                    ].map((s) => (
                      <div key={s.label} className="flex items-center justify-between gap-2">
                        <span className={`${MONO} text-[9px] uppercase tracking-[0.16em] text-white/30`}>
                          {s.label}
                        </span>
                        <span className={`${MONO} text-[10.5px] font-semibold text-white/75`}>
                          {s.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ══ RIGHT PANEL — copy ══ */}
              <div
                className="flex flex-1 flex-col justify-between px-7 py-7"
                style={{ background: "#07090f" }}
              >
                <div className="flex flex-col gap-4">
                  {/* Headline */}
                  <h2 className="text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-white">
                    1.5× FP4 compute.
                    <br />
                    <span style={{ color: "#76b900" }}>Double the bandwidth.</span>
                    <br />
                    B300 Blackwell Ultra.
                  </h2>

                  {/* Description */}
                  <p className="text-[13px] leading-[1.65] text-white/50">
                    The B300 outpaces the B200 with more HBM3e memory capacity,
                    double the inter-node networking bandwidth, and native
                    first-class support for FP4 reasoning workloads.
                  </p>

                  {/* Urgency strip */}
                  <div className="flex items-center rounded-[5px] border border-orange-500/20 bg-orange-500/[0.06] px-4 py-2.5">
                    <p className={`${MONO} text-[9.5px] font-semibold uppercase leading-[1.5] tracking-[0.14em] text-orange-400`}>
                      Limited reserved capacity — allocations filling fast
                    </p>
                  </div>
                </div>

                {/* CTAs */}
                <div className="mt-6 flex flex-col gap-2">
                  <Link
                    href="/contact"
                    onClick={() => setOpen(false)}
                    className="group flex w-full items-center justify-center gap-2 rounded-[5px] bg-[#0095FF] py-3.5 text-[13px] font-bold text-white transition-all hover:bg-[#33adff] hover:shadow-[0_0_24px_rgba(0,149,255,0.45)]"
                  >
                    Contact Sales — Secure Yours
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/services/gpu"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center justify-center rounded-[5px] border border-white/[0.09] bg-white/[0.03] py-3 text-[13px] font-medium text-white/55 transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-white/90"
                  >
                    View full GPU lineup
                  </Link>
                </div>

                <p className={`${MONO} mt-4 text-center text-[9px] uppercase tracking-[0.16em] text-white/20`}>
                  NVLink 5.0 · Committed pricing · 24 / 7 support
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
