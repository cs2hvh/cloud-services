"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Container } from "@/components/ui/container";
import { Activity, Cpu, HardDrive, Wifi } from "lucide-react";

/* ─── Fake sparkline SVG paths for each metric ─── */

const METRICS = [
  {
    icon: Cpu,
    label: "CPU Usage",
    value: "23%",
    trend: "+2.1%",
    trendUp: true,
    color: "#0095FF",
    sparkline:
      "M0 30 L10 28 L20 32 L30 25 L40 27 L50 20 L60 22 L70 18 L80 24 L90 19 L100 23",
  },
  {
    icon: Activity,
    label: "Memory",
    value: "4.2 GB",
    trend: "of 8 GB",
    trendUp: false,
    color: "#47A248",
    sparkline:
      "M0 25 L10 26 L20 24 L30 28 L40 30 L50 27 L60 29 L70 31 L80 28 L90 30 L100 29",
  },
  {
    icon: HardDrive,
    label: "Disk I/O",
    value: "1.8 GB/s",
    trend: "Read + Write",
    trendUp: false,
    color: "#FFCC00",
    sparkline:
      "M0 35 L10 30 L20 33 L30 25 L40 28 L50 20 L60 15 L70 22 L80 18 L90 12 L100 16",
  },
  {
    icon: Wifi,
    label: "Network",
    value: "342 MB/s",
    trend: "+12%",
    trendUp: true,
    color: "#DC382D",
    sparkline:
      "M0 28 L10 32 L20 26 L30 30 L40 24 L50 28 L60 22 L70 26 L80 20 L90 24 L100 18",
  },
];

const ALERTS = [
  {
    type: "info" as const,
    time: "2 min ago",
    message: "Read replica lag < 50ms — within threshold",
  },
  {
    type: "success" as const,
    time: "14 min ago",
    message: "Automated backup completed — 2.4 GB snapshot stored",
  },
  {
    type: "warning" as const,
    time: "1 hr ago",
    message: "Connection pool at 78% — consider scaling up",
  },
  {
    type: "success" as const,
    time: "3 hr ago",
    message: "Auto-scaling triggered — storage expanded to 120 GB",
  },
];

const dotColors = {
  info: "bg-[#0095FF]",
  success: "bg-[#47A248]",
  warning: "bg-[#FFCC00]",
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export default function DatabaseMetricsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const bgY = useTransform(scrollYProgress, [0, 1], [40, -80]);
  const bgY2 = useTransform(scrollYProgress, [0, 1], [0, -60]);

  return (
    <section
      ref={sectionRef}
      className="relative w-full py-16 lg:py-24 overflow-hidden bg-gradient-to-b from-black via-[#080a10] to-black"
    >
      {/* Background */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <motion.div
          className="absolute top-[10%] left-[-200px] w-[800px] h-[800px] rounded-full bg-[#0095FF]/[0.05] blur-[160px]"
          style={{ y: bgY }}
        />
        <motion.div
          className="absolute bottom-[10%] right-[-150px] w-[600px] h-[600px] rounded-full bg-[#47A248]/[0.03] blur-[140px]"
          style={{ y: bgY2 }}
        />
        {/* Diagonal lines for texture */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, white 0px, white 1px, transparent 1px, transparent 60px)",
          }}
        />
      </div>

      <Container>
        {/* Header */}
        <motion.div
          className="text-center mb-12 lg:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-[1.1] text-white">
            Real-Time{" "}
            <span className="text-[#0095FF]">Observability</span>
          </h2>
          <p className="mt-4 text-sm lg:text-base leading-[1.7] text-white/65 max-w-2xl mx-auto">
            Monitor every aspect of your databases with built-in dashboards,
            alerts, and query performance insights. No third-party tools required.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Metrics cards — left 3 cols */}
          <motion.div
            className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            transition={{ staggerChildren: 0.08 }}
          >
            {METRICS.map((metric) => (
              <motion.div
                key={metric.label}
                variants={fadeUp}
                className="group relative p-5 rounded-lg bg-gradient-to-br from-white/[0.04] to-white/[0.01] hover:from-white/[0.06] hover:to-white/[0.02] transition-all duration-300 overflow-hidden"
              >
                {/* Sparkline bg */}
                <svg
                  viewBox="0 0 100 40"
                  className="absolute bottom-0 left-0 right-0 w-full h-[60%] opacity-[0.08] group-hover:opacity-[0.14] transition-opacity duration-300"
                  preserveAspectRatio="none"
                >
                  <path
                    d={metric.sparkline}
                    fill="none"
                    stroke={metric.color}
                    strokeWidth="1.5"
                  />
                  <path
                    d={`${metric.sparkline} L100 40 L0 40 Z`}
                    fill={metric.color}
                    opacity="0.3"
                  />
                </svg>

                {/* Left accent bar */}
                <div
                  className="absolute top-3 bottom-3 left-0 w-[2px] rounded-full opacity-40"
                  style={{ backgroundColor: metric.color }}
                />

                {/* Content */}
                <div className="relative z-10 pl-3">
                  <div className="flex items-center gap-2 mb-3">
                    <metric.icon
                      className="w-4 h-4"
                      style={{ color: metric.color }}
                    />
                    <span className="text-[12px] text-white/55 uppercase tracking-wider font-medium">
                      {metric.label}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-[26px] font-[600] text-white tabular-nums leading-none">
                      {metric.value}
                    </span>
                    <span
                      className={`text-[12px] tabular-nums ${metric.trendUp ? "text-[#0095FF]/80" : "text-white/40"}`}
                    >
                      {metric.trend}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Activity feed — right 2 cols */}
          <motion.div
            className="lg:col-span-2 rounded-lg bg-gradient-to-b from-white/[0.04] to-white/[0.015] p-5"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#47A248] animate-pulse" />
              <span className="text-[12px] font-medium text-white/55 uppercase tracking-wider">
                Activity Log
              </span>
            </div>

            <div className="space-y-3">
              {ALERTS.map((alert, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-md bg-white/[0.03]"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dotColors[alert.type]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-white/65 leading-[1.5]">
                      {alert.message}
                    </p>
                    <span className="text-[10px] text-white/35 mt-1 block">
                      {alert.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Bottom stats row */}
        <motion.div
          className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {[
            { label: "Queries / Second", value: "48.2K", color: "#0095FF" },
            { label: "Avg Latency", value: "1.2 ms", color: "#47A248" },
            { label: "Active Connections", value: "847", color: "#FFCC00" },
            { label: "Cache Hit Rate", value: "99.4%", color: "#DC382D" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="relative rounded-lg bg-gradient-to-br from-white/[0.04] to-transparent p-5 text-center overflow-hidden"
            >
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[60px] rounded-full blur-[40px] opacity-[0.06]"
                style={{ backgroundColor: stat.color }}
              />
              <span className="relative block text-[22px] lg:text-[26px] font-[600] text-white tabular-nums leading-none">
                {stat.value}
              </span>
              <span className="relative block text-[11px] text-white/45 uppercase tracking-wider mt-2">
                {stat.label}
              </span>
            </div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}
