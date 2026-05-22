"use client";

import Link from "next/link";
import { motion } from "motion/react";

import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";
import { NvidiaLogo } from "@/components/branding/nvidia-logo";
import { TensorScene } from "./tensor-scene";

const BRAND = "#0095FF";

// ─── Custom monoline marks — shared visual language ─────────────
type MarkKind =
    | "gpu"
    | "compute"
    | "k8s"
    | "database"
    | "storage"
    | "app"
    | "agent"
    | "shield"
    | "stack"
    | "deploy"
    | "arrow";

function HeroMark({
    kind,
    className = "",
}: {
    kind: MarkKind;
    className?: string;
}) {
    const stroke = {
        stroke: "currentColor",
        strokeWidth: 1.2,
        fill: "none",
        strokeLinecap: "square" as const,
        strokeLinejoin: "miter" as const,
    };
    const svgProps = {
        viewBox: "0 0 16 16",
        className,
        "aria-hidden": true,
    } as const;
    switch (kind) {
        case "gpu":
            return (
                <svg {...svgProps}>
                    <rect x="1.5" y="1.5" width="13" height="13" {...stroke} />
                    <rect x="4.5" y="4.5" width="7" height="7" {...stroke} />
                    <circle cx="1.5" cy="1.5" r="0.7" fill="currentColor" />
                    <circle cx="14.5" cy="1.5" r="0.7" fill="currentColor" />
                    <circle cx="1.5" cy="14.5" r="0.7" fill="currentColor" />
                    <circle cx="14.5" cy="14.5" r="0.7" fill="currentColor" />
                </svg>
            );
        case "compute":
            return (
                <svg {...svgProps}>
                    <rect x="1.5" y="3" width="13" height="3" {...stroke} />
                    <rect x="1.5" y="7.5" width="13" height="3" {...stroke} />
                    <rect x="1.5" y="12" width="13" height="2" {...stroke} />
                    <circle cx="3.5" cy="4.5" r="0.5" fill="currentColor" />
                    <circle cx="3.5" cy="9" r="0.5" fill="currentColor" />
                </svg>
            );
        case "k8s":
            return (
                <svg {...svgProps}>
                    <polygon
                        points="8,1.5 13.5,4.75 13.5,11.25 8,14.5 2.5,11.25 2.5,4.75"
                        {...stroke}
                    />
                    <circle cx="8" cy="8" r="2" {...stroke} />
                </svg>
            );
        case "database":
            return (
                <svg {...svgProps}>
                    <ellipse cx="8" cy="3" rx="5.5" ry="1.5" {...stroke} />
                    <path d="M2.5 3 V 13" {...stroke} />
                    <path d="M13.5 3 V 13" {...stroke} />
                    <path d="M2.5 7 Q 8 9 13.5 7" {...stroke} />
                    <path d="M2.5 13 Q 8 15 13.5 13" {...stroke} />
                </svg>
            );
        case "storage":
            return (
                <svg {...svgProps}>
                    <rect x="1.5" y="1.5" width="6" height="6" {...stroke} />
                    <rect x="8.5" y="1.5" width="6" height="6" {...stroke} />
                    <rect x="1.5" y="8.5" width="6" height="6" {...stroke} />
                    <rect x="8.5" y="8.5" width="6" height="6" {...stroke} />
                </svg>
            );
        case "app":
            return (
                <svg {...svgProps}>
                    <path d="M2.5 9 V 14 H 13.5 V 9" {...stroke} />
                    <path
                        d="M8 11 V 2 M4.5 5.5 L 8 2 L 11.5 5.5"
                        {...stroke}
                    />
                </svg>
            );
        case "agent":
            return (
                <svg {...svgProps}>
                    <circle cx="8" cy="8" r="2.6" {...stroke} />
                    <path d="M8 5.4 V 1.5" {...stroke} />
                    <path d="M5.6 9.5 L 2.5 13.5" {...stroke} />
                    <path d="M10.4 9.5 L 13.5 13.5" {...stroke} />
                    <circle cx="8" cy="1.5" r="0.8" fill="currentColor" />
                    <circle cx="2.5" cy="13.5" r="0.8" fill="currentColor" />
                    <circle cx="13.5" cy="13.5" r="0.8" fill="currentColor" />
                </svg>
            );
        case "shield":
            return (
                <svg {...svgProps}>
                    <path
                        d="M8 1.5 L 13.5 3.5 V 8 Q 13.5 12 8 14.5 Q 2.5 12 2.5 8 V 3.5 Z"
                        {...stroke}
                    />
                    <path d="M5.5 8 L 7.5 10 L 10.5 6.5" {...stroke} />
                </svg>
            );
        case "stack":
            return (
                <svg {...svgProps}>
                    <path
                        d="M8 1.5 L 14 4.5 L 8 7.5 L 2 4.5 Z"
                        {...stroke}
                    />
                    <path d="M2 8 L 8 11 L 14 8" {...stroke} />
                    <path d="M2 11.5 L 8 14.5 L 14 11.5" {...stroke} />
                </svg>
            );
        case "deploy":
            return (
                <svg {...svgProps}>
                    <path d="M2 8 H 13" {...stroke} />
                    <path d="M9 4 L 13 8 L 9 12" {...stroke} />
                    <circle cx="2" cy="8" r="1" fill="currentColor" />
                </svg>
            );
        case "arrow":
        default:
            return (
                <svg {...svgProps}>
                    <path d="M2.5 8 H 13.5 M9 3.5 L 13.5 8 L 9 12.5" {...stroke} />
                </svg>
            );
    }
}

type GpuRow = {
    id: string;
    name: string;
    memory: number;
    gen: string;
    price: number;
    stock: "high" | "low";
    href: string;
};

const GPU_PRICING: GpuRow[] = [
    {
        id: "h100-sxm",
        name: "H100 SXM",
        memory: 80,
        gen: "HBM3",
        price: 2.99,
        stock: "high",
        href: "/dashboard/services/gpu/deploy?gpu=h100-sxm-80",
    },
    {
        id: "h100-nvl",
        name: "H100 NVL",
        memory: 94,
        gen: "HBM3",
        price: 2.59,
        stock: "high",
        href: "/dashboard/services/gpu/deploy?gpu=h100-nvl-94",
    },
    {
        id: "h200-sxm",
        name: "H200 SXM",
        memory: 141,
        gen: "HBM3e",
        price: 3.99,
        stock: "low",
        href: "/dashboard/services/gpu/deploy?gpu=h200-141",
    },
    {
        id: "b200",
        name: "B200",
        memory: 180,
        gen: "HBM3e",
        price: 5.49,
        stock: "low",
        href: "/dashboard/services/gpu/deploy?gpu=b200-180",
    },
];

function GpuPricingRail() {
    return (
        <div className="relative z-20 border-2 border-white/35 bg-[#04060a]/95 shadow-[0_-36px_100px_-58px_rgba(0,149,255,0.22)] backdrop-blur-sm">
            {/* Scanning sweep across the top edge */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-px -top-px h-px overflow-hidden"
            >
                <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{
                        duration: 7,
                        repeat: Infinity,
                        ease: "linear",
                    }}
                    className="h-full w-[36%]"
                    style={{
                        background:
                            "linear-gradient(90deg, transparent, #0095FF, transparent)",
                    }}
                />
            </div>

            {/* Right-edge gradient fade as scroll affordance */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-20 bg-gradient-to-l from-[#04060a] via-[#04060a]/60 to-transparent lg:hidden"
            />

            <div className="mx-auto flex h-[124px] max-w-[1440px] overflow-x-auto lg:h-[140px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {/* Header */}
                <div className="hidden w-[228px] shrink-0 flex-col justify-center border-r border-white/10 px-7 lg:flex">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </span>
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                            Live pricing
                        </p>
                    </div>
                    <p className="mt-2 text-[15px] font-semibold tracking-tight text-white">
                        GPU available
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/40">
                        <NvidiaLogo width={14} height={10} className="opacity-90" />
                        H100 · H200 · B200 · per-second billing
                    </p>
                </div>

                {/* GPU pricing cells */}
                <div className="flex min-w-max flex-1 lg:grid lg:min-w-0 lg:grid-cols-4">
                    {GPU_PRICING.map((gpu) => {
                        const stockBg =
                            gpu.stock === "high"
                                ? "bg-emerald-400"
                                : "bg-amber-400";
                        const stockText =
                            gpu.stock === "high" ? "In stock" : "Limited";
                        return (
                            <Link
                                key={gpu.id}
                                href={gpu.href}
                                className="group relative flex h-[124px] w-[236px] flex-col justify-between border-r border-white/10 px-5 py-4 transition-all hover:bg-white/[0.04] lg:h-[140px] lg:w-auto"
                            >
                                <span
                                    aria-hidden="true"
                                    className="absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 bg-[#0095FF] transition-transform duration-300 group-hover:scale-x-100"
                                />

                                {/* Top — GPU name + memory chip */}
                                <div>
                                    <div className="flex items-baseline justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <NvidiaLogo
                                                width={16}
                                                height={11}
                                                className="opacity-95"
                                            />
                                            <p className="text-[15.5px] font-semibold tracking-tight text-white">
                                                {gpu.name}
                                            </p>
                                        </div>
                                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                                            {gpu.memory} GB
                                        </span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-[10.5px]">
                                        <span className="relative flex h-1.5 w-1.5">
                                            <span
                                                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${stockBg}`}
                                            />
                                            <span
                                                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${stockBg}`}
                                            />
                                        </span>
                                        <span className="font-mono uppercase tracking-[0.18em] text-white/45">
                                            {stockText}
                                        </span>
                                        <span className="text-white/25">·</span>
                                        <span className="font-mono uppercase tracking-[0.18em] text-white/35">
                                            {gpu.gen}
                                        </span>
                                    </div>
                                </div>

                                {/* Bottom — price + arrow */}
                                <div className="flex items-end justify-between">
                                    <div>
                                        <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/35">
                                            from
                                        </p>
                                        <p
                                            className="mt-0.5 font-mono text-[24px] font-semibold tabular-nums leading-none"
                                            style={{ color: BRAND }}
                                        >
                                            ${gpu.price.toFixed(2)}
                                            <span className="ml-1 text-[11px] font-normal text-white/50">
                                                /hr
                                            </span>
                                        </p>
                                    </div>
                                    <HeroMark
                                        kind="arrow"
                                        className="h-3.5 w-3.5 text-white/25 transition-all group-hover:translate-x-0.5 group-hover:text-[#0095FF]"
                                    />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Secondary "all services" link row */}
            <div className="border-t border-white/[0.06] bg-[#02040a]/50">
                <div className="mx-auto flex h-10 max-w-[1440px] items-center justify-between px-5 sm:px-8">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">
                        Plus 6 more services · compute · k8s · db · storage · apps · agents
                    </p>
                    <Link
                        href="/products"
                        className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50 transition-colors hover:text-white"
                    >
                        All services
                        <HeroMark
                            kind="arrow"
                            className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                        />
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default function HeroClient() {
    return (
        <section
            className="relative isolate h-[100svh] min-h-[720px] w-full overflow-hidden bg-[#04060a] text-white lg:min-h-[760px]"
            aria-label="Ahura Cloud infrastructure"
        >
            <div className="relative z-10 mx-auto flex h-[calc(100svh-164px)] min-h-[604px] w-full max-w-[1440px] flex-col px-5 sm:px-8 lg:h-[calc(100svh-180px)] lg:min-h-[620px]">
                <div className="grid flex-1 items-center gap-10 pb-10 pt-20 sm:pt-24 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:gap-12 lg:pb-12 lg:pt-24">
                    {/* LEFT — static, GPU-focused. The tensor cycles
                        through formations on the right, but the pitch
                        here doesn't shift — GPU is the main subject. */}
                    <div className="relative max-w-[600px]">
                        <div className="flex items-center gap-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/55">
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
                            <span>GPU Cloud</span>
                            <span className="h-3 w-px bg-white/15" />
                            <span className="text-white/40">accelerated compute</span>
                        </div>

                        <h1 className="mt-6 max-w-[680px] text-[44px] font-semibold leading-[0.95] tracking-[-0.045em] text-white sm:text-6xl lg:text-[80px]">
                            GPU Cloud,
                            <br />
                            on demand.
                        </h1>

                        <p className="mt-3 max-w-[560px] text-[15px] font-medium tracking-tight text-white/60 sm:text-[16.5px]">
                            H100, H200, and B200 —
                            <span className="text-white/85">
                                {" "}from $2.59/hr, billed by the second.
                            </span>
                        </p>

                        <p className="mt-7 max-w-[540px] text-[14px] leading-[1.7] text-white/55 sm:text-[14.5px]">
                            Reserve a single accelerator or a full cluster across
                            12 regions. Persistent volumes follow your jobs; idle
                            pods cost you nothing.
                        </p>

                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <AuthAwareServiceCta
                                service="gpu"
                                intent="new"
                                className="group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-none border border-[#0095FF] bg-[#0095FF] px-6 text-[13.5px] font-semibold text-white shadow-[0_18px_46px_-18px_rgba(0,149,255,0.8)] transition-colors hover:bg-[#0aa0ff]"
                            >
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/18 to-transparent"
                                />
                                <span className="relative">Launch a GPU</span>
                                <HeroMark
                                    kind="arrow"
                                    className="relative h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                                />
                            </AuthAwareServiceCta>
                            <Link
                                href="/pricing"
                                className="group inline-flex h-12 items-center justify-center gap-2 rounded-none border border-white/16 bg-white/[0.04] px-5 text-[13.5px] font-medium text-white/82 backdrop-blur transition-colors hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
                            >
                                GPU pricing
                                <HeroMark
                                    kind="arrow"
                                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                                />
                            </Link>
                        </div>

                    </div>

                    {/* RIGHT — Three.js tensor, no visible container */}
                    <div
                        className="relative h-[480px] w-full sm:h-[560px] lg:h-full lg:min-h-[520px]"
                        style={{
                            maskImage:
                                "radial-gradient(ellipse 85% 92% at 50% 50%, black 55%, transparent 100%)",
                            WebkitMaskImage:
                                "radial-gradient(ellipse 85% 92% at 50% 50%, black 55%, transparent 100%)",
                        }}
                    >
                        <TensorScene className="absolute inset-0" />
                    </div>
                </div>
            </div>

            <GpuPricingRail />
        </section>
    );
}
