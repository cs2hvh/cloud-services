"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Container } from "@/components/ui/container";
import {
  Clock,
  ShieldCheck,
  TrendingUp,
  Wrench,
  DollarSign,
  Users,
} from "lucide-react";

const REASONS = [
  {
    icon: Clock,
    title: "Zero Maintenance Overhead",
    desc: "No more 3 AM pager alerts. We handle OS patching, engine upgrades, security fixes, and configuration tuning automatically.",
    stat: "300+",
    statLabel: "hours saved / year",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise-Grade Security",
    desc: "AES-256 encryption at rest, TLS 1.3 in transit, VPC peering, IP allowlists, and SOC 2 compliance built into every cluster.",
    stat: "SOC 2",
    statLabel: "certified",
  },
  {
    icon: TrendingUp,
    title: "Scale Without Re-Architecture",
    desc: "Add read replicas, scale storage, and upgrade compute independently. Go from prototype to millions of queries with zero code changes.",
    stat: "100x",
    statLabel: "scale range",
  },
  {
    icon: Wrench,
    title: "Automated Backups & Recovery",
    desc: "Daily snapshots with configurable retention. Point-in-time recovery lets you restore to any second within your retention window.",
    stat: "30 day",
    statLabel: "PITR window",
  },
  {
    icon: DollarSign,
    title: "Predictable Costs",
    desc: "No hidden fees for backups, monitoring, or failover. Pay per node with transparent pricing. Save 20% with annual billing.",
    stat: "40%",
    statLabel: "lower TCO",
  },
  {
    icon: Users,
    title: "Expert Support Included",
    desc: "Database engineers available around the clock. Get help with query optimization, schema design, and migration planning.",
    stat: "24/7",
    statLabel: "DBA support",
  },
];

const COMPARISON = [
  { task: "Provisioning", self: "Hours–Days", managed: "< 60 seconds" },
  { task: "OS & Engine Patching", self: "Manual, scheduled downtime", managed: "Automatic, zero-downtime" },
  { task: "Backups", self: "Custom scripts, cron jobs", managed: "Automatic daily + PITR" },
  { task: "High Availability", self: "Complex setup, manual failover", managed: "Built-in, automatic failover" },
  { task: "Monitoring", self: "Grafana/Prometheus setup", managed: "Included dashboards & alerts" },
  { task: "Scaling", self: "Downtime + re-provisioning", managed: "One-click, minimal disruption" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export default function DatabaseWhyManagedSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const bgY = useTransform(scrollYProgress, [0, 1], [0, -100]);

  return (
    <section
      ref={sectionRef}
      className="relative w-full bg-black py-16 lg:py-24 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <motion.div
          className="absolute top-[-100px] right-[-200px] w-[800px] h-[800px] rounded-full bg-[#0095FF]/[0.025] blur-[160px]"
          style={{ y: bgY }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      <Container>
        {/* Header */}
        <motion.div
          className="text-center mb-14 lg:mb-18"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 mb-6">
            <span className="text-[11px] font-medium text-white/60 uppercase tracking-wider">
              Why Managed?
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-[1.1] text-white">
            Stop Managing Infrastructure.{" "}
            <span className="text-[#0095FF]">Start Building.</span>
          </h2>
          <p className="mt-4 text-sm lg:text-base leading-[1.7] text-white/50 max-w-2xl mx-auto">
            Self-hosting databases costs more than you think. Between patching, backups,
            monitoring, and on-call rotations, your team spends hundreds of hours on
            undifferentiated work.
          </p>
        </motion.div>

        {/* Reasons grid */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 mb-20"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          transition={{ staggerChildren: 0.08 }}
        >
          {REASONS.map((reason) => (
            <motion.div
              key={reason.title}
              variants={fadeUp}
              className="group relative p-6 lg:p-8 border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.03] transition-colors duration-300"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-lg bg-[#0095FF]/[0.08] border border-[#0095FF]/[0.15] flex items-center justify-center mb-5">
                <reason.icon className="w-5 h-5 text-[#0095FF]" />
              </div>

              {/* Stat */}
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="text-[22px] font-[600] text-white tabular-nums leading-none">
                  {reason.stat}
                </span>
                <span className="text-[10px] text-white/25 uppercase tracking-wider">
                  {reason.statLabel}
                </span>
              </div>

              {/* Title + desc */}
              <h4 className="text-[15px] font-[500] text-white/85 mb-2">
                {reason.title}
              </h4>
              <p className="text-[13px] text-white/35 leading-[1.7]">
                {reason.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Self-hosted vs Managed comparison */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          transition={{ staggerChildren: 0.06 }}
        >
          <motion.p
            variants={fadeUp}
            className="text-[11px] font-medium text-white/30 uppercase tracking-widest mb-8 text-center"
          >
            Self-Hosted vs Managed
          </motion.p>

          <motion.div variants={fadeUp} className="border border-white/[0.06]">
            {/* Table header */}
            <div className="grid grid-cols-3 bg-white/[0.03]">
              <div className="p-4 text-[11px] font-medium text-white/30 uppercase tracking-wider border-r border-white/[0.06]">
                Task
              </div>
              <div className="p-4 text-[11px] font-medium text-white/30 uppercase tracking-wider text-center border-r border-white/[0.06]">
                Self-Hosted
              </div>
              <div className="p-4 text-[11px] font-medium text-[#0095FF]/60 uppercase tracking-wider text-center">
                AhuraSense Managed
              </div>
            </div>

            {/* Rows */}
            {COMPARISON.map((row, i) => (
              <div
                key={row.task}
                className={`grid grid-cols-3 border-t border-white/[0.06] ${i % 2 !== 0 ? "bg-white/[0.015]" : ""}`}
              >
                <div className="p-4 text-[13px] text-white/60 border-r border-white/[0.06]">
                  {row.task}
                </div>
                <div className="p-4 text-[12px] text-white/30 text-center border-r border-white/[0.06]">
                  {row.self}
                </div>
                <div className="p-4 text-[12px] text-[#0095FF]/70 text-center font-medium">
                  {row.managed}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}
