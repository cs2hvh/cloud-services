"use client";

// Enterprise GPU clusters section — the "beyond on-demand" pitch.
// Sits between EverythingSection (what we offer) and the global
// network section. Targets buyers who need committed capacity:
// reserved pricing, multi-node NVLink, dedicated support.

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";

import { Container } from "@/components/ui/container";
import { NvidiaLogo } from "@/components/branding/nvidia-logo";

const BRAND = "#0095FF";

const CLUSTER_BENEFITS: Array<{ title: string; detail: string }> = [
    {
        title: "Multi-node NVLink fabric",
        detail: "8× SXM per node · 900 GB/s GPU-to-GPU bandwidth",
    },
    {
        title: "Reserved pricing",
        detail: "Up to 60% off on-demand · 1-mo to 3-yr terms",
    },
    {
        title: "Dedicated support",
        detail: "Private Slack · 24/7 priority routing · solutions architect",
    },
    {
        title: "Custom networking",
        detail: "Private interconnect · dedicated bandwidth · VPC peering",
    },
    {
        title: "Region pinning",
        detail: "Place your cluster where your data and users live",
    },
    {
        title: "99.99% uptime SLA",
        detail: "Failover, redundancy, credits if we miss",
    },
];

const SAMPLE_CONFIG: Array<{ label: string; value: string }> = [
    { label: "GPUs", value: "64× H200 SXM" },
    { label: "GPU memory", value: "9,024 GB HBM3e" },
    { label: "Interconnect", value: "NVLink + 3.2 Tbps" },
    { label: "vCPUs / node", value: "224 cores" },
    { label: "Networking", value: "400 Gbps RDMA" },
    { label: "Term", value: "6-month reserved" },
];

function ClusterConfigCard() {
    return (
        <div
            className="relative overflow-hidden border border-white/[0.10] bg-[#0a0d14]"
            style={{
                boxShadow:
                    "0 0 0 1px rgba(255,255,255,0.015), 0 30px 80px -25px rgba(0,149,255,0.30), 0 18px 40px -18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
        >
            {/* Scanning sweep on top edge */}
            <div
                aria-hidden="true"
                className="absolute -inset-x-px -top-px h-px overflow-hidden"
            >
                <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                    className="h-full w-[40%]"
                    style={{
                        background: `linear-gradient(90deg, transparent, ${BRAND}, transparent)`,
                    }}
                />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
                    Sample configuration
                </p>
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.20em] text-emerald-400/85">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    Ready to quote
                </span>
            </div>

            {/* Title row */}
            <div className="px-6 pt-5">
                <h3 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight text-white">
                    <NvidiaLogo width={20} height={14} className="opacity-95" />
                    H200 SXM · 8-node cluster
                </h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
                    Frankfurt · NVLink fabric · region-pinned
                </p>
            </div>

            {/* Config rows */}
            <ul className="mt-5 divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {SAMPLE_CONFIG.map((row) => (
                    <li
                        key={row.label}
                        className="flex items-baseline justify-between px-6 py-3"
                    >
                        <p className="text-[12.5px] text-white/55">{row.label}</p>
                        <p className="font-mono text-[12.5px] font-semibold tabular-nums text-white/90">
                            {row.value}
                        </p>
                    </li>
                ))}
            </ul>

            {/* Footer — price */}
            <div className="flex items-end justify-between px-6 py-5">
                <div>
                    <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.22em] text-white/35">
                        Reserved · /month
                    </p>
                    <p
                        className="mt-1 font-mono text-[26px] font-semibold tabular-nums leading-none"
                        style={{ color: BRAND }}
                    >
                        $182,400
                    </p>
                </div>
                <p className="text-right text-[11px] leading-snug text-white/45">
                    vs $304,000
                    <br />
                    on-demand
                </p>
            </div>
        </div>
    );
}

export function ClustersSection() {
    return (
        <section className="relative z-10 py-16 lg:py-24">
            {/* Background */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
            >
                <div className="absolute inset-0 bg-[#06080c]" />
                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(ellipse 65% 80% at 50% 50%, rgba(0,149,255,0.08) 0%, rgba(0,149,255,0.02) 35%, transparent 70%)",
                    }}
                />
                <div className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>

            <Container>
                <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
                    {/* LEFT — copy */}
                    <div>
                        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">
                            <span className="relative flex h-1.5 w-1.5">
                                <span
                                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                                    style={{ backgroundColor: BRAND }}
                                />
                                <span
                                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: BRAND }}
                                />
                            </span>
                            <span>Reserved & Clusters</span>
                            <span className="h-3 w-px bg-white/15" />
                            <span className="text-white/40">Enterprise</span>
                        </div>

                        <h2 className="mt-6 text-4xl font-semibold leading-[0.95] tracking-tight text-white sm:text-5xl lg:text-[56px]">
                            Need bigger?
                            <br />
                            <span className="text-white/65">
                                Reserve a cluster.
                            </span>
                        </h2>

                        <p className="mt-6 max-w-[560px] text-[15px] leading-[1.65] text-white/65 sm:text-[16px]">
                            Multi-node H100, H200, and B200 clusters with NVLink
                            fabric, dedicated capacity, and committed pricing.
                            From a single 8-GPU node to thousand-GPU training
                            runs — we handle the rest.
                        </p>

                        <ul className="mt-8 grid max-w-[620px] gap-x-6 gap-y-4 sm:grid-cols-2">
                            {CLUSTER_BENEFITS.map((b) => (
                                <li key={b.title} className="flex items-start gap-3">
                                    <span
                                        className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center border"
                                        style={{
                                            borderColor: `${BRAND}40`,
                                            backgroundColor: `${BRAND}15`,
                                        }}
                                    >
                                        <Check
                                            className="h-2.5 w-2.5"
                                            style={{ color: BRAND }}
                                        />
                                    </span>
                                    <div>
                                        <p className="text-[13px] font-semibold tracking-tight text-white">
                                            {b.title}
                                        </p>
                                        <p className="mt-0.5 text-[12px] leading-[1.55] text-white/50">
                                            {b.detail}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        <div className="mt-10 flex flex-wrap items-center gap-3">
                            <Link
                                href="/dashboard/services/gpu/enterprise"
                                className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-none border border-[#0095FF] bg-[#0095FF] px-6 text-[13.5px] font-semibold text-white shadow-[0_18px_46px_-18px_rgba(0,149,255,0.8)] transition-colors hover:bg-[#0aa0ff]"
                            >
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/18 to-transparent"
                                />
                                <span className="relative">Talk to sales</span>
                                <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                            <Link
                                href="/pricing"
                                className="group inline-flex h-12 items-center gap-2 rounded-none border border-white/16 bg-white/[0.04] px-5 text-[13.5px] font-medium text-white/80 backdrop-blur transition-colors hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
                            >
                                See reserved pricing
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                        </div>

                        <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/30">
                            Typical response · &lt; 4 business hours
                        </p>
                    </div>

                    {/* RIGHT — config card preview */}
                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="relative mx-auto w-full max-w-[520px]"
                    >
                        <ClusterConfigCard />
                    </motion.div>
                </div>
            </Container>
        </section>
    );
}
