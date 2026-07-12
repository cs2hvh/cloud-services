"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const NVIDIA_GREEN = "#76b900";

const SPECS = [
  { label: "VRAM", value: "288 GB" },
  { label: "Memory", value: "HBM3e" },
  { label: "Bandwidth", value: "1.8 TB/s" },
];

export default function HomePopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => setOpen(true), 1000);
    return () => clearTimeout(timeoutId);
  }, []);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="NVIDIA B300 announcement"
        >
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setOpen(false)}
          />

          {/* Card */}
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-[1000] flex max-h-[90svh] w-full max-w-[660px] flex-col overflow-y-auto overflow-x-hidden rounded-[8px] sm:flex-row sm:overflow-hidden"
            style={{
              boxShadow:
                "0 0 0 1px rgba(0,149,255,0.16), 0 40px 110px rgba(0,0,0,0.85), 0 0 90px rgba(0,149,255,0.10)",
            }}
          >
            {/* Close */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3.5 top-3.5 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/55 backdrop-blur-sm ring-1 ring-white/10 transition-all hover:bg-black/80 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            {/* ══ LEFT PANEL — product ══ */}
            <div
              className="relative flex w-full shrink-0 flex-col sm:w-[44%]"
              style={{
                background: "linear-gradient(180deg, #07101c 0%, #03060e 100%)",
              }}
            >
              {/* Image — object-contain so the GPU is never cropped */}
              <div className="relative h-[118px] w-full sm:h-auto sm:flex-1">
                {/* Brand glow behind the render */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(58% 58% at 50% 42%, rgba(0,149,255,0.22), transparent 72%)",
                  }}
                />
                <Image
                  src="https://ahurasense.cs2hvh.com/images/2026-06/If67bS30r5fO.png"
                  alt="NVIDIA B300 GPU"
                  fill
                  sizes="(min-width: 640px) 290px, 100vw"
                  className="object-contain object-center p-5 sm:p-6"
                  priority={false}
                />
                {/* Bottom fade into the spec block */}
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#03060e] to-transparent" />
              </div>

              {/* Spec block */}
              <div className="flex flex-col px-6 pb-4 pt-1 sm:pb-7">
                <span
                  className={`${MONO} text-[11px] font-bold uppercase tracking-[0.28em]`}
                  style={{ color: NVIDIA_GREEN }}
                >
                  NVIDIA
                </span>
                <span
                  className={`${MONO} mt-1 text-[8.5px] font-semibold uppercase tracking-[0.22em]`}
                  style={{ color: `${NVIDIA_GREEN}99` }}
                >
                  Blackwell Architecture
                </span>

                <div
                  className="mt-2 select-none text-[42px] font-semibold leading-none tracking-[-0.04em] sm:mt-2.5 sm:text-[60px]"
                  style={{
                    background:
                      "linear-gradient(145deg, #ffffff 0%, #d4e6ff 45%, #79b5ff 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: "drop-shadow(0 0 22px rgba(0,149,255,0.35))",
                  }}
                >
                  B300
                </div>

                <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.07] pt-3.5">
                  {SPECS.map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center justify-between gap-2"
                    >
                      <span
                        className={`${MONO} text-[9px] uppercase tracking-[0.16em] text-white/35`}
                      >
                        {s.label}
                      </span>
                      <span
                        className={`${MONO} text-[11px] font-semibold tabular-nums text-white/80`}
                      >
                        {s.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ══ RIGHT PANEL — copy ══ */}
            <div
              className="flex flex-1 flex-col justify-between gap-5 px-6 py-6 sm:gap-6 sm:px-8 sm:py-8"
              style={{ background: "#07090f" }}
            >
              <div className="flex flex-col gap-3 pr-6 sm:gap-3.5 sm:pr-2">
                <span
                  className={`${MONO} inline-flex w-fit items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: NVIDIA_GREEN }}
                  />
                  Now available
                </span>

                <h2 className="text-balance text-[20px] font-semibold leading-[1.2] tracking-[-0.025em] text-white antialiased sm:text-[26px] sm:leading-[1.18]">
                  1.5× FP4 compute.{" "}
                  <span style={{ color: NVIDIA_GREEN }}>
                    Double the bandwidth.
                  </span>{" "}
                  Meet B300 Blackwell Ultra.
                </h2>

                <p className="text-[13px] leading-[1.65] text-white/55">
                  The B300 outpaces the B200 with more HBM3e memory capacity,
                  double the inter-node networking bandwidth, and native
                  first-class support for FP4 reasoning workloads.
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                <Link
                  href="/contact?topic=reserved-gpu"
                  onClick={() => setOpen(false)}
                  className="group flex w-full items-center justify-center gap-2 rounded-[5px] bg-[#0095FF] py-3.5 text-[13.5px] font-semibold tracking-[-0.01em] text-white ring-1 ring-inset ring-white/15 transition-all hover:bg-[#1aa3ff]"
                  style={{
                    boxShadow:
                      "0 10px 30px -10px rgba(0,149,255,0.65), inset 0 1px 0 rgba(255,255,255,0.18)",
                  }}
                >
                  Contact sales — secure yours
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/services/gpu"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center justify-center rounded-[5px] border border-white/10 bg-white/[0.03] py-3 text-[13px] font-medium text-white/60 transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                >
                  View full GPU lineup
                </Link>

                <p
                  className={`${MONO} mt-1 text-center text-[8.5px] uppercase tracking-[0.16em] text-white/25`}
                >
                  NVLink 5.0 · Committed pricing · 24 / 7 support
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
