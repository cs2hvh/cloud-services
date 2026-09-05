"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { PublicStock } from "@/lib/catalog/gpu";
import type { HeroTone } from "@/lib/marketing/hero-announcements";
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

export type HeroAd = {
    eyebrow: string;
    /** Two lines, joined with \n. */
    title: string;
    body: string;
    primary: { label: string; href: string };
    secondary: { label: string; href: string } | null;
    tone: HeroTone;
};

export type HeroTile = { eyebrow: string; value: string; href: string; tone: HeroTone };

/**
 * Drop the supplied background render here and the CSS scaffold behind it
 * (grid + horizon + blue wash) becomes the fallback that shows through its
 * transparent areas. Leave it null to run on the scaffold alone — the layout
 * is identical either way, so swapping it in changes nothing structurally.
 */
const HERO_BG: string | null = null;

const TONE_COLOR: Record<HeroTone, string> = {
    green: "var(--ah-green)",
    amber: "var(--ah-amber)",
    grey: "var(--ah-body)",
};

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

/**
 * The announcement plate. One item at a time; the progress bar at its foot
 * IS the timer (the same pattern as the platform explorer): the bar's
 * `animationend` advances the plate, so pausing the bar on hover pauses the
 * rotation, and under prefers-reduced-motion the animation is removed, the
 * event never fires, and the plate simply stays on the first item.
 */
function AdPlate({ ads, seconds }: { ads: HeroAd[]; seconds: number }) {
    const [index, setIndex] = useState(0);
    const advance = useCallback(() => setIndex((i) => (i + 1) % ads.length), [ads.length]);
    const ad = ads[index] ?? ads[0];
    const [line1, line2] = ad.title.split("\n");

    return (
        <div className="ah-ad ah-rise-in relative flex flex-col justify-between gap-8 p-8 sm:p-10" style={{ animationDelay: ".18s" }}>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: TONE_COLOR[ad.tone] }} />
                    <span className="ah-lbl" style={{ fontSize: "10px", letterSpacing: "0.16em", color: TONE_COLOR[ad.tone] }}>
                        {ad.eyebrow.toUpperCase()}
                    </span>
                </div>
                <h2 key={ad.title} className="ah-ad-title m-0" style={{ color: "var(--ah-ink)" }}>
                    <span className="block">{line1}</span>
                    {line2 && <span className="block">{line2}</span>}
                </h2>
                <p className="m-0 max-w-[30rem] text-[clamp(1rem,1.3vw,1.125rem)] leading-[1.45]" style={{ color: "var(--ah-body)" }}>
                    {ad.body}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Link href={ad.primary.href} className="ah-ad-act ah-ad-act-primary">
                    {ad.primary.label}
                </Link>
                {ad.secondary && (
                    <Link href={ad.secondary.href} className="ah-ad-act">
                        {ad.secondary.label}
                    </Link>
                )}
                {ads.length > 1 && (
                    <div className="ml-auto flex items-center gap-2" role="tablist" aria-label="Announcements">
                        {ads.map((a, i) => (
                            <button
                                key={a.eyebrow + i}
                                type="button"
                                role="tab"
                                aria-selected={i === index}
                                aria-label={a.eyebrow}
                                onClick={() => setIndex(i)}
                                className="ah-ad-dot"
                                style={{ background: i === index ? "var(--ah-ink)" : "var(--ah-line-hi)" }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {ads.length > 1 && (
                <span
                    key={index}
                    aria-hidden="true"
                    className="ah-ad-progress"
                    style={{ animationDuration: `${seconds}s` }}
                    onAnimationEnd={(e) => {
                        if (e.animationName === "ah-topic-progress") advance();
                    }}
                />
            )}
        </div>
    );
}

export default function HeroClient({
    gpus,
    ads,
    adSeconds,
    tiles,
    offer,
}: {
    gpus: GpuRow[];
    ads: HeroAd[];
    adSeconds: number;
    tiles: HeroTile[];
    offer: { label: string; href: string } | null;
}) {
    return (
        <div className="ah-type">
            <section
                className="ah-hero ah-hero--split relative isolate flex w-full flex-col justify-end overflow-hidden"
                aria-label="AhuraSense AI cloud"
            >
                {/* ── background ─────────────────────────────────────────────
                    The lattice sits where it always did, weighted behind the
                    right half; the vignette's left falloff keeps the plate on
                    near-black. Every layer is pointer-events-none. */}
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

                {/* flex-1: the row takes the space between the navbar and the
                    rail, and items-center puts both columns in the middle of it. */}
                <div className="relative z-10 mx-auto flex-1 grid w-full max-w-[1800px] gap-8 px-6 pb-8 pt-20 sm:px-10 lg:grid-cols-[7fr_5fr] lg:items-center lg:gap-12 lg:px-12 lg:pb-10 lg:pt-24">
                    {/* ── left: what is new, one item at a time ────────────── */}
                    {ads.length > 0 && <AdPlate ads={ads} seconds={adSeconds} />}

                    {/* ── right: the two actions, a little below the plate's centre ── */}
                    <div className="flex flex-col justify-center gap-7 lg:items-start lg:pt-24">
                        <div className="ah-rise-in flex flex-wrap items-center gap-5" style={{ animationDelay: ".46s" }}>
                            <div className="ah-hero-actions inline-flex shrink-0">
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
                            {offer && (
                                <Link href={offer.href} className="ah-lbl ah-offer whitespace-nowrap px-2.5 py-[5px]" style={{ fontSize: "10.5px", letterSpacing: "0.06em" }}>
                                    {offer.label}
                                </Link>
                            )}
                        </div>

                        {/* two more things worth knowing, smaller */}
                        {tiles.length > 0 && (
                            <div className={`ah-rise-in grid gap-3 ${tiles.length > 1 ? "sm:grid-cols-2" : ""}`} style={{ animationDelay: ".66s" }}>
                                {tiles.map((t) => (
                                    <Link key={t.href} href={t.href} className="ah-tile flex flex-col gap-2 p-4">
                                        <span className="ah-lbl" style={{ fontSize: "9px", letterSpacing: "0.14em", color: TONE_COLOR[t.tone] }}>
                                            {t.eyebrow.toUpperCase()}
                                        </span>
                                        <span className="text-[15px] leading-[1.4]" style={{ color: "var(--ah-ink)" }}>
                                            {t.value}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            {/* ── GPU rail ── inside the hero, so the lattice and the vignette
                run behind it and hero and rail read as one surface rather
                than two stacked sections. */}
            {gpus.length > 0 && (
                <div className="ah-rail relative z-10">
                    <div className="mx-auto w-full max-w-[1800px] px-6 pb-6 pt-2 sm:px-10 lg:px-12">
                        <div
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
                            style={{ border: "1px solid var(--ah-line-hi)", background: "rgba(7, 7, 10, 0.55)" }}
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
                                            background: "transparent",
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
                                style={{ background: "transparent", color: "var(--ah-ink)" }}
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
            </section>
        </div>
    );
}
