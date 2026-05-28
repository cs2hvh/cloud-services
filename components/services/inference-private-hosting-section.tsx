"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Cpu, Lock, ShieldCheck, Timer, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";

// ─── Tenants for the routing diagram ───────────────────────────────
// Eight tenants in the visual; only "your-org" is highlighted. The
// model id on the highlighted lane matches the live demo card below.
type Tenant = {
  id: string;
  org: string;
  model: string;
  status: "live" | "idle" | "warming";
  highlight?: boolean;
};

const TENANTS: Tenant[] = [
  { id: "t1", org: "acme-co",    model: "phi-4",            status: "live" },
  { id: "t2", org: "blue-labs",  model: "llama-3.3-8b",    status: "live" },
  { id: "t3", org: "your-org",   model: "llama-4-maverick", status: "live", highlight: true },
  { id: "t4", org: "northstar",  model: "qwen-3-32b",       status: "idle" },
  { id: "t5", org: "atlas-dev",  model: "deepseek-v3",      status: "warming" },
  { id: "t6", org: "kindred",    model: "mistral-7b",       status: "live" },
];

const FEATURES: { icon: LucideIcon; label: string; body: string }[] = [
  {
    icon: Cpu,
    label: "Single-tenant pod",
    body: "One GPU instance per customer — never shared. Pick A40, A100, or H100.",
  },
  {
    icon: Zap,
    label: "Bring your model",
    body: "Paste a HuggingFace id or point at a Docker image. Boot with your token, encrypted at rest.",
  },
  {
    icon: Timer,
    label: "Auto-stop when idle",
    body: "Idle past your configured window? Pod tears down. Spend stops. Cold-start returns a clean 503.",
  },
  {
    icon: Lock,
    label: "Encrypted boundary",
    body: "AES-256-GCM at rest. Routed only on your API key. ZDR-compatible — prompts never logged.",
  },
];

export default function InferencePrivateHostingSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  // Live-feel ticker for the highlighted lane only
  const [elapsedSec, setElapsedSec] = useState(15_120);
  const [requests, setRequests] = useState(14_238);
  const [costCents, setCostCents] = useState(168);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (e) => { if (e[0]?.isIntersecting) setInView(true); },
      { threshold: 0.15 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    const t = window.setInterval(() => {
      setElapsedSec((s) => s + 2);
      setRequests((r) => r + Math.floor(2 + Math.random() * 5));
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
      className="relative z-10 overflow-clip bg-[#04060a] py-16 lg:py-24"
    >
      {/* Section divider matching homepage */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Subtle backdrop */}
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
          {/* ─── LEFT: Routing diagram ─── */}
          <div className="relative">
            <RoutingDiagram
              tenants={TENANTS}
              inView={inView}
              uptime={uptime}
              cost={cost}
              requests={requests}
            />
          </div>

          {/* ─── RIGHT: Editorial typography + inline feature list ─── */}
          <div>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
              className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[11px] uppercase tracking-[0.22em] text-white/40"
            >
              Private hosting · single-tenant
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 text-4xl font-semibold leading-[1.04] tracking-[-0.025em] text-white sm:text-5xl lg:text-[56px]"
            >
              Your model.{" "}
              <span className="text-white/35">/</span>{" "}
              <span className="text-[#33adff]">Your GPU.</span>{" "}
              <span className="text-white/35">/</span>{" "}
              <span className="block sm:inline">Your data path.</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="mt-6 max-w-md text-[15px] leading-7 text-white/55"
            >
              One pod per customer. Same gateway, same key. Billed by the hour,
              auto-stopped when idle.
            </motion.p>

            {/* Inline feature list — hairline-divided, not boxed */}
            <div className="mt-10 border-t border-white/[0.06]">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{
                      duration: 0.5,
                      ease: [0.16, 1, 0.3, 1],
                      delay: 0.25 + i * 0.08,
                    }}
                    className="group flex items-start gap-4 border-b border-white/[0.06] py-4 transition-colors hover:bg-white/[0.015]"
                  >
                    <Icon
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#33adff] transition-colors group-hover:text-white"
                      strokeWidth={1.5}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-white">
                        {f.label}
                      </p>
                      <p className="mt-1 text-[12.5px] leading-[1.6] text-white/50">
                        {f.body}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Compliance row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] uppercase tracking-[0.16em] text-white/35"
            >
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3" />
                RLS-isolated
              </span>
              <span>·</span>
              <span>Per-second billing</span>
              <span>·</span>
              <span>ZDR-compatible</span>
            </motion.div>
          </div>
        </div>
      </Container>
    </section>
  );
}

// ─── Routing Diagram ───────────────────────────────────────────────
// SVG composition showing API keys → gateway → dedicated pods. Only the
// highlighted lane (your-org) is animated bright; others are dim. Below
// the diagram, a compact live-metric strip for the highlighted pod.
function RoutingDiagram({
  tenants,
  inView,
  uptime,
  cost,
  requests,
}: {
  tenants: Tenant[];
  inView: boolean;
  uptime: string;
  cost: string;
  requests: number;
}) {
  // Layout geometry
  const W = 560;
  const ROW_H = 44;
  const TOP = 24;
  const H = TOP + tenants.length * ROW_H + 36;

  const keyX = 18;          // left rail (API keys)
  const keyW = 130;
  const gatewayX = W / 2;   // center gateway
  const gatewayR = 18;
  const podX = W - 18 - 150;
  const podW = 150;

  // Helpers
  const rowY = (i: number) => TOP + i * ROW_H + ROW_H / 2;

  return (
    <div className="relative">
      {/* Outer glow */}
      <div
        aria-hidden
        className="absolute -inset-4 opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(55% 50% at 50% 50%, rgba(0,149,255,0.30), transparent 70%)",
        }}
      />

      {/* Card */}
      <div className="relative border border-white/[0.08] bg-[#0a0a0a] shadow-[0px_5px_17.7px_rgba(0,0,0,0.75)]">
        {/* Card chrome */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-2 font-[var(--font-geist-mono),ui-monospace,monospace] text-[10.5px] uppercase tracking-[0.16em] text-white/45">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" style={{ animationDuration: "2.5s" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            api.cs2hvh.com · gateway
          </div>
          <span className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[9px] uppercase tracking-[0.16em] text-white/25">
            {tenants.length} tenants · isolated
          </span>
        </div>

        {/* SVG diagram */}
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <radialGradient id="gatewayGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#33adff" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#0095FF" stopOpacity="0.1" />
              </radialGradient>
              <linearGradient id="lineHi" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(51,173,255,0.1)" />
                <stop offset="50%" stopColor="rgba(51,173,255,0.9)" />
                <stop offset="100%" stopColor="rgba(51,173,255,0.1)" />
              </linearGradient>
              {/* Packet motion path uses these for each highlighted lane */}
            </defs>

            {/* Gateway hub */}
            <motion.circle
              cx={gatewayX}
              cy={H / 2}
              r={gatewayR}
              fill="url(#gatewayGrad)"
              stroke="rgba(51,173,255,0.55)"
              strokeWidth="1"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ filter: "drop-shadow(0 0 14px rgba(0,149,255,0.6))" }}
            />
            <motion.circle
              cx={gatewayX}
              cy={H / 2}
              r={gatewayR + 6}
              fill="none"
              stroke="rgba(51,173,255,0.25)"
              strokeWidth="0.5"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1, scale: [1, 1.15, 1] } : {}}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Per-tenant lanes */}
            {tenants.map((t, i) => {
              const y = rowY(i);
              const isHi = t.highlight;
              const keyMidX = keyX + keyW;
              const podMidX = podX;

              // Two-segment polyline from key → gateway → pod
              const path = `M ${keyMidX} ${y} L ${gatewayX - gatewayR} ${H / 2} M ${gatewayX + gatewayR} ${H / 2} L ${podMidX} ${y}`;

              return (
                <g key={t.id}>
                  {/* Routing lines */}
                  <motion.path
                    d={path}
                    fill="none"
                    stroke={isHi ? "url(#lineHi)" : "rgba(255,255,255,0.08)"}
                    strokeWidth={isHi ? 1.4 : 1}
                    strokeDasharray={isHi ? "0" : "3 3"}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={inView ? { pathLength: 1, opacity: 1 } : {}}
                    transition={{
                      duration: 0.8,
                      delay: 0.5 + i * 0.08,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />

                  {/* Packet (only on highlighted lane) */}
                  {isHi && inView && (
                    <>
                      <motion.circle
                        r="3"
                        fill="#33adff"
                        style={{ filter: "drop-shadow(0 0 6px rgba(51,173,255,0.95))" }}
                        animate={{
                          cx: [keyMidX, gatewayX, podMidX],
                          cy: [y, H / 2, y],
                        }}
                        transition={{
                          duration: 1.8,
                          repeat: Infinity,
                          ease: "easeInOut",
                          times: [0, 0.5, 1],
                        }}
                      />
                      <motion.circle
                        r="3"
                        fill="#33adff"
                        opacity="0.55"
                        style={{ filter: "drop-shadow(0 0 6px rgba(51,173,255,0.85))" }}
                        animate={{
                          cx: [keyMidX, gatewayX, podMidX],
                          cy: [y, H / 2, y],
                        }}
                        transition={{
                          duration: 1.8,
                          repeat: Infinity,
                          delay: 0.9,
                          ease: "easeInOut",
                          times: [0, 0.5, 1],
                        }}
                      />
                    </>
                  )}
                </g>
              );
            })}
          </svg>

          {/* HTML overlays for tenant chips + pod chips — easier to style than SVG <foreignObject> */}
          <div className="pointer-events-none absolute inset-0">
            {tenants.map((t, i) => {
              const y = rowY(i);
              const yPct = (y / H) * 100;
              const isHi = t.highlight;
              return (
                <div key={`html-${t.id}`}>
                  {/* API key chip — left */}
                  <div
                    className="absolute -translate-y-1/2"
                    style={{
                      left: `${(keyX / W) * 100}%`,
                      top: `${yPct}%`,
                      width: `${(keyW / W) * 100}%`,
                    }}
                  >
                    <div
                      className="flex items-center gap-2 border px-2.5 py-1.5 transition-colors"
                      style={
                        isHi
                          ? {
                              borderColor: "rgba(51,173,255,0.45)",
                              background: "rgba(0,149,255,0.06)",
                            }
                          : {
                              borderColor: "rgba(255,255,255,0.06)",
                              background: "#0a0a0a",
                            }
                      }
                    >
                      <span
                        className="block h-1 w-1 rounded-full"
                        style={{
                          background: isHi
                            ? "#33adff"
                            : "rgba(255,255,255,0.18)",
                          boxShadow: isHi
                            ? "0 0 6px rgba(51,173,255,0.7)"
                            : "none",
                        }}
                      />
                      <span
                        className="truncate font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.10em]"
                        style={{
                          color: isHi
                            ? "rgba(255,255,255,0.92)"
                            : "rgba(255,255,255,0.40)",
                        }}
                      >
                        {t.org}
                      </span>
                    </div>
                  </div>

                  {/* Pod chip — right */}
                  <div
                    className="absolute -translate-y-1/2"
                    style={{
                      left: `${(podX / W) * 100}%`,
                      top: `${yPct}%`,
                      width: `${(podW / W) * 100}%`,
                    }}
                  >
                    <div
                      className="flex items-center justify-between border px-2.5 py-1.5 transition-colors"
                      style={
                        isHi
                          ? {
                              borderColor: "rgba(51,173,255,0.45)",
                              background: "rgba(0,149,255,0.06)",
                              boxShadow:
                                "0 0 0 1px rgba(51,173,255,0.10), 0 6px 20px rgba(0,149,255,0.20)",
                            }
                          : {
                              borderColor: "rgba(255,255,255,0.06)",
                              background: "#0a0a0a",
                            }
                      }
                    >
                      <span
                        className="truncate font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] tracking-[0.10em]"
                        style={{
                          color: isHi
                            ? "rgba(255,255,255,0.92)"
                            : "rgba(255,255,255,0.40)",
                        }}
                      >
                        {t.model}
                      </span>
                      <StatusDot status={t.status} dim={!isHi} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Gateway label */}
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(gatewayX / W) * 100}%`,
                top: "50%",
              }}
            >
              <div className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[8px] uppercase tracking-[0.18em] text-white/60">
                <div className="mt-7 text-center">router</div>
              </div>
            </div>
          </div>
        </div>

        {/* Live metric strip for the highlighted lane */}
        <div className="grid grid-cols-4 border-t border-white/[0.06]">
          <Metric label="Tenant" value="your-org" />
          <Metric label="Uptime" value={uptime} />
          <Metric label="Requests" value={requests.toLocaleString()} />
          <Metric label="Spend" value={cost} accent="#4ade80" />
        </div>

        {/* Footer caption */}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-2.5 font-[var(--font-geist-mono),ui-monospace,monospace] text-[9.5px] uppercase tracking-[0.14em] text-white/30">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            Routed only on your API key
          </span>
          <span>$0.40/hr · H100 80GB</span>
        </div>
      </div>

      {/* Caption under card */}
      <p className="mt-4 text-center font-[var(--font-geist-mono),ui-monospace,monospace] text-[10px] uppercase tracking-[0.16em] text-white/30">
        Your traffic stays in your lane · neighbors never see your weights
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="border-r border-white/[0.04] px-4 py-3 last:border-r-0">
      <p className="font-[var(--font-geist-mono),ui-monospace,monospace] text-[8.5px] uppercase tracking-[0.16em] text-white/30">
        {label}
      </p>
      <p
        className="mt-1 font-[var(--font-geist-mono),ui-monospace,monospace] text-[12.5px] font-semibold tabular-nums"
        style={{ color: accent ?? "rgba(255,255,255,0.92)" }}
      >
        {value}
      </p>
    </div>
  );
}

function StatusDot({
  status,
  dim,
}: {
  status: "live" | "idle" | "warming";
  dim?: boolean;
}) {
  const color =
    status === "live"
      ? "#22c55e"
      : status === "warming"
        ? "#f59e0b"
        : "rgba(255,255,255,0.25)";
  return (
    <span
      className="block h-1.5 w-1.5 rounded-full"
      style={{
        background: dim ? color.replace(/[\d.]+\)$/, "0.35)") : color,
        boxShadow:
          !dim && status === "live"
            ? "0 0 5px rgba(34,197,94,0.6)"
            : undefined,
      }}
    />
  );
}
