"use client";

import Image from "next/image";
import Link from "next/link";
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

export type HeroAnnouncement = { label: string; href: string; tone: HeroTone };

/** Each figure is null when it could not be read, and is then not shown. */
export type HeroStats = { models: number | null; gpus: number | null; regions: number };

/**
 * Drop the supplied background render here and the CSS scaffold behind it
 * (grid + horizon + blue wash) becomes the fallback that shows through its
 * transparent areas. Leave it null to run on the scaffold alone — the layout
 * is identical either way, so swapping it in changes nothing structurally.
 */
const HERO_BG: string | null = null;

/**
 * "Run any model. / Own your cloud." replaced "Your cloud, / On demand." on
 * 2026-09-05: the platform is an inference API and GPU cloud first, and the
 * old line said nothing about AI. The second line stays outlined.
 */
const HEADLINE: string[][] = [
    ["Run", "any", "model."],
    ["Own", "your", "cloud."],
];

const TONE_DOT: Record<HeroTone, string> = {
    green: "var(--ah-green)",
    amber: "var(--ah-amber)",
    grey: "var(--ah-line-hi)",
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

function ArrowOut() {
    return (
        <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M3.5 10.5 10.5 3.5M5 3.5h5.5V9" />
        </svg>
    );
}

export default function HeroClient({
    gpus,
    announcements,
    offer,
    stats,
    featuredModelId,
    modelsLive,
}: {
    gpus: GpuRow[];
    announcements: HeroAnnouncement[];
    offer: { label: string; href: string } | null;
    stats: HeroStats;
    featuredModelId: string;
    modelsLive: number | null;
}) {
    const statLine = [
        stats.models !== null ? `${stats.models} models` : null,
        stats.gpus !== null ? `${stats.gpus} GPU SKUs` : null,
        `${stats.regions} regions`,
    ].filter((s): s is string => s !== null);

    return (
        <div className="ah-type">
            {/* ── what's new ─────────────────────────────────────────────
                Three curated items (lib/marketing/hero-announcements.ts) with
                live figures resolved by the server component, and one offer
                chip when an offer is set. A page that never changes reads as
                abandoned; this bar is the one place it visibly moves. */}
            {(announcements.length > 0 || offer) && (
                // The navbar is fixed and overlays the top of the page, so the
                // bar starts below it rather than under it.
                <div className="ah-news relative z-10" style={{ marginTop: "var(--ah-nav-h, 56px)" }}>
                    <div className="mx-auto flex h-10 w-full max-w-[1800px] items-center gap-7 px-6 sm:px-10 lg:px-12">
                        <span className="ah-lbl shrink-0" style={{ fontSize: "9.5px", letterSpacing: "0.16em", color: "var(--ah-blue-lt)" }}>
                            WHAT&#39;S NEW
                        </span>
                        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-7 overflow-x-auto">
                            {announcements.map((a) => (
                                <Link key={a.href + a.label} href={a.href} className="ah-news-item inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px]">
                                    <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: TONE_DOT[a.tone] }} />
                                    {a.label}
                                    <ArrowOut />
                                </Link>
                            ))}
                        </div>
                        {offer ? (
                            <Link href={offer.href} className="ah-lbl ah-offer hidden shrink-0 whitespace-nowrap px-2.5 py-[5px] sm:inline-block" style={{ fontSize: "10.5px", letterSpacing: "0.06em" }}>
                                {offer.label}
                            </Link>
                        ) : process.env.NODE_ENV !== "production" ? (
                            <span className="ah-lbl ah-offer-slot hidden shrink-0 whitespace-nowrap px-2.5 py-[5px] sm:inline-block" style={{ fontSize: "10.5px", letterSpacing: "0.06em" }}>
                                Offer slot: set HERO_OFFER
                            </span>
                        ) : null}
                    </div>
                </div>
            )}

            <section
                className="ah-hero relative isolate flex w-full flex-col justify-end overflow-hidden"
                aria-label="AhuraSense AI cloud"
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
                                    <span className="ah-word" style={{ animationDelay: `${0.32 + i * 0.09}s` }}>
                                        {w}
                                    </span>
                                </span>
                            ))}
                        </span>
                    </h1>

                    {/* lede + actions on the left, the API itself on the right */}
                    <div className="mt-10 grid gap-8 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-end lg:gap-16">
                        <div className="flex min-w-0 flex-col gap-6">
                            <div className="ah-hero-lede ah-rise-in" style={{ animationDelay: ".46s" }}>
                                <p
                                    className="m-0 max-w-[34rem] text-[clamp(1.05rem,1.7vw,1.4rem)] leading-[1.4]"
                                    style={{ color: "var(--ah-ink)" }}
                                >
                                    An OpenAI-compatible inference API with production models, Blackwell
                                    and Hopper GPUs by the hour, fine-tuning, vector search, and the
                                    compute, Kubernetes and storage to run all of it.
                                </p>
                                <p className="mt-4 max-w-[32rem] text-[13.5px] leading-[1.65]" style={{ color: "var(--ah-body)" }}>
                                    One control plane across {stats.regions} regions, billed by the hour.
                                    Bring a model, a repo or a container; idle resources cost you nothing.
                                </p>
                            </div>

                            <div className="ah-rise-in flex flex-wrap items-center gap-6" style={{ animationDelay: ".56s" }}>
                                <div className="ah-hero-actions inline-flex shrink-0">
                                    <Link href="/signup" className="ah-hero-act">
                                        Get started
                                        <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                                            <path d="M3.5 10.5 10.5 3.5M5 3.5h5.5V9" />
                                        </svg>
                                    </Link>
                                    <Link href="/dashboard/services/inference" className="ah-hero-act ah-hero-act-alt">
                                        Try the API
                                        <svg viewBox="0 0 20 14" width="16" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                            <path d="M1 7h16M12.5 2.5 17 7l-4.5 4.5" />
                                        </svg>
                                    </Link>
                                </div>
                                <div className="ah-lbl flex gap-[18px] whitespace-nowrap" style={{ fontSize: "10px", letterSpacing: "0.14em", color: "var(--ah-muted)" }}>
                                    {statLine.map((s) => (
                                        <span key={s}>{s.toUpperCase()}</span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ── the API, shown rather than described ──────────── */}
                        <div className="ah-api ah-rise-in flex min-w-0 flex-col" style={{ animationDelay: ".6s" }}>
                            <div className="flex items-center justify-between gap-3 px-[18px] py-3" style={{ borderBottom: "1px solid var(--ah-line)" }}>
                                <span className="ah-lbl truncate" style={{ fontSize: "10.5px", letterSpacing: "0.08em", color: "var(--ah-body)", textTransform: "none" }}>
                                    api.ahurasense.com/v1 · OpenAI-compatible
                                </span>
                                {modelsLive !== null && (
                                    <span className="inline-flex shrink-0 items-center gap-[7px]">
                                        <span className="relative inline-flex h-1.5 w-1.5">
                                            <span className="ah-ping absolute inset-0 rounded-full" style={{ background: "var(--ah-green)" }} />
                                            <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: "var(--ah-green)" }} />
                                        </span>
                                        <span className="ah-lbl" style={{ fontSize: "9.5px", letterSpacing: "0.14em", color: "var(--ah-body)" }}>
                                            {modelsLive} MODELS LIVE
                                        </span>
                                    </span>
                                )}
                            </div>
                            <pre className="ah-code m-0 overflow-hidden whitespace-pre-wrap break-all px-[18px] pb-[22px] pt-5 text-[11px] leading-[1.6] lg:whitespace-pre lg:break-normal lg:text-[12.5px]" style={{ color: "var(--ah-ink)" }}>
                                <span className="ah-api-dim">curl</span>{" https://api.ahurasense.com/v1/chat/completions \\\n"}
                                {"  -H "}<span className="ah-api-str">{'"Authorization: Bearer $AHURA_API_KEY"'}</span>{" \\\n"}
                                {"  -d "}<span className="ah-api-str">{`'{\n    "model": "${featuredModelId}",\n    "messages": [{"role": "user",\n      "content": "Summarise this report."}],\n    "stream": true\n  }'`}</span>
                            </pre>
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-[18px] py-3" style={{ borderTop: "1px solid var(--ah-line)" }}>
                                <div className="ah-lbl flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap" style={{ fontSize: "9.5px", letterSpacing: "0.14em", color: "var(--ah-muted)" }}>
                                    <span style={{ color: "var(--ah-ink)" }}>CHAT</span>
                                    <span>FINE-TUNING</span>
                                    <span>VECTOR STORES</span>
                                    <span>AGENTS</span>
                                </div>
                                <Link href="/docs" className="ah-lbl shrink-0 whitespace-nowrap" style={{ fontSize: "10px", letterSpacing: "0.12em", color: "var(--ah-blue-lt)" }}>
                                    API DOCS →
                                </Link>
                            </div>
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
        </div>
    );
}
