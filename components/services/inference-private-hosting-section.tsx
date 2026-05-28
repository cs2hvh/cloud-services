"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Container } from "@/components/ui/container";

// ─── Lanes for the left-side visualization ──────────────────────────
// Eight tenant lanes; only "your-org" is highlighted. The visualization
// is read top-to-bottom as a stack of isolated request streams.
type Lane = {
  id: string;
  org: string;
  model: string;
  highlight?: boolean;
};

const LANES: Lane[] = [
  { id: "l1", org: "acme-co",     model: "phi-4" },
  { id: "l2", org: "blue-labs",   model: "llama-3.3-8b" },
  { id: "l3", org: "northstar",   model: "qwen-3-32b" },
  { id: "l4", org: "your-org",    model: "llama-4-maverick", highlight: true },
  { id: "l5", org: "atlas-dev",   model: "deepseek-v3" },
  { id: "l6", org: "kindred",     model: "mistral-7b" },
  { id: "l7", org: "ironside",    model: "gemma-3-27b" },
];

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
            "radial-gradient(45% 35% at 25% 50%, rgba(0,149,255,0.30), transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:items-center">
          {/* ─── LEFT: isolation-lanes visualization ─── */}
          <div>
            <IsolationLanes lanes={LANES} inView={inView} />
          </div>

          {/* ─── RIGHT: editorial typography + minimal list ─── */}
          <div>
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

            <div className="mt-12 border-t border-white/[0.06]">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{
                    duration: 0.5,
                    ease: [0.16, 1, 0.3, 1],
                    delay: 0.2 + i * 0.08,
                  }}
                  className="border-b border-white/[0.06] py-5"
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
          </div>
        </div>
      </Container>
    </section>
  );
}

// ─── Isolation Lanes ────────────────────────────────────────────────
// Horizontal stack of lanes representing isolated tenant traffic.
// Each lane is a thin horizontal channel with a glowing packet flowing
// left → right. The highlighted lane is brighter and labeled; others
// are dim, narrower, and ghosted. Reads as "your request stays in
// your lane — neighbors are invisible to it."
function IsolationLanes({ lanes, inView }: { lanes: Lane[]; inView: boolean }) {
  return (
    <div className="relative">
      {/* Outer glow */}
      <div
        aria-hidden
        className="absolute -inset-4 opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(55% 50% at 40% 50%, rgba(0,149,255,0.28), transparent 70%)",
        }}
      />

      <div className="relative space-y-3 border border-white/[0.06] bg-[#0a0a0a] p-6 shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)] sm:p-8">
        {lanes.map((lane, i) => (
          <LaneRow key={lane.id} lane={lane} index={i} inView={inView} />
        ))}
      </div>
    </div>
  );
}

function LaneRow({
  lane,
  index,
  inView,
}: {
  lane: Lane;
  index: number;
  inView: boolean;
}) {
  const isHi = lane.highlight;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{
        duration: 0.5,
        delay: 0.15 + index * 0.06,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="grid items-center gap-3 sm:grid-cols-[120px_minmax(0,1fr)_140px]"
    >
      {/* Left: org chip */}
      <div className="flex items-center gap-2">
        <span
          className="block h-1 w-1 rounded-full"
          style={{
            background: isHi ? "#33adff" : "rgba(255,255,255,0.18)",
            boxShadow: isHi ? "0 0 6px rgba(51,173,255,0.8)" : "none",
          }}
        />
        <span
          className="truncate font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] tracking-[0.10em]"
          style={{
            color: isHi
              ? "rgba(255,255,255,0.92)"
              : "rgba(255,255,255,0.32)",
          }}
        >
          {lane.org}
        </span>
      </div>

      {/* Middle: the lane (with traveling packet on highlighted only) */}
      <div className="relative h-[14px]">
        {/* Lane track */}
        <div
          className="absolute inset-y-[5px] left-0 right-0"
          style={{
            background: isHi
              ? "linear-gradient(90deg, rgba(51,173,255,0.05), rgba(51,173,255,0.20), rgba(51,173,255,0.05))"
              : "rgba(255,255,255,0.04)",
          }}
        />
        {/* Lane edges */}
        <div
          className="absolute left-0 right-0 top-[5px] h-px"
          style={{
            background: isHi ? "rgba(51,173,255,0.30)" : "rgba(255,255,255,0.05)",
          }}
        />
        <div
          className="absolute left-0 right-0 bottom-[5px] h-px"
          style={{
            background: isHi ? "rgba(51,173,255,0.30)" : "rgba(255,255,255,0.05)",
          }}
        />

        {/* Packets — only on the highlighted lane */}
        {isHi && inView && (
          <>
            <motion.span
              animate={{ left: ["-5%", "105%"] }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute top-1/2 -translate-y-1/2"
            >
              <span
                className="block h-2 w-6 rounded-sm"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #33adff 60%, #8ecaff 100%)",
                  boxShadow: "0 0 10px rgba(51,173,255,0.9)",
                }}
              />
            </motion.span>
            <motion.span
              animate={{ left: ["-5%", "105%"] }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                delay: 1.1,
                ease: "easeInOut",
              }}
              className="absolute top-1/2 -translate-y-1/2"
            >
              <span
                className="block h-2 w-4 rounded-sm opacity-70"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #33adff 60%, #8ecaff 100%)",
                  boxShadow: "0 0 8px rgba(51,173,255,0.7)",
                }}
              />
            </motion.span>
          </>
        )}
      </div>

      {/* Right: model id */}
      <div className="flex items-center justify-end gap-2 text-right">
        <span
          className="truncate font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] tracking-[0.10em]"
          style={{
            color: isHi
              ? "rgba(255,255,255,0.92)"
              : "rgba(255,255,255,0.32)",
          }}
        >
          {lane.model}
        </span>
      </div>
    </motion.div>
  );
}
