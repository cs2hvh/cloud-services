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

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const CLUSTER_BENEFITS: Array<{ title: string; detail: string }> = [
    {
        title: "Multi-node NVLink fabric",
        detail: "8× SXM per node · 900 GB/s GPU-to-GPU bandwidth",
    },
    {
        title: "Reserved pricing",
        detail: "Up to 60% off on-demand · 1-mo to 3-yr commitment",
    },
    {
        title: "Dedicated support",
        detail: "Priority access, 24/7 coverage, and SLA-backed reliability",
    },
    {
        title: "Rapid provisioning",
        detail: "Clusters ready in hours, not days",
    },
    {
        title: "Custom networking",
        detail: "Tailored VPC, routing, and isolation to fit your architecture",
    },
    {
        title: "99.99% uptime SLA",
        detail: "Enterprise-grade reliability you can build on",
    },
];

const SAMPLE_CONFIG: Array<{ label: string; value: React.ReactNode }> = [
    {
        label: "GPUs",
        value: (
            <span className="inline-flex items-center gap-1.5">
                64×
                <NvidiaLogo width={14} height={10} className="opacity-95" />
                H200
            </span>
        ),
    },
    { label: "GPU memory", value: "8 TB (141 GB / GPU)" },
    { label: "Interconnect", value: "NVLink Switch System" },
    { label: "vCPUs / node", value: "96 vCPUs" },
    { label: "Networking", value: "400 Gbps · RDMA" },
    { label: "Term", value: "12-month reserved" },
];

const CLIP_NOTCH = "polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)";

function ClusterConfigCard() {
    return (
        <div className="relative">
            <div
                className="relative bg-black"
                style={{
                    clipPath: CLIP_NOTCH,
                }}
            >
                {/* Border layer (drawn behind via padding trick) */}
                <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-white/[0.10]"
                    style={{ clipPath: CLIP_NOTCH }}
                />
                <div
                    className="relative bg-black m-px"
                    style={{ clipPath: CLIP_NOTCH }}
                >
                    <div className="px-6 py-6 sm:px-8 sm:py-7">
                        {/* Header */}
                        <div className="flex items-center justify-between gap-3">
                            <p className={`${MONO} text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/45`}>
                                Cluster configuration
                            </p>
                            <Link
                                href="/dashboard/services/gpu/enterprise"
                                className={`${MONO} text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/65 hover:text-white transition-colors`}
                            >
                                Review &amp; request
                            </Link>
                        </div>

                        {/* Title */}
                        <div className="mt-7">
                            <h3 className="flex items-center gap-2.5 text-[26px] font-semibold tracking-[-0.02em] text-white leading-tight">
                                <NvidiaLogo width={22} height={16} className="opacity-95" />
                                H200 SXM · 8-node cluster
                            </h3>
                            <p className={`${MONO} mt-2 text-[10.5px] uppercase tracking-[0.18em] text-white/40`}>
                                NVLink fabric · Redundant power · PCIe 5.0
                            </p>
                        </div>

                        {/* Config rows in bordered inner box */}
                        <div className="mt-6 border border-white/[0.08] rounded-[2px]">
                            <ul className="divide-y divide-white/[0.06]">
                                {SAMPLE_CONFIG.map((row) => (
                                    <li
                                        key={row.label}
                                        className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                                    >
                                        <p className={`${MONO} text-[10.5px] uppercase tracking-[0.16em] text-white/45`}>
                                            {row.label}
                                        </p>
                                        <div className="text-[13px] font-medium tabular-nums text-white/95 text-right">
                                            {row.value}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Footer trust line */}
                        <div className="mt-7 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.22em] text-white/45">
                            <span className={MONO}>Secure</span>
                            <span className="text-white/15">·</span>
                            <span className={MONO}>Private</span>
                            <span className="text-white/15">·</span>
                            <span className={MONO}>Enterprise ready</span>
                        </div>
                    </div>
                </div>
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
                <div className="absolute inset-0 bg-black" />
                <div className="absolute top-0 left-1/2 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>

            <Container>
                <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
                    {/* LEFT — copy */}
                    <div>
                        <h2 className="text-5xl font-semibold leading-[0.95] tracking-[-0.025em] text-white sm:text-6xl lg:text-[64px]">
                            Need bigger?
                            <br />
                            <span className="text-white/55">Reserve a </span>
                            <span style={{ color: BRAND }}>cluster</span>
                            <span className="text-white/85">.</span>
                        </h2>

                        <p className="mt-6 max-w-[560px] text-[15px] leading-[1.65] text-white/65 sm:text-[16px]">
                            Multi-node H100, H200, and B200 clusters with NVIDIA NVLink
                            fabric, dedicated capacity, and committed pricing. From a
                            single 8-GPU node to thousand-GPU training runs — we handle
                            the rest.
                        </p>

                        {/* Benefits — 2-col grid with hairline dividers */}
                        <ul className="mt-10 grid max-w-[640px] grid-cols-1 sm:grid-cols-2 gap-x-10">
                            {CLUSTER_BENEFITS.map((b, idx) => {
                                const isLastInColumn =
                                    idx === CLUSTER_BENEFITS.length - 1 ||
                                    idx === CLUSTER_BENEFITS.length - 2;
                                return (
                                    <li
                                        key={b.title}
                                        className={`flex items-start gap-3 py-4 ${
                                            isLastInColumn
                                                ? ""
                                                : "border-b border-white/[0.08]"
                                        }`}
                                    >
                                        <Check
                                            className="mt-[3px] h-4 w-4 shrink-0 text-white/70"
                                            strokeWidth={2.5}
                                        />
                                        <div className="min-w-0">
                                            <p className={`${MONO} text-[11px] font-semibold uppercase tracking-[0.14em] text-white`}>
                                                {b.title}
                                            </p>
                                            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-white/50">
                                                {b.detail}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>

                        {/* Ready to build + CTAs */}
                        <div className="mt-12 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
                            <div className="max-w-[260px]">
                                <p className="text-[18px] font-semibold tracking-tight text-white">
                                    Ready to build?
                                </p>
                                <p className="mt-1.5 text-[12.5px] leading-[1.55] text-white/50">
                                    Talk to our infrastructure team and get a custom quote.
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <Link
                                    href="/dashboard/services/gpu/enterprise"
                                    className="group relative inline-flex h-12 items-center gap-2 overflow-hidden border border-white/85 bg-white px-6 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-black transition-colors hover:bg-white/90"
                                >
                                    <span className="relative">Contact sales</span>
                                    <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                </Link>
                                <Link
                                    href="/pricing"
                                    className="group inline-flex h-12 items-center gap-2 border border-white/20 bg-transparent px-5 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-white/85 transition-colors hover:border-white/40 hover:bg-white/[0.04] hover:text-white"
                                >
                                    View pricing guide
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT — config card preview */}
                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="relative mx-auto w-full max-w-[560px]"
                    >
                        <ClusterConfigCard />
                    </motion.div>
                </div>
            </Container>
        </section>
    );
}
