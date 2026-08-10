"use client";

import { assetUrl } from "@/lib/asset-url";
import Image from "next/image";
import Link from "next/link";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";
import PixelBlast from "./pixel-blast-lazy";
import type { PublicStock } from "@/lib/catalog/gpu";

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

export type GpuRow = {
    id: string;
    name: string;
    memory: number;
    gen: string;
    /** Live resale price per GPU-hour; null when there is no current reading. */
    price: number | null;
    /** Live availability. "unknown" when the stock reading is stale. */
    stock: PublicStock;
    href: string;
    tone: string; // tier accent color
    tier: string; // e.g. Hopper / Blackwell
};


function GpuPricingRail({ gpus }: { gpus: GpuRow[] }) {
    // Catalog unavailable: render nothing rather than an empty padded band.
    if (gpus.length === 0) return null;

    return (
        <div className="relative z-20">
            {/* Card row — horizontal scroll on mobile, 4-col grid on desktop */}
            <div className="overflow-x-auto pb-4 pt-3 sm:overflow-visible sm:pb-5 sm:pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
                    <div className="flex w-max gap-3 sm:grid sm:w-auto sm:grid-cols-4">
                        {gpus.map((gpu) => {
                            const stockBg =
                                gpu.stock === "available"
                                    ? "bg-emerald-400"
                                    : gpu.stock === "limited"
                                        ? "bg-amber-400"
                                        : "bg-white/30";
                            const stockText =
                                gpu.stock === "available"
                                    ? "In stock"
                                    : gpu.stock === "limited"
                                        ? "Limited"
                                        : gpu.stock === "unavailable"
                                            ? "Out of stock"
                                            : "Check availability";
                            return (
                                <Link
                                    key={gpu.id}
                                    href={gpu.href}
                                    className="group relative flex h-[130px] w-[240px] shrink-0 flex-col justify-between overflow-hidden rounded-[6px] border border-white/[0.08] bg-[#0a0c10] px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-[#0d1015] sm:w-auto"
                                    style={{
                                        boxShadow:
                                            "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 14px -4px rgba(0,0,0,0.5)",
                                    }}
                                >
                                    {/* Tier dot — top-right identity marker */}
                                    <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute right-3 top-3 h-1 w-1 rounded-full"
                                        style={{
                                            background: gpu.tone,
                                            boxShadow: `0 0 6px ${gpu.tone}99`,
                                        }}
                                    />

                                    {/* Top — NVIDIA + name + memory chip */}
                                    <div className="relative">
                                        <div className="flex items-center gap-2.5">
                                            <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                                                NVIDIA
                                            </span>
                                            <p className="flex-1 truncate pr-5 text-[15px] font-semibold leading-none tracking-tight text-[#76b900]">
                                                {gpu.name}
                                            </p>
                                            <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em] tabular-nums text-white/45">
                                                {gpu.memory} GB
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center gap-1.5">
                                            <span className="relative flex h-1.5 w-1.5">
                                                <span
                                                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${stockBg}`}
                                                />
                                                <span
                                                    className={`relative inline-flex h-1.5 w-1.5 rounded-full ${stockBg}`}
                                                />
                                            </span>
                                            <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/55">
                                                {stockText}
                                            </span>
                                            <span className="text-white/15">·</span>
                                            <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/45">
                                                {gpu.tier}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Bottom — price + arrow */}
                                    <div className="relative flex items-end justify-between">
                                        <div>
                                            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-white/45">
                                                from
                                            </p>
                                            <p className="mt-1 font-mono text-[24px] font-semibold leading-none tabular-nums text-white">
                                                {gpu.price === null ? "\u2014" : `$${gpu.price.toFixed(2)}`}
                                                <span className="ml-1 text-[10.5px] font-normal text-white/55">
                                                    /hr/gpu
                                                </span>
                                            </p>
                                        </div>
                                        <HeroMark
                                            kind="arrow"
                                            className="h-4 w-4 text-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-white"
                                        />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>

        </div>
    );
}

export default function HeroClient({ gpus }: { gpus: GpuRow[] }) {
    return (
        <section
            className="relative isolate min-h-[100svh] w-full overflow-hidden bg-[#04060a] text-white lg:h-[100svh] lg:min-h-[820px]"
            aria-label="Ahura Cloud infrastructure"
        >
            {/* PixelBlast ambient pattern — sits behind everything, brand color, minimal density.
                Pointer events stay enabled so clicks on empty hero space fire subtle ripples;
                foreground links/buttons (z-10) capture their own clicks first. */}
            <div
                aria-hidden="true"
                className="absolute inset-0 z-0 opacity-[0.55]"
            >
                <PixelBlast
                    variant="circle"
                    color="#0095FF"
                    pixelSize={5}
                    patternScale={3}
                    patternDensity={0.7}
                    pixelSizeJitter={0.4}
                    enableRipples
                    rippleSpeed={0.32}
                    rippleThickness={0.12}
                    rippleIntensityScale={1.2}
                    speed={0.35}
                    edgeFade={0.4}
                    transparent
                />
            </div>

            <div className="relative z-10 mx-auto flex h-auto min-h-0 w-full max-w-[1440px] flex-col px-5 sm:px-8 lg:h-[calc(100svh-180px)] lg:min-h-[640px]">
                <div className="grid flex-1 items-start gap-6 pb-8 pt-20 sm:gap-10 sm:pt-24 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:pb-12 lg:pt-24">
                    {/* LEFT — static, GPU-focused. The tensor cycles
                        through formations on the right, but the pitch
                        here doesn't shift — GPU is the main subject. */}
                    <div className="relative max-w-[600px]">
                        <h1 className="max-w-[680px] text-[44px] font-semibold leading-[0.95] tracking-[-0.045em] text-white sm:text-6xl lg:text-[80px]">
                            Your cloud,
                            <br />
                             <span className="text-blue-500">on demand.</span>
                        </h1>

                        <p className="mt-3 max-w-[560px] text-[15px] font-medium tracking-tight text-white/60 sm:text-[16.5px]">
                            Compute, GPUs, databases, Kubernetes, and storage —
                            <span className="text-white/85">
                                {" "}provisioned in seconds, billed by the second.
                            </span>
                        </p>

                        <p className="mt-7 max-w-[540px] text-[14px] leading-[1.7] text-white/55 sm:text-[14.5px]">
                            Spin up a single instance or scale to thousand-GPU
                            clusters across 12 regions. Persistent state follows
                            your workloads; idle resources cost you nothing.
                        </p>

                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <AuthAwareServiceCta
                                service="gpu"
                                intent="new"
                                className="group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-none border border-white/85 bg-white px-6 text-[13.5px] font-semibold text-black transition-colors hover:border-[#0095FF] hover:bg-[#0095FF] hover:text-white"
                            >
                                <span className="relative">Get started</span>
                                <HeroMark
                                    kind="arrow"
                                    className="relative h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                                />
                            </AuthAwareServiceCta>
                            <Link
                                href="/pricing"
                                className="group inline-flex h-12 items-center justify-center gap-2 rounded-none border border-white/16 bg-white/[0.04] px-5 text-[13.5px] font-medium text-white/82 backdrop-blur transition-colors hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
                            >
                                View pricing
                                <HeroMark
                                    kind="arrow"
                                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                                />
                            </Link>
                        </div>

                    </div>

                    {/* RIGHT — hero illustration */}
                    <div className="relative h-[200px] w-full sm:h-[420px] md:h-[480px] lg:h-full lg:min-h-[520px]">
                        {/* Soft brand-blue halo behind the illustration */}
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0"
                            style={{
                                background:
                                    "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(0,149,255,0.18), transparent 70%)",
                                filter: "blur(48px)",
                            }}
                        />
                        <Image
                            src="https://ahurasense.cs2hvh.com/images/2026-06/yCxP4rYYDAru.png"
                            alt="Ahura Cloud infrastructure"
                            fill
                            priority
                            className="object-contain"
                            style={{
                                filter:
                                    "drop-shadow(0 30px 50px rgba(0,0,0,0.55)) drop-shadow(0 0 32px rgba(0,149,255,0.16))",
                            }}
                            sizes="(min-width: 1024px) 50vw, 90vw"
                        />
                    </div>
                </div>
            </div>

            <GpuPricingRail gpus={gpus} />
        </section>
    );
}
