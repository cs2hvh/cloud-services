"use client";

import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";
import {
  Cpu,
  FileJson,
  Rocket,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";

// ─── Phase definitions ──────────────────────────────────────────────
type Phase = {
  num: string;
  label: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

const PHASES: Phase[] = [
  {
    num: "01",
    label: "Upload",
    icon: Upload,
    title: "Bring your JSONL.",
    body:
      "Each line is one chat turn. We accept up to 200 MB and pre-flight every row before you commit a GPU minute.",
  },
  {
    num: "02",
    label: "Validate",
    icon: FileJson,
    title: "Pre-flight surfaces every problem early.",
    body:
      "Schema check, token-count estimate, cost preview, baseline-loss probe. Bad rows surface in the error banner — not 8 minutes into a $0.50 run.",
  },
  {
    num: "03",
    label: "Pick GPU",
    icon: Cpu,
    title: "Choose by budget, not by docs.",
    body:
      "A40 for 8–14B bases (~$0.40/hr). A100 80GB for 27–32B (~$1.20/hr). H100 80GB for larger MoE (~$2.90/hr). Per-second billing on whichever you pick.",
  },
  {
    num: "04",
    label: "Train",
    icon: Sparkles,
    title: "Live loss, live step count, live cost.",
    body:
      "LoRA training streams progress from the pod into the dashboard. Step, epoch, latest loss, GPU utilization — visible in real time. Stop any time.",
  },
  {
    num: "05",
    label: "Eval gate",
    icon: ShieldCheck,
    title: "Bad runs never reach your catalog.",
    body:
      "Auto-rejects adapters where final_loss > baseline × 1.1. The comparison is surfaced in the dashboard so you can decide whether to re-run with different hyperparameters.",
  },
  {
    num: "06",
    label: "Deploy",
    icon: Rocket,
    title: "One adapter. Two paths to production.",
    body:
      "Self-serve docker on any GPU you control, or one-click managed hosted serving on a dedicated instance. The model id is the same; switch any time.",
  },
];

// ─── Section ────────────────────────────────────────────────────────
export default function FineTuningPipelineSection() {
  const sectionRef = useRef<HTMLDivElement | null>(null);

  // Active phase + progress rail are both driven directly from the
  // section's scroll position. Single source of truth, no
  // IntersectionObserver race conditions.
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    // Start filling once the section header reaches ~60% of viewport;
    // finish when the last phase reaches ~40% from the top.
    offset: ["start 60%", "end 40%"],
  });

  // Map 0..1 progress → which phase is active. With 6 phases each
  // phase "owns" 1/6 of the scroll. The +0.04 nudge means active
  // flips slightly BEFORE the next phase reaches viewport center,
  // so the right-side viz feels responsive rather than lagging.
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const stepSize = 1 / PHASES.length;
    const idx = Math.min(
      PHASES.length - 1,
      Math.max(0, Math.floor((p + 0.04) / stepSize))
    );
    setActive((cur) => (cur === idx ? cur : idx));
  });

  // Progress rail fills from 0% → 100% as the user scrolls through.
  const progressHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  // NOTE: we deliberately do NOT apply a `y` transform to the sticky
  // visualization. Chrome / Safari unpin `position: sticky` elements
  // that also carry a transform once the parent ends; the earlier
  // parallax was killing the sticky behavior past the mid-section.

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-clip bg-[#0E0F0F] py-32 sm:py-40"
    >
      {/* Atmospheric backdrop — radial wash that follows the active phase. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-all duration-1000 ease-out"
        style={{
          opacity: 0.22,
          background: `radial-gradient(45% 35% at ${20 + active * 12}% ${15 + active * 10}%, rgba(0,149,255,0.30), transparent 70%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
        }}
      />

      <Container className="relative z-10">
        {/* ─── Section header ─── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
            <span
              aria-hidden
              className="block h-1.5 w-1.5 rounded-full bg-[#33adff]"
              style={{ boxShadow: "0 0 8px rgba(0,149,255,0.7)" }}
            />
            The pipeline
          </div>
          <h2 className="mt-6 text-3xl font-[400] leading-[1.04] tracking-tight text-white sm:text-4xl lg:text-[3.6rem]">
            Six phases.{" "}
            <span className="text-[#8ecaff]">Zero infra to run.</span>
          </h2>
          <p className="mt-6 text-[15px] leading-7 text-white/55 sm:text-[16.5px]">
            From a JSONL file to a callable model id. Scroll the phases — the visual on the right tracks where you are.
          </p>
        </motion.div>

        {/* ─── Scroll-pinned narrative ───────────────────────────
            LEFT  ⇣ scrolling phase narrative threaded onto a rail
            RIGHT ⇣ sticky viz, vertically centered against the viewport */}
        <div className="relative mt-24 grid gap-x-16 gap-y-24 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-x-20">
          {/* ── LEFT COLUMN: phase narrative threaded onto a vertical rail ── */}
          <div className="relative pl-8 sm:pl-10">
            {/* Static background rail */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-2 top-3 bottom-3 w-px sm:left-3"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.07) 8%, rgba(255,255,255,0.07) 92%, transparent 100%)",
              }}
            />
            {/* Filled rail that grows with scroll */}
            <motion.div
              aria-hidden
              style={{ height: progressHeight }}
              className="pointer-events-none absolute left-2 top-3 w-px origin-top sm:left-3"
            >
              <div
                className="h-full w-full"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,149,255,0) 0%, rgba(51,173,255,0.95) 35%, rgba(51,173,255,0.95) 65%, rgba(0,149,255,0) 100%)",
                  boxShadow: "0 0 14px rgba(0,149,255,0.55)",
                }}
              />
            </motion.div>

            <div className="space-y-28 sm:space-y-32">
              {PHASES.map((p, i) => {
                const Icon = p.icon;
                const isActive = active === i;
                const isPast = active > i;
                return (
                  <motion.div
                    key={p.num}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{
                      duration: 0.55,
                      ease: [0.16, 1, 0.3, 1],
                      delay: 0.05,
                    }}
                    className="relative"
                  >
                    {/* Rail dot */}
                    <span
                      aria-hidden
                      className="absolute -left-[26px] top-5 block h-2.5 w-2.5 rounded-full border transition-all duration-500 sm:-left-[30px]"
                      style={
                        isActive
                          ? {
                              background: "#33adff",
                              borderColor: "#33adff",
                              boxShadow:
                                "0 0 14px rgba(0,149,255,0.85), 0 0 0 5px rgba(0,149,255,0.10)",
                            }
                          : isPast
                            ? {
                                background: "rgba(51,173,255,0.50)",
                                borderColor: "rgba(51,173,255,0.50)",
                              }
                            : {
                                background: "#0E0F0F",
                                borderColor: "rgba(255,255,255,0.18)",
                              }
                      }
                    />

                    {/* Icon badge + step meta */}
                    <div className="flex items-center gap-4">
                      <motion.div
                        animate={{
                          scale: isActive ? 1.04 : 0.94,
                          opacity: isActive ? 1 : 0.55,
                        }}
                        transition={{
                          duration: 0.5,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="relative"
                      >
                        {/* Outer glow */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -inset-3 rounded-2xl blur-xl transition-opacity duration-500"
                          style={{
                            opacity: isActive ? 0.9 : 0,
                            background:
                              "radial-gradient(50% 50% at 50% 50%, rgba(0,149,255,0.50), transparent 70%)",
                          }}
                        />
                        {/* Soft outer ring */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -inset-[3px] rounded-[14px] transition-opacity duration-500"
                          style={{
                            opacity: isActive ? 1 : 0,
                            background:
                              "conic-gradient(from 140deg at 50% 50%, rgba(51,173,255,0.55), rgba(0,149,255,0.05), rgba(51,173,255,0.55))",
                          }}
                        />
                        <div
                          className="relative flex h-12 w-12 items-center justify-center rounded-[12px] border text-white transition-colors duration-500"
                          style={
                            isActive
                              ? {
                                  background:
                                    "linear-gradient(135deg, rgba(0,149,255,0.32), rgba(0,149,255,0.08))",
                                  borderColor: "rgba(51,173,255,0.55)",
                                  boxShadow:
                                    "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -8px 16px rgba(0,149,255,0.18), 0 6px 20px rgba(0,149,255,0.35)",
                                }
                              : {
                                  background: "rgba(255,255,255,0.025)",
                                  borderColor: "rgba(255,255,255,0.08)",
                                  boxShadow:
                                    "inset 0 1px 0 rgba(255,255,255,0.05)",
                                }
                          }
                        >
                          <Icon
                            className="h-5 w-5 transition-colors duration-500"
                            strokeWidth={1.6}
                            style={{
                              color: isActive ? "#bfe0ff" : "rgba(255,255,255,0.55)",
                            }}
                          />
                        </div>
                      </motion.div>

                      <div className="min-w-0">
                        <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/35">
                          Phase{" "}
                          <span className="tabular-nums text-white/55">
                            {p.num}
                          </span>{" "}
                          / 06
                        </p>
                        <motion.p
                          animate={{
                            color: isActive
                              ? "#8ecaff"
                              : "rgba(255,255,255,0.62)",
                          }}
                          transition={{ duration: 0.5 }}
                          className="mt-1 font-mono text-[12px] uppercase tracking-[0.20em]"
                        >
                          {p.label}
                        </motion.p>
                      </div>
                    </div>

                    {/* Title + body */}
                    <motion.h3
                      animate={{ opacity: isActive ? 1 : 0.50 }}
                      transition={{ duration: 0.5 }}
                      className="mt-7 max-w-xl text-[26px] font-medium leading-[1.12] tracking-tight text-white sm:text-[30px]"
                    >
                      {p.title}
                    </motion.h3>
                    <motion.p
                      animate={{ opacity: isActive ? 0.72 : 0.38 }}
                      transition={{ duration: 0.5 }}
                      className="mt-4 max-w-md text-[14px] leading-[1.75] text-white/60 sm:text-[15px]"
                    >
                      {p.body}
                    </motion.p>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: sticky viz, vertically centered against viewport ──
              Plain CSS sticky. NO transform (Chrome/Safari unpin sticky
              elements that carry one). The `top: max(...)` keeps the
              card centered on tall screens but never crashes into the
              navbar on short ones. */}
          <div className="relative">
            <div
              className="lg:sticky"
              style={{ top: "max(7rem, calc(50vh - 280px))" }}
            >
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.985 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                {/* Soft outer glow */}
                <div
                  aria-hidden
                  className="absolute -inset-8 rounded-[28px] opacity-60 blur-3xl"
                  style={{
                    background:
                      "radial-gradient(55% 50% at 50% 40%, rgba(0,149,255,0.50), transparent 70%)",
                  }}
                />

                {/* Card */}
                <div className="relative overflow-hidden rounded-[16px] border border-white/[0.10] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.6)]">
                  {/* Top accent stripe */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)",
                      boxShadow: "0 0 16px rgba(0,149,255,0.55)",
                    }}
                  />

                  {/* Header bar: phase nav dots */}
                  <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
                      <span
                        aria-hidden
                        className="relative flex h-1.5 w-1.5"
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#33adff] opacity-60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#33adff]" />
                      </span>
                      <span className="text-[#33adff] tabular-nums">
                        {PHASES[active]?.num}
                      </span>
                      <span className="text-white/30">·</span>
                      <span className="text-white/80">
                        {PHASES[active]?.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {PHASES.map((_, i) => (
                        <span
                          key={i}
                          className="block h-1 rounded-full transition-all duration-500"
                          style={
                            active === i
                              ? {
                                  width: "16px",
                                  background: "#33adff",
                                  boxShadow:
                                    "0 0 6px rgba(0,149,255,0.7)",
                                }
                              : active > i
                                ? {
                                    width: "8px",
                                    background: "rgba(51,173,255,0.40)",
                                  }
                                : {
                                    width: "8px",
                                    background: "rgba(255,255,255,0.10)",
                                  }
                          }
                        />
                      ))}
                    </div>
                  </div>

                  {/* Viz panel */}
                  <div className="relative h-[460px] sm:h-[500px] overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={active}
                        initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -18, filter: "blur(6px)" }}
                        transition={{
                          duration: 0.5,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="absolute inset-0"
                      >
                        <PhaseVisualization phase={active} />
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between border-t border-white/[0.06] bg-[#0b0d12]/95 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] backdrop-blur-md">
                    <span className="text-white/45">
                      live in your dashboard
                    </span>
                    <span className="font-mono text-white/55 tabular-nums">
                      {String(active + 1).padStart(2, "0")}
                      <span className="text-white/30"> / </span>
                      {String(PHASES.length).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Right-column visualizations — one per phase. Each is its own little
// rich micro-UI; they cross-fade as the user scrolls.
// ────────────────────────────────────────────────────────────────────

function PhaseVisualization({ phase }: { phase: number }) {
  switch (phase) {
    case 0:
      return <VizUpload />;
    case 1:
      return <VizValidate />;
    case 2:
      return <VizPickGpu />;
    case 3:
      return <VizTrain />;
    case 4:
      return <VizEvalGate />;
    case 5:
      return <VizDeploy />;
    default:
      return null;
  }
}

// ─── Phase 1 — Upload ───────────────────────────────────────────────
function VizUpload() {
  return (
    <div className="flex h-full flex-col p-7 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">
          <Upload className="h-3.5 w-3.5 text-[#33adff]" />
          dataset.jsonl
        </div>
        <span className="font-mono text-[10px] text-white/35">12.4 MB</span>
      </div>

      <div className="mt-5 flex-1 overflow-hidden rounded-[6px] border border-white/[0.06] bg-black/40 p-4">
        <pre className="font-mono text-[10.5px] leading-relaxed text-white/75">
{`{"messages":[
  {"role":"user","content":"What is the refund policy?"},
  {"role":"assistant","content":"30 days from purchase..."}
]}
{"messages":[
  {"role":"user","content":"Where is order #4821?"},
  {"role":"assistant","content":"Order #4821 shipped on..."}
]}
{"messages":[
  {"role":"user","content":"Can I change my address?"},
  {"role":"assistant","content":"Yes — go to Account > Shipping..."}
]}`}
        </pre>
      </div>

      <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        <span>1,238 rows · 412k tokens</span>
        <span className="text-emerald-400/80">ready to validate</span>
      </div>
    </div>
  );
}

// ─── Phase 2 — Validate ─────────────────────────────────────────────
function VizValidate() {
  const checks = [
    { label: "Schema valid", value: "all 1,238 rows" },
    { label: "Token count", value: "411,872 tokens" },
    { label: "Cost preview", value: "$0.10 (A40 · 1 epoch)" },
    { label: "Baseline loss probe", value: "1.58 (eval gate target)" },
  ];
  return (
    <div className="flex h-full flex-col p-7 pb-16">
      <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">
        <ScanLine className="h-3.5 w-3.5 text-[#33adff]" />
        pre-flight checks
      </div>

      <div className="mt-5 flex-1 space-y-2.5">
        {checks.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.4 }}
            className="flex items-center justify-between rounded-[5px] border border-white/[0.06] bg-white/[0.015] px-4 py-3"
          >
            <div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                {c.label}
              </p>
              <p className="mt-0.5 text-[12.5px] font-semibold text-white">
                {c.value}
              </p>
            </div>
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.4 + i * 0.12, type: "spring", stiffness: 250 }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-400"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                <path
                  d="M5 12l4 4L19 8"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        <span>4 / 4 checks passed</span>
        <span className="text-emerald-400/80">ready to provision</span>
      </div>
    </div>
  );
}

// ─── Phase 3 — Pick GPU ─────────────────────────────────────────────
function VizPickGpu() {
  const gpus = [
    { sku: "A40 · 48GB",      sub: "for 8–14B bases",        rate: "$0.40/hr", est: "~$0.10", picked: true  },
    { sku: "A100 · 80GB",     sub: "for 27–32B bases",       rate: "$1.20/hr", est: "~$0.80", picked: false },
    { sku: "H100 · 80GB",     sub: "for larger MoE",          rate: "$2.90/hr", est: "~$3.40", picked: false },
  ];
  return (
    <div className="flex h-full flex-col p-7 pb-16">
      <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">
        <Cpu className="h-3.5 w-3.5 text-[#33adff]" />
        choose GPU
      </div>

      <div className="mt-5 flex-1 space-y-2.5">
        {gpus.map((g, i) => (
          <motion.div
            key={g.sku}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.45 }}
            className={`relative overflow-hidden rounded-[6px] border px-4 py-3.5 transition-colors ${
              g.picked
                ? "border-[#33adff]/55 bg-[#0095FF]/[0.08]"
                : "border-white/[0.06] bg-white/[0.015]"
            }`}
          >
            {g.picked && (
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)",
                  boxShadow: "0 0 12px rgba(0,149,255,0.55)",
                }}
              />
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[12.5px] font-semibold text-white">
                  {g.sku}
                </p>
                <p className="mt-0.5 text-[10.5px] text-white/45">{g.sub}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[12px] font-semibold text-white tabular-nums">
                  {g.rate}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-emerald-400/85 tabular-nums">
                  est {g.est}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        <span>per-second metering</span>
        <span className="text-[#33adff]">selected: A40</span>
      </div>
    </div>
  );
}

// ─── Phase 4 — Train ────────────────────────────────────────────────
function VizTrain() {
  // Different "frozen frame" each render so visual reads as live but
  // not identical to the hero card.
  return (
    <div className="flex h-full flex-col p-7 pb-16">
      <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">
        <span className="inline-flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#33adff] opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#33adff]" />
          </span>
          training · step 214 / 300
        </span>
        <span className="tabular-nums text-white/55">loss 1.418</span>
      </div>

      <div className="mt-5 flex-1 overflow-hidden rounded-[6px] border border-white/[0.06] bg-black/30 p-3">
        <svg viewBox="0 0 280 160" className="h-full w-full">
          {/* Grid lines */}
          {[40, 80, 120].map((y) => (
            <line key={y} x1="0" x2="280" y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />
          ))}
          <defs>
            <linearGradient id="trainFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0095FF" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#0095FF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M 0 20 C 14 28, 28 50, 40 70 S 70 110, 84 122 S 116 132, 130 130 S 162 135, 178 132 S 212 134, 228 130 S 258 134, 280 132 L 280 160 L 0 160 Z"
            fill="url(#trainFill)"
          />
          <motion.path
            d="M 0 20 C 14 28, 28 50, 40 70 S 70 110, 84 122 S 116 132, 130 130 S 162 135, 178 132 S 212 134, 228 130 S 258 134, 280 132"
            fill="none"
            stroke="#33adff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: "drop-shadow(0 0 4px rgba(0,149,255,0.55))" }}
          />
          <circle cx="228" cy="130" r="3.5" fill="#33adff">
            <animate attributeName="r" from="3" to="9" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="1" to="0" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <circle cx="228" cy="130" r="3.5" fill="#33adff" />
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Epoch"   value="2.14" />
        <Stat label="GPU util" value="84%"  accent="#4ade80" />
        <Stat label="Elapsed" value="4m 28s" />
      </div>
    </div>
  );
}

// ─── Phase 5 — Eval gate ────────────────────────────────────────────
function VizEvalGate() {
  return (
    <div className="flex h-full flex-col p-7 pb-16">
      <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">
        <ShieldCheck className="h-3.5 w-3.5 text-[#33adff]" />
        eval gate
      </div>

      <div className="mt-6 flex-1 space-y-7">
        {/* Baseline bar */}
        <div>
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
              Baseline loss
            </p>
            <p className="font-mono text-[14px] font-semibold text-white/65 tabular-nums">
              1.580
            </p>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "75%" }}
              transition={{ duration: 1, delay: 0.2 }}
              className="h-full rounded-full bg-white/35"
            />
          </div>
        </div>

        {/* Final loss bar */}
        <div>
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
              Final loss
            </p>
            <p className="font-mono text-[14px] font-semibold tabular-nums text-emerald-400">
              1.418
            </p>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "62%" }}
              transition={{ duration: 1, delay: 0.5 }}
              className="h-full rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, #22c55e 0%, #4ade80 100%)",
                boxShadow: "0 0 12px rgba(34,197,94,0.4)",
              }}
            />
          </div>
        </div>

        {/* Pass stamp */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85, rotate: -3 }}
          animate={{ opacity: 1, scale: 1, rotate: -2 }}
          transition={{ delay: 1.1, type: "spring", stiffness: 200 }}
          className="mx-auto w-fit"
        >
          <div className="rounded-[6px] border-2 border-emerald-400/60 bg-emerald-400/[0.06] px-5 py-2.5">
            <p className="font-mono text-[12px] font-bold uppercase tracking-[0.22em] text-emerald-400">
              ✓ pass
            </p>
            <p className="mt-0.5 text-center font-mono text-[9.5px] uppercase tracking-[0.16em] text-emerald-300/65">
              1.418 &lt; 1.580 × 1.1
            </p>
          </div>
        </motion.div>
      </div>

      <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        <span>diverged adapters auto-rejected</span>
        <span className="text-emerald-400/80">registering model id</span>
      </div>
    </div>
  );
}

// ─── Phase 6 — Deploy ───────────────────────────────────────────────
function VizDeploy() {
  return (
    <div className="flex h-full flex-col p-7 pb-16">
      <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">
        <Rocket className="h-3.5 w-3.5 text-[#33adff]" />
        ready to serve
      </div>

      {/* Model id card */}
      <div className="mt-5 rounded-[6px] border border-[#33adff]/30 bg-[#0095FF]/[0.06] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
          Model id
        </p>
        <p className="mt-1.5 break-all font-mono text-[14px] font-semibold text-white">
          ahura/phi-4:ft-a1b2c3d4
        </p>
      </div>

      {/* Two side-by-side serving paths */}
      <div className="mt-4 grid flex-1 grid-cols-2 gap-3">
        <div className="flex flex-col rounded-[6px] border border-emerald-400/25 bg-emerald-400/[0.04] p-3.5">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-emerald-300/85">
            Self-serve
          </p>
          <p className="mt-1.5 text-[12px] font-semibold text-white">
            Docker on your GPU
          </p>
          <p className="mt-1.5 flex-1 text-[10.5px] leading-relaxed text-white/45">
            Copy a ready-to-paste docker run. vLLM on :8000, OpenAI-compatible.
          </p>
          <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-emerald-400/85">
            free
          </p>
        </div>

        <div className="flex flex-col rounded-[6px] border border-[#33adff]/30 bg-[#0095FF]/[0.05] p-3.5">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#33adff]">
            Managed
          </p>
          <p className="mt-1.5 text-[12px] font-semibold text-white">
            Dedicated hosted serving
          </p>
          <p className="mt-1.5 flex-1 text-[10.5px] leading-relaxed text-white/45">
            One click. Per-customer GPU, per-second billing, auto-stops idle.
          </p>
          <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#33adff]">
            from $0.40/hr
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        <span>same adapter, both paths</span>
        <span className="text-emerald-400/80">callable now</span>
      </div>
    </div>
  );
}

// ─── Small Stat helper used inside the Train viz ─────────────────────
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[5px] border border-white/[0.06] bg-white/[0.015] px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
        {label}
      </p>
      <p
        className="mt-1 font-mono text-[13px] font-semibold tabular-nums"
        style={{ color: accent ?? "rgba(255,255,255,0.92)" }}
      >
        {value}
      </p>
    </div>
  );
}
