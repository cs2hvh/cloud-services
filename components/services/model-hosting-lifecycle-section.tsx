"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Activity, MoonStar, Snowflake, TrendingUp, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";

// ─── Synthetic-but-plausible traffic + worker curve ────────────────
// 60 points across the chart; QPS rises and falls with realistic
// noise; worker count steps up/down behind it. Annotations mark
// the four lifecycle moments: cold start, scale-up, sustained,
// scale-to-zero.
const POINTS = 60;
const qps: number[] = [];
const workers: number[] = [];
for (let i = 0; i < POINTS; i++) {
  // QPS: ramp 0→peak around mid then taper to 0 with mild noise
  const phase = i / POINTS;
  const base =
    phase < 0.15
      ? phase * 30
      : phase < 0.45
        ? 30 + (phase - 0.15) * 120
        : phase < 0.7
          ? 66 - (phase - 0.45) * 40
          : phase < 0.88
            ? 56 - (phase - 0.7) * 200
            : Math.max(0, 20 - (phase - 0.88) * 180);
  qps.push(Math.max(0, base + (Math.sin(i * 0.7) + 0.5) * 4));
}
// Workers: 0 until first traffic, ramps in chunks of 1, drops back to 0.
let w = 0;
for (let i = 0; i < POINTS; i++) {
  const target = Math.min(4, Math.ceil(qps[i]! / 20));
  if (target > w) w = target;
  else if (target < w && qps[i]! < 5 && i > 50) w = 0;
  workers.push(w);
}

const QPS_MAX = Math.max(...qps);
const W_MAX = 4;

const EVENTS: { at: number; label: string; icon: LucideIcon; color: string }[] = [
  { at: 6,  label: "Cold start · ~900ms", icon: Snowflake, color: "#33adff" },
  { at: 22, label: "Burst-scale to 4 workers", icon: TrendingUp, color: "#22c55e" },
  { at: 48, label: "Idle window starts", icon: Activity, color: "#f59e0b" },
  { at: 55, label: "Scale-to-zero", icon: MoonStar, color: "#a855f7" },
];

export default function ModelHostingLifecycleSection() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

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

  // Geometry
  const W = 800;
  const H = 220;
  const padL = 36;
  const padR = 36;
  const padT = 20;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xAt = (i: number) => padL + (i / (POINTS - 1)) * innerW;
  const yQps = (v: number) => padT + innerH - (v / QPS_MAX) * innerH;
  const yWorker = (v: number) => padT + innerH - (v / W_MAX) * innerH;

  // Build QPS path
  const qpsPath = qps
    .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yQps(v).toFixed(1)}`)
    .join(" ");
  const qpsArea =
    qpsPath +
    ` L ${xAt(POINTS - 1)} ${padT + innerH} L ${xAt(0)} ${padT + innerH} Z`;

  // Build worker step path
  const workerPath = workers
    .map((v, i) => {
      const x = xAt(i);
      const y = yWorker(v);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden bg-[#0E0F0F] py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 30%, rgba(0,149,255,0.25), transparent 70%)",
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
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Autoscale lifecycle
          </p>
          <h2 className="mt-4 text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
            Workers appear with traffic.{" "}
            <span className="text-[#8ecaff]">Disappear without it.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-white/55 sm:text-[16px]">
            Scale-to-zero by default. Min &gt; 0 if you need always-warm. Idle GPU minutes never hit your invoice.
          </p>
        </div>

        {/* ─── Chart ─── */}
        <div className="mt-14 overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#0b0d12] p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/55">
              <Activity className="h-3.5 w-3.5 text-[#33adff]" />
              traffic · workers · 60s window
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              <Legend color="#33adff" label="QPS" filled />
              <Legend color="#a855f7" label="Workers" dashed />
            </div>
          </div>

          {/* SVG */}
          <div className="mt-5 -mx-1 overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-[260px] w-full min-w-[560px]"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="qpsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#33adff" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#0095FF" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grid */}
              {[0.25, 0.5, 0.75].map((g) => (
                <line
                  key={g}
                  x1={padL}
                  x2={W - padR}
                  y1={padT + innerH * g}
                  y2={padT + innerH * g}
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray="3 4"
                />
              ))}

              {/* QPS area */}
              <motion.path
                d={qpsArea}
                fill="url(#qpsFill)"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ duration: 0.8, delay: 0.5 }}
              />
              {/* QPS line */}
              <motion.path
                d={qpsPath}
                fill="none"
                stroke="#33adff"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={inView ? { pathLength: 1 } : {}}
                transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ filter: "drop-shadow(0 0 4px rgba(0,149,255,0.55))" }}
              />

              {/* Workers step line */}
              <motion.path
                d={workerPath}
                fill="none"
                stroke="#a855f7"
                strokeWidth="1.4"
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={inView ? { pathLength: 1 } : {}}
                transition={{ duration: 1.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{ filter: "drop-shadow(0 0 3px rgba(168,85,247,0.50))" }}
              />

              {/* Event annotations */}
              {EVENTS.map((e, idx) => {
                const x = xAt(e.at);
                const yTop = padT + 4;
                return (
                  <motion.g
                    key={e.label}
                    initial={{ opacity: 0, y: -4 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.45, delay: 1.2 + idx * 0.15 }}
                  >
                    <line
                      x1={x}
                      x2={x}
                      y1={yTop}
                      y2={padT + innerH}
                      stroke={e.color}
                      strokeOpacity="0.32"
                      strokeDasharray="2 3"
                    />
                    <circle
                      cx={x}
                      cy={yQps(qps[e.at]!)}
                      r="3.5"
                      fill={e.color}
                      style={{ filter: `drop-shadow(0 0 4px ${e.color})` }}
                    />
                  </motion.g>
                );
              })}

              {/* Y-axis labels */}
              <text
                x={padL - 8}
                y={padT + 6}
                textAnchor="end"
                className="fill-white/30"
                style={{ fontFamily: "monospace", fontSize: 9 }}
              >
                {Math.round(QPS_MAX)} QPS
              </text>
              <text
                x={padL - 8}
                y={padT + innerH + 4}
                textAnchor="end"
                className="fill-white/30"
                style={{ fontFamily: "monospace", fontSize: 9 }}
              >
                0
              </text>
              <text
                x={W - padR + 8}
                y={padT + 6}
                textAnchor="start"
                className="fill-violet-300/60"
                style={{ fontFamily: "monospace", fontSize: 9 }}
              >
                {W_MAX} workers
              </text>
            </svg>
          </div>

          {/* Event captions */}
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {EVENTS.map((e, i) => {
              const Icon = e.icon;
              return (
                <motion.div
                  key={e.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.45, delay: 1.4 + i * 0.12 }}
                  className="flex items-start gap-2.5 rounded-[6px] border border-white/[0.06] bg-white/[0.015] px-3 py-2.5"
                >
                  <Icon
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    style={{ color: e.color }}
                    strokeWidth={1.75}
                  />
                  <div>
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">
                      t = {e.at}s
                    </p>
                    <p className="mt-0.5 text-[11.5px] font-medium text-white/85">
                      {e.label}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Footer signal */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 1.8 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/40"
        >
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-white/40" />
            Cold start &lt;1s for warm images
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MoonStar className="h-3.5 w-3.5 text-white/40" />
            Zero spend at zero traffic
          </span>
        </motion.div>
      </Container>
    </section>
  );
}

function Legend({
  color,
  label,
  filled,
  dashed,
}: {
  color: string;
  label: string;
  filled?: boolean;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
      <svg width="22" height="6" viewBox="0 0 22 6">
        {filled && (
          <rect
            x="0"
            y="2"
            width="22"
            height="3"
            fill={color}
            opacity="0.45"
            rx="1"
          />
        )}
        <line
          x1="0"
          x2="22"
          y1="3"
          y2="3"
          stroke={color}
          strokeWidth="1.6"
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      </svg>
      <span style={{ color }}>{label}</span>
    </span>
  );
}
