"use client";

import { motion } from "motion/react";
import Link from "next/link";

import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";

export type StockStatus = "high" | "medium" | "low" | "none";

export interface HeroInventoryItem {
    gpuCatalogId: string;
    displayName: string;
    memoryGb: number;
    onDemandPerHr: number | null;
    stockStatus: StockStatus;
    maxCount?: number;
}

const BRAND = "#0095FF";

// ─── Custom arrow glyph (no lucide) ──────────────────────────────
function ArrowGlyph({ className = "" }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M2.5 8H13.5M9 3.5L13.5 8L9 12.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="square"
                strokeLinejoin="miter"
            />
        </svg>
    );
}

// ─── Custom service marks (no lucide) ────────────────────────────
// Hand-drawn 12×12 monoline glyphs — distinctive per service but
// share one visual language: thin strokes, square caps, no fills.
function ServiceMark({
    kind,
    className = "",
}: {
    kind:
        | "gpu"
        | "compute"
        | "k8s"
        | "database"
        | "storage"
        | "app"
        | "agent"
        | "network";
    className?: string;
}) {
    const common = {
        stroke: "currentColor",
        strokeWidth: 1,
        fill: "none",
        strokeLinecap: "square" as const,
        strokeLinejoin: "miter" as const,
    };
    switch (kind) {
        case "gpu":
            // outer pkg + inner die + 4 corner dots
            return (
                <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
                    <rect x="1" y="1" width="10" height="10" {...common} />
                    <rect x="3.5" y="3.5" width="5" height="5" {...common} />
                    <circle cx="1" cy="1" r="0.4" fill="currentColor" />
                    <circle cx="11" cy="1" r="0.4" fill="currentColor" />
                    <circle cx="1" cy="11" r="0.4" fill="currentColor" />
                    <circle cx="11" cy="11" r="0.4" fill="currentColor" />
                </svg>
            );
        case "compute":
            // stacked rectangles (servers)
            return (
                <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
                    <rect x="1" y="2" width="10" height="2.5" {...common} />
                    <rect x="1" y="5.5" width="10" height="2.5" {...common} />
                    <rect x="1" y="9" width="10" height="1.5" {...common} />
                    <circle cx="3" cy="3.25" r="0.35" fill="currentColor" />
                    <circle cx="3" cy="6.75" r="0.35" fill="currentColor" />
                </svg>
            );
        case "k8s":
            // hexagonal node with 6 spokes
            return (
                <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
                    <polygon
                        points="6,1.5 10,3.75 10,8.25 6,10.5 2,8.25 2,3.75"
                        {...common}
                    />
                    <circle cx="6" cy="6" r="1.3" {...common} />
                </svg>
            );
        case "database":
            // 3 stacked ellipses (cylinder)
            return (
                <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
                    <ellipse cx="6" cy="2.5" rx="4" ry="1.2" {...common} />
                    <path d="M2 2.5 V 9.5" {...common} />
                    <path d="M10 2.5 V 9.5" {...common} />
                    <path d="M2 5.5 Q 6 7 10 5.5" {...common} />
                    <path d="M2 9.5 Q 6 11 10 9.5" {...common} />
                </svg>
            );
        case "storage":
            // 4 cubes in 2×2
            return (
                <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
                    <rect x="1.5" y="1.5" width="3.5" height="3.5" {...common} />
                    <rect x="7" y="1.5" width="3.5" height="3.5" {...common} />
                    <rect x="1.5" y="7" width="3.5" height="3.5" {...common} />
                    <rect x="7" y="7" width="3.5" height="3.5" {...common} />
                </svg>
            );
        case "app":
            // arrow up out of box (deploy)
            return (
                <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
                    <path d="M2 7 V 11 H 10 V 7" {...common} />
                    <path d="M6 9 V 1.5 M3 4.5 L 6 1.5 L 9 4.5" {...common} />
                </svg>
            );
        case "agent":
            // node + 3 connection arms
            return (
                <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
                    <circle cx="6" cy="6" r="2" {...common} />
                    <path d="M6 4 V 1" {...common} />
                    <path d="M4 7 L 1.5 10" {...common} />
                    <path d="M8 7 L 10.5 10" {...common} />
                    <circle cx="6" cy="1" r="0.6" fill="currentColor" />
                    <circle cx="1.5" cy="10" r="0.6" fill="currentColor" />
                    <circle cx="10.5" cy="10" r="0.6" fill="currentColor" />
                </svg>
            );
        case "network":
        default:
            // shield outline
            return (
                <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
                    <path
                        d="M6 1.5 L 10.5 3 V 6.5 Q 10.5 9.5 6 10.5 Q 1.5 9.5 1.5 6.5 V 3 Z"
                        {...common}
                    />
                </svg>
            );
    }
}

// ─── Premium platform mockup — multi-service running workloads ──
// A clean dashboard panel showing the actual product: a list of
// running workloads spanning every service tier on the platform.
// Conveys breadth (GPU + DB + K8s + App + Storage + Compute) and
// what the product actually does, without filling the visual with
// nested boxes.
type Workload = {
    kind: Parameters<typeof ServiceMark>[0]["kind"];
    service: string;
    spec: string;
    price: string;
    accent?: boolean;
};

const WORKLOADS: Workload[] = [
    {
        kind: "gpu",
        service: "GPU pod",
        spec: "H200 SXM · 141 GB",
        price: "$3.99/hr",
        accent: true,
    },
    {
        kind: "database",
        service: "Database",
        spec: "Postgres 16 · pro",
        price: "$0.18/hr",
    },
    {
        kind: "k8s",
        service: "Kubernetes",
        spec: "prod-cluster · 6 nodes",
        price: "$0.04/n·hr",
    },
    {
        kind: "app",
        service: "App deploy",
        spec: "support-bot · main",
        price: "$0.012/hr",
    },
    {
        kind: "storage",
        service: "Object storage",
        spec: "models · 2.4 TB",
        price: "$0.02/GB",
    },
];

function PlatformMockup() {
    return (
        <div
            className="relative overflow-hidden border border-white/[0.08] bg-[#0a0d14]"
            style={{
                boxShadow:
                    "0 0 0 1px rgba(255,255,255,0.015), 0 40px 100px -30px rgba(0,149,255,0.28), 0 20px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
        >
            {/* Top scanning sweep */}
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
            <div className="flex items-center justify-between px-6 pt-5">
                <div>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/40">
                        Active workloads
                    </p>
                    <p className="mt-1 font-semibold text-white text-[15px]">
                        Your platform · all services
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.20em] text-white/40">
                        Live
                    </span>
                </div>
            </div>

            {/* Workload list */}
            <ul className="mt-5 divide-y divide-white/[0.05] border-y border-white/[0.05]">
                {WORKLOADS.map((w) => (
                    <li
                        key={w.service}
                        className="relative flex items-center gap-4 px-6 py-3.5"
                    >
                        {/* active indicator stripe (left edge) */}
                        {w.accent && (
                            <motion.span
                                aria-hidden="true"
                                className="absolute inset-y-0 left-0 w-[2px]"
                                style={{ backgroundColor: BRAND }}
                                animate={{ opacity: [0.4, 1, 0.4] }}
                                transition={{
                                    duration: 2.4,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                }}
                            />
                        )}
                        {/* service mark */}
                        <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center ${
                                w.accent ? "text-[#0095FF]" : "text-white/45"
                            }`}
                        >
                            <ServiceMark kind={w.kind} className="h-4 w-4" />
                        </span>
                        {/* labels */}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                                <p className="truncate text-[13px] font-semibold text-white/90">
                                    {w.service}
                                </p>
                                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
                                    {w.spec}
                                </span>
                            </div>
                        </div>
                        {/* price */}
                        <p
                            className="shrink-0 font-mono text-[12.5px] font-semibold tabular-nums"
                            style={{
                                color: w.accent ? BRAND : "rgba(255,255,255,0.7)",
                            }}
                        >
                            {w.price}
                        </p>
                        {/* status dot */}
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    </li>
                ))}
            </ul>

            {/* Footer summary */}
            <div className="flex items-center justify-between px-6 py-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
                        Burn rate · /hr
                    </p>
                    <p className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-white leading-none">
                        $4.27
                        <span className="ml-1 text-[11px] font-normal text-white/35">
                            USD
                        </span>
                    </p>
                </div>
                <Link
                    href="/dashboard"
                    tabIndex={-1}
                    className="group inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white/65 transition-colors hover:text-white"
                >
                    Open dashboard
                    <ArrowGlyph className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
            </div>
        </div>
    );
}

// ─── All-services lineup (replaces GPU-only lockup) ─────────────
type ServiceRow = {
    kind: Parameters<typeof ServiceMark>[0]["kind"];
    name: string;
    tagline: string;
    price: string;
    href: string;
};

const SERVICES: ServiceRow[] = [
    {
        kind: "gpu",
        name: "GPU Cloud",
        tagline: "H100 · H200 · B200",
        price: "from $2.59/hr",
        href: "/services/gpu",
    },
    {
        kind: "compute",
        name: "Compute",
        tagline: "VPS · bare metal",
        price: "from $5/mo",
        href: "/services/compute",
    },
    {
        kind: "k8s",
        name: "Kubernetes",
        tagline: "managed · autoscale",
        price: "from $0.04/n·hr",
        href: "/services/kubernetes",
    },
    {
        kind: "database",
        name: "Databases",
        tagline: "Postgres · MySQL · Redis",
        price: "from $0.18/hr",
        href: "/services/database",
    },
    {
        kind: "storage",
        name: "Object Storage",
        tagline: "S3 API · global CDN",
        price: "$0.02/GB·mo",
        href: "/services/object-storage",
    },
    {
        kind: "app",
        name: "App Platform",
        tagline: "Docker · CI/CD · GitHub",
        price: "from $0.012/hr",
        href: "/services/app-deployment",
    },
    {
        kind: "agent",
        name: "AI Agents",
        tagline: "multi-LLM · serverless",
        price: "from $0.10/run",
        href: "/services/ai-agents",
    },
];

function ServicesLineup() {
    const stagger = {
        hidden: {},
        show: { transition: { staggerChildren: 0.05, delayChildren: 0.9 } },
    };
    const item = {
        hidden: { opacity: 0, y: 8 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
        },
    };

    return (
        <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-7 lg:gap-x-14"
        >
            {SERVICES.map((s) => (
                <motion.div key={s.name} variants={item}>
                    <Link
                        href={s.href}
                        className="group flex items-start gap-3.5"
                    >
                        <span className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center text-white/35 transition-colors group-hover:text-[#0095FF]">
                            <ServiceMark
                                kind={s.kind}
                                className="h-3.5 w-3.5"
                            />
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                                <p className="text-[14px] font-semibold tracking-tight text-white/90 transition-colors group-hover:text-white">
                                    {s.name}
                                </p>
                            </div>
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                                {s.tagline}
                            </p>
                            <p
                                className="mt-1.5 font-mono text-[12px] font-semibold tabular-nums"
                                style={{ color: BRAND }}
                            >
                                {s.price}
                            </p>
                        </div>
                    </Link>
                </motion.div>
            ))}
        </motion.div>
    );
}

// ─── Hero ────────────────────────────────────────────────────────
export default function HeroClient({
    inventory: _inventory,
}: {
    inventory: HeroInventoryItem[];
}) {
    return (
        <section
            className="relative w-full overflow-hidden bg-[#08080a]"
            aria-label="Ahura — one cloud, every workload"
        >
            {/* ── Background layers ─────────────────────────────── */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.22]"
                style={{
                    backgroundImage:
                        "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
                    backgroundSize: "32px 32px",
                    maskImage:
                        "radial-gradient(ellipse 95% 80% at 50% 45%, black 30%, transparent 80%)",
                    WebkitMaskImage:
                        "radial-gradient(ellipse 95% 80% at 50% 45%, black 30%, transparent 80%)",
                }}
            />
            {/* Brand wash upper-right */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-40 right-[-12%] h-[680px] w-[860px] rounded-full"
                style={{
                    background:
                        "radial-gradient(closest-side, rgba(0,149,255,0.20), rgba(0,149,255,0.05) 50%, transparent 80%)",
                }}
            />
            {/* Cool wash lower-left */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-40 left-[-10%] h-[520px] w-[760px] rounded-full"
                style={{
                    background:
                        "radial-gradient(closest-side, rgba(105,183,255,0.10), rgba(105,183,255,0.03) 55%, transparent 80%)",
                }}
            />

            {/* ── Main asymmetric grid ──────────────────────────── */}
            <div className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pt-28 pb-16 sm:px-8 sm:pt-32 lg:pt-36 lg:pb-20">
                <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.95fr_1.15fr] lg:gap-16 lg:items-center">
                    {/* LEFT — text */}
                    <div>
                        {/* Eyebrow (no boxy chip — just a dot + text) */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45"
                        >
                            <span className="relative flex h-1.5 w-1.5">
                                <span
                                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                                    style={{ backgroundColor: BRAND }}
                                />
                                <span
                                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: BRAND }}
                                />
                            </span>
                            <span>One platform · Every workload</span>
                        </motion.div>

                        {/* H1 */}
                        <motion.h1
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.12 }}
                            className="mt-7 text-[clamp(40px,5.6vw,80px)] font-semibold leading-[0.97] tracking-[-0.045em] text-white"
                            style={{ fontFeatureSettings: '"ss01", "ss02"' }}
                        >
                            One cloud.
                            <br />
                            <motion.span
                                className="inline-block bg-clip-text text-transparent"
                                style={{
                                    backgroundImage: `linear-gradient(110deg, #ffffff 0%, #cfe9ff 22%, ${BRAND} 50%, #69b7ff 78%, #ffffff 100%)`,
                                    backgroundSize: "220% 100%",
                                }}
                                animate={{ backgroundPositionX: ["0%", "-220%"] }}
                                transition={{
                                    duration: 9,
                                    repeat: Infinity,
                                    ease: "linear",
                                }}
                            >
                                Every workload.
                            </motion.span>
                        </motion.h1>

                        {/* Subhead */}
                        <motion.p
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.28 }}
                            className="mt-7 max-w-[520px] text-[15px] leading-[1.65] text-white/55 sm:text-[16.5px]"
                        >
                            GPU clouds for AI. Compute, Kubernetes, databases, app
                            deploys, object storage, and AI agents — provisioned in
                            seconds, billed by the second, across 12 regions.
                        </motion.p>

                        {/* CTAs */}
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.42 }}
                            className="relative mt-9"
                        >
                            <motion.div
                                aria-hidden="true"
                                className="pointer-events-none absolute left-10 top-1/2 -z-10 h-24 w-56 -translate-y-1/2 blur-3xl"
                                style={{ backgroundColor: BRAND }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0.16, 0.32, 0.16] }}
                                transition={{
                                    duration: 4.5,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                    delay: 1,
                                }}
                            />
                            <div className="flex flex-wrap items-center gap-3">
                                <AuthAwareServiceCta
                                    service="main"
                                    intent="main"
                                    className="group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden border border-[#0095FF] bg-[#0095FF] px-7 text-[14px] font-semibold text-white transition-all hover:shadow-[0_12px_40px_-8px_rgba(0,149,255,0.55)]"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent"
                                    />
                                    <span className="relative">Get Started</span>
                                    <ArrowGlyph className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                </AuthAwareServiceCta>
                                <Link
                                    href="/pricing"
                                    className="group inline-flex h-12 items-center justify-center gap-1.5 text-[14px] font-medium text-white/70 transition-colors hover:text-white"
                                >
                                    View pricing
                                    <ArrowGlyph className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                </Link>
                            </div>
                        </motion.div>

                        {/* Proof row */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 1, delay: 0.7 }}
                            className="mt-12 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[11px] text-white/40"
                        >
                            <span className="flex items-baseline gap-2">
                                <span className="font-mono text-[14px] font-semibold text-white tabular-nums">
                                    12
                                </span>
                                <span className="uppercase tracking-[0.18em]">
                                    Regions
                                </span>
                            </span>
                            <span className="hidden h-3 w-px bg-white/[0.10] sm:inline-block" />
                            <span className="flex items-baseline gap-2">
                                <span className="font-mono text-[14px] font-semibold text-white tabular-nums">
                                    99.998%
                                </span>
                                <span className="uppercase tracking-[0.18em]">
                                    Uptime · 90d
                                </span>
                            </span>
                            <span className="hidden h-3 w-px bg-white/[0.10] sm:inline-block" />
                            <span className="flex items-baseline gap-2">
                                <span className="font-mono text-[14px] font-semibold text-white tabular-nums">
                                    &lt;90s
                                </span>
                                <span className="uppercase tracking-[0.18em]">
                                    Provisioning
                                </span>
                            </span>
                        </motion.div>
                    </div>

                    {/* RIGHT — platform mockup */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 18 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{
                            duration: 0.9,
                            delay: 0.3,
                            ease: [0.16, 1, 0.3, 1],
                        }}
                        className="relative mx-auto w-full max-w-[600px]"
                    >
                        <motion.div
                            animate={{ y: [0, -6, 0] }}
                            transition={{
                                duration: 8,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: 1.2,
                            }}
                        >
                            <PlatformMockup />
                        </motion.div>
                    </motion.div>
                </div>
            </div>

            {/* ── All-services lineup ───────────────────────────── */}
            <div className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-24">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.8 }}
                    className="mb-10 flex items-center justify-center sm:mb-14"
                >
                    <span className="h-px w-10 bg-white/[0.10]" />
                    <span className="mx-4 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/35">
                        One platform · Seven services
                    </span>
                    <span className="h-px w-10 bg-white/[0.10]" />
                </motion.div>

                <ServicesLineup />
            </div>

            {/* Bottom separator */}
            <div
                aria-hidden="true"
                className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
            />
        </section>
    );
}
