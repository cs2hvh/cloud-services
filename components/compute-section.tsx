"use client";

// ComputeSection — three-tier compute lineup (Shared VPS, Dedicated CPU,
// Bare Metal) with hero illustration on the right and silicon partner
// strip at the bottom. Same brand-blue PixelBlast ambient backdrop as
// the homepage hero so the section feels continuous.

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import PixelBlast from "@/components/hero/pixel-blast";

const BRAND = "#0095FF";
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Tier = {
    index: string;
    label: string;
    title: string;
    desc: string;
    specs: Array<[string, string]>;
    startsAt: string;
    period: string;
    cta: string;
    href: string;
    featured?: boolean;
};

const TIERS: Tier[] = [
    {
        index: "01",
        label: "Shared",
        title: "General purpose",
        desc: "Balanced CPU and memory on shared hosts. Sub-minute provisioning.",
        specs: [
            ["vCPU", "1 – 128"],
            ["Memory", "1 GB – 1 TB"],
            ["Storage", "25 GB – 4 TB NVMe"],
            ["Network", "Up to 25 Gbps"],
        ],
        startsAt: "$4",
        period: "/mo",
        cta: "Launch instance",
        href: "/dashboard/services/compute/vps",
    },
    {
        index: "02",
        label: "Dedicated",
        title: "Compute optimized",
        desc: "Pinned CPU cores. Consistent latency for production traffic.",
        specs: [
            ["vCPU", "2 – 128 dedicated"],
            ["Memory", "4 GB – 1 TB"],
            ["Storage", "80 GB – 8 TB NVMe"],
            ["Network", "Up to 50 Gbps"],
        ],
        startsAt: "$32",
        period: "/mo",
        cta: "Launch dedicated",
        href: "/dashboard/services/compute/vps?type=dedicated",
        featured: true,
    },
    {
        index: "03",
        label: "Bare metal",
        title: "Dedicated Server",
        desc: "Full physical server, no hypervisor. Run your own kernel for HPC or regulated workloads.",
        specs: [
            ["CPU", "32 – 192 cores"],
            ["Memory", "128 GB – 2 TB DDR5"],
            ["Storage", "1 TB – 60 TB NVMe"],
            ["Network", "100 Gbps redundant"],
        ],
        startsAt: "$499",
        period: "/mo",
        cta: "Talk to sales",
        href: "/dashboard/services/compute/bare-metal",
    },
];

function TierCard({ tier }: { tier: Tier }) {
    const isFeatured = !!tier.featured;
    return (
        <Link
            href={tier.href}
            className={`group relative flex flex-col gap-5 rounded-[8px] border bg-[#0a0c10]/85 p-6 backdrop-blur-md transition-all duration-200 hover:-translate-y-1 sm:p-7 ${
                isFeatured
                    ? "border-white/[0.14] hover:border-white/[0.22]"
                    : "border-white/[0.08] hover:border-white/[0.20]"
            }`}
            style={{
                boxShadow: isFeatured
                    ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 26px -10px rgba(0,0,0,0.7)"
                    : "inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 22px -8px rgba(0,0,0,0.6)",
            }}
        >
            {/* Blue left accent line — appears only on hover */}
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-[2px] rounded-l-[8px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{ background: BRAND }}
            />

            {/* Header — index + label + (optional) flag */}
            <div className="flex items-center gap-3">
                <span
                    className={`${MONO} text-[10.5px] tabular-nums text-white/35`}
                >
                    {tier.index}
                </span>
                <span
                    className={`${MONO} text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/65`}
                >
                    {tier.label}
                </span>
                {isFeatured && (
                    <span
                        className={`${MONO} ml-auto inline-flex items-center rounded-[3px] border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/70`}
                    >
                        Most popular
                    </span>
                )}
            </div>

            {/* Title + description */}
            <div>
                <h3 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-white">
                    {tier.title}
                </h3>
                <p className="mt-2.5 text-[13px] leading-[1.55] text-white/55">
                    {tier.desc}
                </p>
            </div>

            {/* Specs */}
            <ul className="space-y-2.5 border-t border-white/[0.06] pt-4">
                {tier.specs.map(([label, value]) => (
                    <li
                        key={label}
                        className="flex items-baseline justify-between gap-3"
                    >
                        <span
                            className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/40`}
                        >
                            {label}
                        </span>
                        <span
                            className={`${MONO} text-right text-[12px] tabular-nums text-white/85`}
                        >
                            {value}
                        </span>
                    </li>
                ))}
            </ul>

            {/* Footer — price + arrow */}
            <div className="mt-auto flex items-end justify-between pt-2">
                <div>
                    <p
                        className={`${MONO} text-[9.5px] font-semibold uppercase tracking-[0.22em] text-white/45`}
                    >
                        From
                    </p>
                    <p
                        className={`${MONO} mt-1 text-[28px] font-bold leading-none tabular-nums text-white`}
                    >
                        {tier.startsAt}
                        <span className="ml-1 text-[12px] font-normal text-white/55">
                            {tier.period}
                        </span>
                    </p>
                </div>
                <span
                    className={`${MONO} inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70 transition-colors group-hover:text-[#0095FF]`}
                >
                    {tier.cta}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
            </div>
        </Link>
    );
}

export function ComputeSection() {
    return (
        <section className="relative z-10 overflow-hidden bg-[#04060a] py-16 lg:py-24">
            {/* PixelBlast brand-blue ambient backdrop — matches the hero */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 opacity-[0.45]"
            >
                <PixelBlast
                    variant="circle"
                    color={BRAND}
                    pixelSize={5}
                    patternScale={3}
                    patternDensity={0.7}
                    pixelSizeJitter={0.4}
                    enableRipples={false}
                    speed={0.3}
                    edgeFade={0.4}
                    transparent
                />
            </div>

            {/* Top hairline — visual separator from previous section */}
            <div
                aria-hidden="true"
                className="absolute top-0 left-1/2 z-10 h-px w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/12 to-transparent"
            />

            <Container className="relative z-10">
                {/* Header — text + hero illustration side by side */}
                <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_minmax(0,1fr)] lg:gap-16">
                    {/* LEFT — copy */}
                    <div>
                        <h2 className="text-4xl font-[400] leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                            Compute that scales
                            <br />
                            <span className="text-white/55">to your </span>
                            <span style={{ color: BRAND }}>workload</span>
                            <span className="text-white/85">.</span>
                        </h2>
                        <p className="mt-6 max-w-[480px] text-[15px] leading-[1.65] text-white/60 sm:text-[16px]">
                            Shared, dedicated, or bare metal — provisioned in seconds and billed by the second.
                        </p>

                        {/* Powered-by silicon strip */}
                        <div className="mt-7 flex items-center gap-5">
                            <span
                                className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40`}
                            >
                                Powered by
                            </span>
                            <span
                                className="h-3 w-px bg-white/15"
                                aria-hidden="true"
                            />
                            <div className="relative h-5 w-12 shrink-0">
                                <Image
                                    src="/images/compute-page/intel.png"
                                    alt="Intel"
                                    fill
                                    className="object-contain opacity-80"
                                    sizes="48px"
                                />
                            </div>
                            <div className="relative h-5 w-12 shrink-0 bg-white border border-white/10 rounded-[4px] px-0.5">
                                <Image
                                    src="/images/compute-page/amd.png"
                                    alt="AMD Ryzen"
                                    fill
                                    className="object-contain opacity-80 "
                                    sizes="48px"
                                />
                            </div>
                        </div>
                    </div>

                    {/* RIGHT — hero illustration */}
                    <div className="relative mx-auto h-[260px] w-full max-w-[480px] sm:h-[320px] lg:h-[360px]">
                        {/* Soft halo behind the illustration */}
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0"
                            style={{
                                background:
                                    "radial-gradient(ellipse 65% 60% at 50% 55%, rgba(0,149,255,0.20), transparent 70%)",
                                filter: "blur(40px)",
                            }}
                        />
                        <div className="cs-float relative h-full w-full">
                            <Image
                                src="/COMPUTE_YOUR_WAY.png"
                                alt="Compute infrastructure"
                                fill
                                className="object-contain"
                                style={{
                                    filter:
                                        "drop-shadow(0 30px 40px rgba(0,0,0,0.6)) drop-shadow(0 0 28px rgba(0,149,255,0.18))",
                                }}
                                sizes="(min-width: 1024px) 480px, (min-width: 640px) 70vw, 90vw"
                                priority={false}
                            />
                        </div>
                    </div>
                </div>

                {/* Tier cards */}
                <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
                    {TIERS.map((tier) => (
                        <TierCard key={tier.index} tier={tier} />
                    ))}
                </div>

                {/* Footer meta */}
                <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-6">
                    <p
                        className={`${MONO} text-[10.5px] uppercase tracking-[0.18em] text-white/45`}
                    >
                        12 regions · hourly + monthly billing · API-first
                    </p>
                    <Link
                        href="/services/compute"
                        className={`${MONO} group inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/65 transition-colors hover:text-[#0095FF]`}
                    >
                        Compare all compute plans
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </Container>

            <style jsx>{`
                @keyframes cs-float {
                    0%,
                    100% {
                        transform: translateY(0) rotate(0deg);
                    }
                    50% {
                        transform: translateY(-12px) rotate(0.5deg);
                    }
                }
                .cs-float {
                    animation: cs-float 8s ease-in-out infinite;
                    will-change: transform;
                }
            `}</style>
        </section>
    );
}

export default ComputeSection;
