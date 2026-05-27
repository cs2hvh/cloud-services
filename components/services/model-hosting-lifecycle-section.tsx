"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  MoonStar,
  Snowflake,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";

// ─── Synthetic traffic + worker data ────────────────────────────────
const POINTS = 60;
const qps: number[] = [];
const workers: number[] = [];

for (let i = 0; i < POINTS; i++) {
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

let w = 0;
for (let i = 0; i < POINTS; i++) {
  const target = Math.min(4, Math.ceil(qps[i]! / 20));
  if (target > w) w = target;
  else if (target < w && qps[i]! < 5 && i > 50) w = 0;
  workers.push(w);
}

const QPS_MAX = Math.max(...qps);
const W_MAX = 4;

type Event = {
  at: number;
  label: string;
  detail: string;
  icon: LucideIcon;
  color: string;
};

const EVENTS: Event[] = [
  {
    at: 6,
    label: "Cold start",
    detail: "First request triggers worker warm-up — image cached, ~900ms to first response.",
    icon: Snowflake,
    color: "#33adff",
  },
  {
    at: 22,
    label: "Burst scale",
    detail: "Traffic ramp triggers scale to 4 workers in seconds. No manual intervention.",
    icon: TrendingUp,
    color: "#22c55e",
  },
  {
    at: 48,
    label: "Idle detected",
    detail: "Traffic drops below threshold. Idle timer starts counting toward configured window.",
    icon: Activity,
    color: "#f59e0b",
  },
  {
    at: 55,
    label: "Scale to zero",
    detail: "All workers released. Zero spend at zero traffic. Next request cold-starts again.",
    icon: MoonStar,
    color: "#a855f7",
  },
];

export default function ModelHostingLifecycleSection() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [activeEvent, setActiveEvent] = useState<number | null>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 80%", "start 20%"],
  });

  const headerY = useTransform(scrollYProgress, [0, 1], [30, 0]);
  const headerOpacity = useTransform(scrollYProgress, [0, 0.4], [0, 1]);

  useEffect(() => {
    if (!sectionRef.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold: 0.2 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [inView]);

  // Chart geometry
  const chartW = 800;
  const chartH = 200;
  const padL = 0;
  const padR = 0;
  const padT = 16;
  const padB = 24;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const xAt = (i: number) => padL + (i / (POINTS - 1)) * innerW;
  const yQps = (v: number) => padT + innerH - (v / QPS_MAX) * innerH;
  const yWorker = (v: number) => padT + innerH - (v / W_MAX) * innerH;

  const qpsPath = qps
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yQps(v).toFixed(1)}`
    )
    .join(" ");
  const qpsArea =
    qpsPath +
    ` L ${xAt(POINTS - 1)} ${padT + innerH} L ${xAt(0)} ${padT + innerH} Z`;

  const workerPath = workers
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yWorker(v).toFixed(1)}`
    )
    .join(" ");

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-clip bg-[#0E0F0F] py-28 sm:py-36"
    >
      {/* Atmospheric backdrop */}
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
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 80%)",
        }}
      />

      <Container className="relative z-10">
        {/* Header */}
        <motion.div
          style={{ y: headerY, opacity: headerOpacity }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
            <span
              aria-hidden
              className="block h-1.5 w-1.5 rounded-full bg-[#33adff]"
              style={{ boxShadow: "0 0 8px rgba(0,149,255,0.7)" }}
            />
            Autoscale lifecycle
          </div>
          <h2 className="mt-6 text-3xl font-[400] leading-[1.04] tracking-tight text-white sm:text-4xl lg:text-[3.6rem]">
            Workers appear with traffic.{" "}
            <span className="text-[#8ecaff]">Disappear without it.</span>
          </h2>
          <p className="mt-6 text-[15px] leading-7 text-white/55 sm:text-[16.5px]">
            Scale-to-zero by default. Min &gt; 0 if you need always-warm. Idle GPU minutes never hit your invoice.
          </p>
        </motion.div>

        {/* ─── Chart + events ─── */}
        <div className="mt-16 lg:mt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b0d12] shadow-[0_28px_72px_rgba(0,0,0,0.5)]"
          >
            {/* Top accent */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(51,173,255,0.85), transparent)",
                boxShadow: "0 0 16px rgba(0,149,255,0.55)",
              }}
            />

            {/* Chart header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4 sm:px-8">
              <div className="flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#33adff] opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#33adff]" />
                </span>
                traffic · workers · 60s window
              </div>
              <div className="hidden items-center gap-5 sm:flex">
                <LegendDot color="#33adff" label="QPS" filled />
                <LegendDot color="#a855f7" label="Workers" dashed />
              </div>
            </div>

            {/* SVG chart */}
            <div className="px-6 py-6 sm:px-8">
              <div className="overflow-x-auto">
                <svg
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="h-[240px] w-full min-w-[560px]"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="qpsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#33adff"
                        stopOpacity="0.35"
                      />
                      <stop
                        offset="100%"
                        stopColor="#0095FF"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>

                  {/* Grid lines */}
                  {[0.25, 0.5, 0.75].map((g) => (
                    <line
                      key={g}
                      x1={padL}
                      x2={chartW - padR}
                      y1={padT + innerH * g}
                      y2={padT + innerH * g}
                      stroke="rgba(255,255,255,0.04)"
                      strokeDasharray="3 4"
                    />
                  ))}

                  {/* QPS area + line */}
                  <motion.path
                    d={qpsArea}
                    fill="url(#qpsGrad)"
                    initial={{ opacity: 0 }}
                    animate={inView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.8, delay: 0.5 }}
                  />
                  <motion.path
                    d={qpsPath}
                    fill="none"
                    stroke="#33adff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={inView ? { pathLength: 1 } : {}}
                    transition={{
                      duration: 1.8,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    style={{
                      filter: "drop-shadow(0 0 5px rgba(0,149,255,0.55))",
                    }}
                  />

                  {/* Workers step line */}
                  <motion.path
                    d={workerPath}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="1.5"
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={inView ? { pathLength: 1 } : {}}
                    transition={{
                      duration: 1.8,
                      delay: 0.4,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    style={{
                      filter: "drop-shadow(0 0 3px rgba(168,85,247,0.50))",
                    }}
                  />

                  {/* Event markers */}
                  {EVENTS.map((e, idx) => {
                    const x = xAt(e.at);
                    const y = yQps(qps[e.at]!);
                    const isHovered = activeEvent === idx;
                    return (
                      <motion.g
                        key={e.label}
                        initial={{ opacity: 0 }}
                        animate={inView ? { opacity: 1 } : {}}
                        transition={{
                          duration: 0.45,
                          delay: 1.4 + idx * 0.12,
                        }}
                        onMouseEnter={() => setActiveEvent(idx)}
                        onMouseLeave={() => setActiveEvent(null)}
                        className="cursor-pointer"
                      >
                        <line
                          x1={x}
                          x2={x}
                          y1={padT}
                          y2={padT + innerH}
                          stroke={e.color}
                          strokeOpacity={isHovered ? 0.5 : 0.2}
                          strokeDasharray="2 3"
                        />
                        {/* Outer pulse */}
                        <circle
                          cx={x}
                          cy={y}
                          r={isHovered ? 12 : 8}
                          fill={e.color}
                          opacity={0.08}
                          style={{
                            transition: "r 0.3s, opacity 0.3s",
                          }}
                        />
                        <circle
                          cx={x}
                          cy={y}
                          r="4"
                          fill={e.color}
                          style={{
                            filter: `drop-shadow(0 0 5px ${e.color})`,
                          }}
                        />
                      </motion.g>
                    );
                  })}
                </svg>
              </div>

              {/* Y-axis labels */}
              <div className="mt-2 flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/30">
                <span>0s</span>
                <span>30s</span>
                <span>60s</span>
              </div>
            </div>

            {/* Event detail strip */}
            <div className="grid border-t border-white/[0.06] sm:grid-cols-4">
              {EVENTS.map((e, idx) => {
                const EventIcon = e.icon;
                const isHovered = activeEvent === idx;
                return (
                  <div
                    key={e.label}
                    className="relative border-b border-white/[0.04] px-5 py-4 transition-colors duration-300 sm:border-b-0 sm:border-r sm:last:border-r-0"
                    style={{
                      background: isHovered
                        ? `${e.color}06`
                        : "transparent",
                    }}
                    onMouseEnter={() => setActiveEvent(idx)}
                    onMouseLeave={() => setActiveEvent(null)}
                  >
                    {/* Top accent on hover */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-0 h-[2px] transition-opacity duration-300"
                      style={{
                        opacity: isHovered ? 0.8 : 0,
                        background: `linear-gradient(90deg, transparent, ${e.color}cc, transparent)`,
                        boxShadow: `0 0 10px ${e.color}44`,
                      }}
                    />

                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-[6px] border transition-all duration-300"
                        style={{
                          borderColor: isHovered
                            ? `${e.color}55`
                            : "rgba(255,255,255,0.08)",
                          background: isHovered
                            ? `${e.color}18`
                            : "rgba(255,255,255,0.02)",
                          boxShadow: isHovered
                            ? `0 4px 12px ${e.color}22`
                            : "none",
                        }}
                      >
                        <EventIcon
                          className="h-3.5 w-3.5 transition-colors duration-300"
                          strokeWidth={1.75}
                          style={{
                            color: isHovered
                              ? e.color
                              : "rgba(255,255,255,0.45)",
                          }}
                        />
                      </div>
                      <div>
                        <p className="font-mono text-[9px] tabular-nums uppercase tracking-[0.16em] text-white/35">
                          t = {e.at}s
                        </p>
                        <p
                          className="text-[12px] font-medium transition-colors duration-300"
                          style={{
                            color: isHovered
                              ? "rgba(255,255,255,0.95)"
                              : "rgba(255,255,255,0.75)",
                          }}
                        >
                          {e.label}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2.5 text-[11.5px] leading-relaxed text-white/45">
                      {e.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Footer signal */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/40"
        >
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-white/35" />
            Cold start &lt;1s for warm images
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MoonStar className="h-3.5 w-3.5 text-white/35" />
            Zero spend at zero traffic
          </span>
        </motion.div>
      </Container>
    </section>
  );
}

function LegendDot({
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
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">
      <svg width="18" height="6" viewBox="0 0 18 6">
        {filled && (
          <rect
            x="0"
            y="2"
            width="18"
            height="3"
            fill={color}
            opacity="0.35"
            rx="1"
          />
        )}
        <line
          x1="0"
          x2="18"
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
