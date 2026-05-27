"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  Cpu,
  Gauge,
  Lock,
  ShieldCheck,
  Timer,
  Zap,
} from "lucide-react";

import { Container } from "@/components/ui/container";

// ─── Static highlights (right column) ────────────────────────────────
const HIGHLIGHTS: Array<{ icon: typeof Cpu; title: string; body: string }> = [
  {
    icon: Cpu,
    title: "Single-tenant GPU",
    body:
      "One pod per customer — never shared. Pick your SKU (A40 / A100 / H100). Routed only on your API key.",
  },
  {
    icon: Zap,
    title: "Bring HuggingFace or Docker",
    body:
      "Paste a HuggingFace model id (we materialize at boot with your token, encrypted at rest) or point at any OCI image. Truss coming soon.",
  },
  {
    icon: Timer,
    title: "Auto-stop when idle",
    body:
      "Idle past your configured window? We tear the pod down so you stop being billed. Cold-start handled with a clean 503 + Retry-After.",
  },
  {
    icon: Lock,
    title: "Encrypted boundary",
    body:
      "HF tokens + provider keys stored with AES-256-GCM, decrypted only at provision. Optional ZDR keys never have prompts logged.",
  },
];

// ─── Section ────────────────────────────────────────────────────────
export default function InferencePrivateHostingSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  // Live-feel metrics that tick up while the section is in view. Stops
  // ticking when the section leaves the viewport (saves cycles +
  // matches what a real metrics dashboard does).
  const [elapsedSec, setElapsedSec] = useState(15_120); // ~4h 12m
  const [requests, setRequests] = useState(14_238);
  const [costCents, setCostCents] = useState(168);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.15 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    // Tick every 1.5s — fast enough to feel alive, slow enough that
    // the cost number doesn't look like a slot machine.
    const t = window.setInterval(() => {
      setElapsedSec((s) => s + 2);
      setRequests((r) => r + Math.floor(2 + Math.random() * 5));
      // Cost ~$0.40/hr on the H100 demo = ~0.011¢/sec
      setCostCents((c) => c + (Math.random() < 0.3 ? 1 : 0));
    }, 1500);
    return () => window.clearInterval(t);
  }, [inView]);

  const hh = Math.floor(elapsedSec / 3600);
  const mm = Math.floor((elapsedSec % 3600) / 60);
  const uptime = `${hh}h ${String(mm).padStart(2, "0")}m`;
  const cost = `$${(costCents / 100).toFixed(2)}`;

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden bg-[#04060a] py-24 sm:py-32"
    >
      {/* Atmospheric backdrop — concentric soft rings + faint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.25]"
        style={{
          background:
            "radial-gradient(45% 35% at 78% 50%, rgba(0,149,255,0.30), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage:
            "radial-gradient(ellipse 70% 50% at 75% 50%, black, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 50% at 75% 50%, black, transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        <div className="grid gap-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20 lg:items-center">
          {/* ─── LEFT: the dedicated-endpoint diagram ─────────── */}
          <div className="relative">
            {/* Inbound request lanes — three diagonal lines coming in
                from the upper-left, sliding into the card. Suggests
                "your API key's traffic, routed to your pod". */}
            <div
              aria-hidden
              className="pointer-events-none absolute -left-12 -top-10 h-44 w-44 opacity-60"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -40, y: -40 }}
                  animate={inView ? { opacity: [0, 1, 0], x: 80, y: 80 } : {}}
                  transition={{
                    duration: 2.4,
                    delay: i * 0.8,
                    repeat: Infinity,
                    repeatDelay: 1.2,
                    ease: "easeOut",
                  }}
                  className="absolute h-px w-32 origin-left"
                  style={{
                    top: `${20 + i * 18}px`,
                    background: `linear-gradient(90deg, rgba(0,149,255,0.0), rgba(0,149,255,0.9), rgba(0,149,255,0.0))`,
                    transform: "rotate(35deg)",
                  }}
                />
              ))}
            </div>

            {/* The endpoint card itself */}
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto max-w-[480px]"
            >
              {/* Outer glow */}
              <div
                aria-hidden
                className="absolute -inset-6 rounded-3xl opacity-60 blur-2xl"
                style={{
                  background:
                    "radial-gradient(50% 50% at 50% 50%, rgba(0,149,255,0.40), transparent 70%)",
                }}
              />

              <div className="relative overflow-hidden rounded-xl border border-white/[0.10] bg-[#0b0d12] shadow-[0_24px_64px_rgba(0,0,0,0.55)]">
                {/* Card chrome — status header */}
                <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-emerald-300/90">
                      Live
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                    <span>H100 80GB</span>
                    <span className="text-white/15">·</span>
                    <span>bom-01</span>
                  </div>
                </div>

                {/* Model id + dedicated-instance label */}
                <div className="px-5 py-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                    Model id
                  </p>
                  <p className="mt-1.5 break-all font-mono text-[14px] font-semibold text-white">
                    ahura/llama-4-maverick:byo-a1b2c3d4
                  </p>

                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-[3px] border border-[#0095FF]/30 bg-[#0095FF]/[0.10] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#33adff]">
                    <ShieldCheck className="h-3 w-3" />
                    Dedicated · single tenant
                  </div>

                  {/* Live metrics — 4 cells */}
                  <div className="mt-5 grid grid-cols-2 gap-3 rounded-[6px] border border-white/[0.06] bg-black/30 p-4">
                    <MetricCell label="Uptime" value={uptime} />
                    <MetricCell
                      label="Spend"
                      value={cost}
                      accent="#4ade80"
                    />
                    <MetricCell
                      label="Requests"
                      value={requests.toLocaleString()}
                    />
                    <MetricCell label="p95 latency" value="412 ms" />
                  </div>

                  {/* Utilization bar — gently breathing */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                      <span>GPU utilization</span>
                      <span className="text-white/55">68%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.div
                        initial={{ width: "0%" }}
                        animate={inView ? { width: ["62%", "74%", "62%"] } : {}}
                        transition={{
                          duration: 4,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                        className="h-full rounded-full"
                        style={{
                          background:
                            "linear-gradient(90deg, #0095FF 0%, #33adff 50%, #0095FF 100%)",
                          boxShadow: "0 0 12px rgba(0,149,255,0.6)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                    <span className="inline-flex items-center gap-1.5">
                      <Timer className="h-3 w-3" />
                      Auto-stops after 6h idle
                    </span>
                    <span className="text-emerald-400/80">$0.40/hr</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Footer caption under the card */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="mx-auto mt-6 max-w-[480px] text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/35"
            >
              A real endpoint, your model, your GPU
              <span className="mx-2 text-white/15">·</span>
              isolated by org, billed by the hour
            </motion.p>
          </div>

          {/* ─── RIGHT: copy + highlight grid ─────────────────── */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Private hosting
              </p>
              <h2 className="mt-4 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
                Your model.
                <span className="block text-[#8ecaff]">Your GPU.</span>
                Your data path.
              </h2>
              <p className="mt-6 max-w-lg text-[15px] leading-7 text-white/55 sm:text-[16px]">
                Fine-tunes and bring-your-own models get a dedicated GPU — one instance per customer, never shared. Same gateway, same key. Billed by the hour, auto-stopped when idle.
              </p>

              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                {HIGHLIGHTS.map((h, i) => {
                  const Icon = h.icon;
                  return (
                    <motion.div
                      key={h.title}
                      initial={{ opacity: 0, y: 12 }}
                      animate={inView ? { opacity: 1, y: 0 } : {}}
                      transition={{
                        duration: 0.5,
                        ease: [0.16, 1, 0.3, 1],
                        delay: 0.3 + i * 0.07,
                      }}
                      className="group/h relative rounded-[6px] border border-white/[0.06] bg-white/[0.015] p-4 transition-colors duration-300 hover:border-white/[0.18] hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-white/[0.08] bg-white/[0.03] text-[#33adff] transition-colors group-hover/h:border-[#33adff]/40 group-hover/h:bg-[#0095FF]/[0.08]">
                          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </div>
                        <p className="text-[13px] font-semibold text-white">
                          {h.title}
                        </p>
                      </div>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-white/55">
                        {h.body}
                      </p>
                    </motion.div>
                  );
                })}
              </div>

              {/* Inline secondary CTA — light, doesn't compete with the
                  hero's primary button */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.7 }}
                className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/45"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-white/40" />
                  Per-second billing
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-white/40" />
                  RLS-isolated
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-white/40" />
                  ZDR-compatible
                </span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </Container>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Live-metric cell — used inside the endpoint card. Static label +
// big value, tabular-nums so ticking numbers don't shift width.
// ────────────────────────────────────────────────────────────────────
function MetricCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
        {label}
      </p>
      <p
        className="mt-1 font-mono text-[15px] font-semibold tabular-nums"
        style={{ color: accent ?? "rgba(255,255,255,0.92)" }}
      >
        {value}
      </p>
    </div>
  );
}
