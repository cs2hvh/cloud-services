"use client";

import Image from "next/image";
import Link from "next/link";
import type { PublicStock } from "@/lib/catalog/gpu";
import { HeroLattice } from "@/components/hero/hero-lattice";

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

/**
 * Drop the supplied background render here and the CSS scaffold behind it
 * (grid + horizon + blue wash) becomes the fallback that shows through its
 * transparent areas. Leave it null to run on the scaffold alone — the layout
 * is identical either way, so swapping it in changes nothing structurally.
 */
const HERO_BG: string | null = null;

const HEADLINE: string[][] = [
    ["Your", "cloud,"],
    ["On", "demand."],
];

/** Region count is stated once and reused, rather than restated per section. */
const REGIONS = 15;

/**
 * Catalog names arrive as "H200 SXM (141 GB)". The rail prints memory in its
 * own column, so the parenthetical is dropped to avoid saying it twice.
 */
function shortName(name: string): string {
    return name.replace(/\s*\(\s*\d+\s*GB\s*\)\s*$/i, "").trim();
}

/**
 * Stock shows as a dot plus one word, and ONLY when the catalog actually knows.
 * A reading older than STOCK_FRESHNESS_MS collapses to "unknown" so a stale
 * "In stock" never sends someone into a deploy that will fail — and in that
 * case the card says nothing rather than printing an identical grey
 * placeholder on every card, which made a working rail look broken.
 */
function stockLabel(stock: PublicStock): { text: string; dot: string } | null {
    switch (stock) {
        case "available":
            return { text: "Available", dot: "var(--ah-green)" };
        case "limited":
            return { text: "Limited", dot: "var(--ah-amber)" };
        case "unavailable":
            return { text: "Waitlist", dot: "var(--ah-muted)" };
        default:
            return null;
    }
}

export default function HeroClient({ gpus }: { gpus: GpuRow[] }) {
    return (
        <>
            <section
                className="ah-hero relative isolate flex w-full flex-col justify-end overflow-hidden"
                aria-label="AhuraSense cloud infrastructure"
            >
                {/* ── background ─────────────────────────────────────────────
                    Scaffold now, photograph later. Every layer sits behind the
                    content and is pointer-events-none. */}
                {HERO_BG && (
                    <Image
                        src={HERO_BG}
                        alt=""
                        fill
                        priority
                        sizes="100vw"
                        aria-hidden="true"
                        className="absolute inset-0 -z-10 object-cover"
                    />
                )}
                <HeroLattice />
                <span aria-hidden="true" className="ah-hero-vignette" />

                <div className="relative mx-auto flex w-full max-w-[1800px] flex-col px-6 pb-10 pt-16 sm:px-10 lg:px-12 lg:pb-12 lg:pt-20">
                    {/*
                      Solid line over an outlined one. Each word is its own
                      inline-block so it can rise independently on load — the
                      stagger is what gives the line depth rather than having
                      the whole heading fade in as one flat plate.
                    */}
                    <h1 className="ah-hero-h1 m-0">
                        <span className="block">
                            {HEADLINE[0].map((w, i) => (
                                <span key={w} className="ah-word-wrap">
                                    <span className="ah-word" style={{ animationDelay: `${0.06 + i * 0.09}s` }}>
                                        {w}
                                    </span>
                                </span>
                            ))}
                        </span>
                        <span className="ah-hero-outline block">
                            {HEADLINE[1].map((w, i) => (
                                <span key={w} className="ah-word-wrap">
                                    <span className="ah-word" style={{ animationDelay: `${0.26 + i * 0.09}s` }}>
                                        {w}
                                    </span>
                                </span>
                            ))}
                        </span>
                    </h1>

                    <div className="mt-10 grid gap-8 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
                        <div className="ah-hero-lede ah-rise-in" style={{ animationDelay: ".46s" }}>
                            <p
                                className="m-0 max-w-[34rem] text-[clamp(1.05rem,1.7vw,1.4rem)] leading-[1.4]"
                                style={{ color: "var(--ah-ink)" }}
                            >
                                Compute, GPUs, databases, Kubernetes, and storage, provisioned
                                in seconds, billed by the second.
                            </p>
                            <p
                                className="mt-4 max-w-[32rem] text-[13.5px] leading-[1.65]"
                                style={{ color: "var(--ah-body)" }}
                            >
                                Spin up a single instance or scale to thousand-GPU clusters
                                across {REGIONS} regions. Persistent state follows your
                                workloads; idle resources cost you nothing.
                            </p>
                        </div>

                        <div className="ah-hero-actions ah-rise-in inline-flex shrink-0" style={{ animationDelay: ".56s" }}>
                            <Link href="/signup" className="ah-hero-act">
                                Get started
                                <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                                    <path d="M3.5 10.5 10.5 3.5M5 3.5h5.5V9" />
                                </svg>
                            </Link>
                            <Link href="/pricing" className="ah-hero-act ah-hero-act-alt">
                                View pricing
                                <svg viewBox="0 0 20 14" width="16" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                    <path d="M1 7h16M12.5 2.5 17 7l-4.5 4.5" />
                                </svg>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── GPU rail — unchanged ── */}
            {gpus.length > 0 && (
                <div style={{ background: "var(--ah-bg)" }}>
                    <div className="mx-auto w-full max-w-[1800px] px-6 pb-4 pt-5 sm:px-10 lg:px-12">
                        <div
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
                            style={{ border: "1px solid var(--ah-line-hi)", background: "var(--ah-elev)" }}
                        >
                            {gpus.map((gpu, i) => {
                                const s = stockLabel(gpu.stock);
                                // Every card rests the same way now — the first one no longer
                                // carries a standing cream fill. Emphasis comes from hover
                                // (see .ah-gpu:hover), which all four share.
                                const meta = "var(--ah-body)";
                                return (
                                    <Link
                                        key={gpu.id}
                                        href={gpu.href}
                                        className="ah-gpu group relative px-7 py-6"
                                        style={{
                                            background: "var(--ah-elev)",
                                            color: "var(--ah-ink)",
                                            borderRight: "1px solid var(--ah-line)",
                                        }}
                                    >
                                        <span aria-hidden="true" className="ah-gpu-line" />

                                        <div className="mb-3 flex items-center gap-2.5">
                                            <span className="ah-lbl" style={{ fontSize: "9.5px", color: "#55555f" }}>
                                                {String(i + 1).padStart(2, "0")}
                                            </span>
                                            <span className="ah-lbl truncate" style={{ fontSize: "9.5px", letterSpacing: "0.12em", color: meta }}>
                                                {gpu.tier} · {gpu.memory} GB
                                            </span>
                                            {s && (
                                                <span className="ml-auto inline-flex items-center gap-1.5" title={s.text}>
                                                    <span className="relative inline-flex h-1.5 w-1.5">
                                                        <span className="ah-ping absolute inset-0 rounded-full" style={{ background: s.dot }} />
                                                        <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
                                                    </span>
                                                    <span className="ah-lbl" style={{ fontSize: "9px", letterSpacing: "0.14em", color: meta }}>
                                                        {s.text}
                                                    </span>
                                                </span>
                                            )}
                                        </div>

                                        <div className="mb-4 truncate text-[1.4rem] font-normal tracking-[-0.02em]">
                                            {shortName(gpu.name)}
                                        </div>

                                        <div className="flex items-baseline gap-1.5">
                                            <span className="ah-lbl" style={{ fontSize: "9px", letterSpacing: "0.16em", color: meta }}>
                                                From
                                            </span>
                                            <span className="ah-gpu-price text-[1.7rem] font-normal leading-none tracking-[-0.03em] tabular-nums">
                                                {gpu.price === null ? "N/A" : `$${gpu.price.toFixed(2)}`}
                                            </span>
                                            <span className="ah-lbl" style={{ fontSize: "9.5px", color: meta }}>
                                                /hr/gpu
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })}

                            <Link
                                href="/services/gpu"
                                className="ah-gpu-all group flex items-center justify-center gap-3 px-7 py-6 lg:flex-col lg:justify-center lg:gap-3 lg:px-8"
                                style={{ background: "var(--ah-elev)", color: "var(--ah-ink)" }}
                                aria-label="View all GPUs"
                            >
                                <span className="ah-gpu-all-ic inline-flex h-9 w-9 items-center justify-center">
                                    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                                        <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
                                    </svg>
                                </span>
                                <span className="ah-lbl whitespace-nowrap lg:text-center" style={{ fontSize: "9.5px", letterSpacing: "0.14em" }}>
                                    View all
                                    <br className="hidden lg:inline" /> GPUs
                                </span>
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
