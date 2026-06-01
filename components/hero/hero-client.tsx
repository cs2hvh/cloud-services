"use client";

import Image from "next/image";
import Link from "next/link";
import { AuthAwareServiceCta } from "@/components/services/auth-aware-service-cta";
import { NvidiaLogo } from "@/components/branding/nvidia-logo";
import { ServiceMark as HeroMark } from "@/components/branding/service-mark";
import PixelBlast from "./pixel-blast";

const BRAND = "#0095FF";

type GpuRow = {
    id: string;
    name: string;
    memory: number;
    gen: string;
    price: number;
    stock: "high" | "low";
    href: string;
    tone: string; // tier accent color
    tier: string; // e.g. Hopper / Blackwell
};

const GPU_PRICING: GpuRow[] = [
    {
        id: "b200",
        name: "B200",
        memory: 180,
        gen: "HBM3e",
        price: 5.49,
        stock: "low",
        href: "/dashboard/services/gpu/deploy?gpu=b200-180",
        tone: "#fbbf24", // amber — flagship
        tier: "Blackwell",
    },
    {
        id: "h200-sxm",
        name: "H200 SXM",
        memory: 141,
        gen: "HBM3e",
        price: 3.99,
        stock: "low",
        href: "/dashboard/services/gpu/deploy?gpu=h200-141",
        tone: "#4ade80",
        tier: "Hopper",
    },
    // {
    //     id: "h100-nvl",
    //     name: "H100 NVL",
    //     memory: 94,
    //     gen: "HBM3",
    //     price: 2.59,
    //     stock: "high",
    //     href: "/dashboard/services/gpu/deploy?gpu=h100-nvl-94",
    //     tone: "#a78bfa",
    //     tier: "Hopper",
    // },
    // {
    //     id: "h100-sxm",
    //     name: "H100 SXM",
    //     memory: 80,
    //     gen: "HBM3",
    //     price: 2.99,
    //     stock: "high",
    //     href: "/dashboard/services/gpu/deploy?gpu=h100-sxm-80",
    //     tone: "#22d3ee",
    //     tier: "Hopper",
    // },
     {
        id: "b200-x4",
        name: "B200 X4",
        memory: 180,
        gen: "HBM3e",
        price: 5.49,
        stock: "high",
        href: "/dashboard/services/gpu/deploy?gpu=b200-x4-180",
        tone: "#22d3ee",
        tier: "Hopper",
    },
     {
        id: "b200-x8",
        name: "B200 X8",
        memory: 180,
        gen: "HBM3e",
        price: 5.49,
        stock: "high",
        href: "/dashboard/services/gpu/deploy?gpu=b200-x8-180",
        tone: "#22d3ee",
        tier: "Hopper",
    },
];

function GpuPricingRail() {
    return (
        <div className="relative z-20">
            {/* Card row — horizontal scroll on mobile, 4-col grid on desktop */}
            <div className="overflow-x-auto pb-4 pt-3 sm:overflow-visible sm:pb-5 sm:pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
                    <div className="flex w-max gap-3 sm:grid sm:w-auto sm:grid-cols-4">
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
                                            <NvidiaLogo
                                                width={42}
                                                height={11}
                                                className="shrink-0 opacity-95"
                                            />
                                            <p className="flex-1 truncate pr-5 text-[15px] font-semibold leading-none tracking-tight text-white">
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
                                                ${gpu.price.toFixed(2)}
                                                <span className="ml-1 text-[10.5px] font-normal text-white/55">
                                                    /hr
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

export default function HeroClient() {
    return (
        <section
            className="relative isolate h-[100svh] min-h-[780px] w-full overflow-hidden bg-[#04060a] text-white lg:min-h-[820px]"
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

            <div className="relative z-10 mx-auto flex h-[calc(100svh-170px)] min-h-[608px] w-full max-w-[1440px] flex-col px-5 sm:px-8 lg:h-[calc(100svh-180px)] lg:min-h-[640px]">
                <div className="grid flex-1 items-center gap-10 pb-10 pt-20 sm:pt-24 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:gap-12 lg:pb-12 lg:pt-24">
                    {/* LEFT — static, GPU-focused. The tensor cycles
                        through formations on the right, but the pitch
                        here doesn't shift — GPU is the main subject. */}
                    <div className="relative max-w-[600px]">
                        <div className="flex items-center gap-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/55">
                            <span className="relative flex h-1.5 w-1.5">
                                <span
                                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                                    style={{ background: BRAND }}
                                />
                                <span
                                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                                    style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }}
                                />
                            </span>
                            <span>Ahura Cloud</span>
                        </div>

                        <h1 className="mt-6 max-w-[680px] text-[44px] font-semibold leading-[0.95] tracking-[-0.045em] text-white sm:text-6xl lg:text-[80px]">
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
                                className="group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-none border border-white/85 bg-white px-6 text-[13.5px] font-semibold text-black transition-colors hover:bg-white/90"
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
                    <div className="relative h-[280px] w-full sm:h-[420px] md:h-[480px] lg:h-full lg:min-h-[520px]">
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
                            src="/herof.png"
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

            <GpuPricingRail />
        </section>
    );
}
