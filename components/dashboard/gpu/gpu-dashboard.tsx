"use client";

// GPU Cloud — overview. Editorial canvas with hero, stats, featured
// flagship GPU cards (with arch chip + spec grid), workload picker,
// 2-column operational view (recent activity + region availability),
// and the user's active pods. Inventory is fetched once on mount to
// enrich price + stock; the featured list itself is always rendered.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ChevronRight,
    Loader2,
    Plus,
    RefreshCw,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

import { ActivePodsTable } from "./active-pods-table";
import { NvidiaLogo } from "@/components/branding/nvidia-logo";
import type { GpuPodSummaryClient, InventoryRowClient } from "./types";

// ─── Design tokens ────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

const PODS_POLL_FALLBACK_MS = 15_000;
const PODS_REFETCH_DEBOUNCE_MS = 400;

// ─── GPU catalog — static specs + arch + matcher for live enrichment ─

type GpuTier = "blackwell" | "hopper" | "ampere" | "ada";

interface GpuPreset {
    gpuCatalogId: string;
    displayName: string;
    variant?: string; // SXM, NVL, etc
    vendor: string;
    arch: string;
    tier: GpuTier;
    memoryGb: number;
    memoryType: string;
    matcher: string;
    specs: { label: string; value: string }[];
    maxScale: number;
    scaleHint: string;
    priceFallback: number | null;
    featured?: boolean;
    requestOnly?: boolean;
}

const FEATURED_PRESETS: readonly GpuPreset[] = [
    {
        gpuCatalogId: "b300",
        displayName: "B300",
        vendor: "NVIDIA",
        arch: "Blackwell",
        tier: "blackwell",
        memoryGb: 288,
        memoryType: "HBM3e",
        matcher: "b300",
        specs: [
            { label: "FP8 Compute", value: "15 PFLOPS" },
            { label: "Bandwidth", value: "8 TB/s" },
            { label: "NVLink", value: "1.8 TB/s" },
            { label: "TDP", value: "1400 W" },
        ],
        maxScale: 8,
        scaleHint: "NVLink fabric",
        priceFallback: null,
        requestOnly: true,
    },
    {
        gpuCatalogId: "b200",
        displayName: "B200",
        vendor: "NVIDIA",
        arch: "Blackwell",
        tier: "blackwell",
        memoryGb: 192,
        memoryType: "HBM3e",
        matcher: "b200",
        specs: [
            { label: "FP8 Compute", value: "10 PFLOPS" },
            { label: "Bandwidth", value: "8 TB/s" },
            { label: "NVLink", value: "1.8 TB/s" },
            { label: "TDP", value: "1000 W" },
        ],
        maxScale: 8,
        scaleHint: "SXM cluster",
        priceFallback: 5.89,
        featured: true,
    },
    {
        gpuCatalogId: "h200",
        displayName: "H200",
        variant: "NVL",
        vendor: "NVIDIA",
        arch: "Hopper",
        tier: "hopper",
        memoryGb: 141,
        memoryType: "HBM3e",
        matcher: "h200",
        specs: [
            { label: "FP8 Compute", value: "3958 TFLOPS" },
            { label: "Bandwidth", value: "4.8 TB/s" },
            { label: "NVLink", value: "900 GB/s" },
            { label: "TDP", value: "700 W" },
        ],
        maxScale: 8,
        scaleHint: "NVL pairs",
        priceFallback: 4.49,
    },
    {
        gpuCatalogId: "h100",
        displayName: "H100",
        variant: "SXM",
        vendor: "NVIDIA",
        arch: "Hopper",
        tier: "hopper",
        memoryGb: 80,
        memoryType: "HBM3",
        matcher: "h100",
        specs: [
            { label: "FP8 Compute", value: "3958 TFLOPS" },
            { label: "Bandwidth", value: "3.35 TB/s" },
            { label: "NVLink", value: "900 GB/s" },
            { label: "TDP", value: "700 W" },
        ],
        maxScale: 8,
        scaleHint: "NVLink cluster",
        priceFallback: 3.29,
    },
    {
        gpuCatalogId: "a100",
        displayName: "A100",
        variant: "SXM",
        vendor: "NVIDIA",
        arch: "Ampere",
        tier: "ampere",
        memoryGb: 80,
        memoryType: "HBM2e",
        matcher: "a100",
        specs: [
            { label: "BF16 Compute", value: "312 TFLOPS" },
            { label: "Bandwidth", value: "2 TB/s" },
            { label: "NVLink", value: "600 GB/s" },
            { label: "TDP", value: "400 W" },
        ],
        maxScale: 8,
        scaleHint: "NVLink",
        priceFallback: 1.89,
    },
    {
        gpuCatalogId: "l40s",
        displayName: "L40S",
        vendor: "NVIDIA",
        arch: "Ada Lovelace",
        tier: "ada",
        memoryGb: 48,
        memoryType: "GDDR6",
        matcher: "l40s",
        specs: [
            { label: "FP8 Compute", value: "733 TFLOPS" },
            { label: "Bandwidth", value: "864 GB/s" },
            { label: "Bus", value: "PCIe Gen4" },
            { label: "TDP", value: "350 W" },
        ],
        maxScale: 8,
        scaleHint: "per pod",
        priceFallback: 1.49,
    },
] as const;

const WORKLOADS = [
    {
        kind: "Training",
        title: "LLM training",
        desc: "Frontier model pretraining and large-scale fine-tunes. High memory and bandwidth are critical.",
        recommended: "8× B200 or H200",
        href: "/dashboard/services/gpu/deploy?workload=training",
    },
    {
        kind: "Fine-tune",
        title: "Fine-tuning",
        desc: "LoRA, QLoRA, and full-parameter fine-tuning of 7B–70B models on your own data.",
        recommended: "1–4× H100 SXM",
        href: "/dashboard/services/gpu/deploy?workload=finetune",
    },
    {
        kind: "Inference",
        title: "Inference serving",
        desc: "High-throughput LLM and embedding serving with vLLM, TGI, or TensorRT-LLM.",
        recommended: "L40S or H200 NVL",
        href: "/dashboard/services/gpu/deploy?workload=inference",
    },
    {
        kind: "Diffusion",
        title: "Diffusion & video",
        desc: "Stable Diffusion XL, FLUX, SVD, and other generative image/video workloads.",
        recommended: "L40S or A100",
        href: "/dashboard/services/gpu/deploy?workload=diffusion",
    },
] as const;

// ─── Component ────────────────────────────────────────────────────

export default function GpuDashboard() {
    const [pods, setPods] = useState<GpuPodSummaryClient[]>([]);
    const [podsLoading, setPodsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [inventory, setInventory] = useState<InventoryRowClient[]>([]);
    const supabase = createClient();
    const podsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // One-shot inventory fetch — used purely to enrich featured cards with
    // current pricing. No realtime, no polling.
    const loadInventory = useCallback(async () => {
        try {
            const res = await fetch("/api/services/gpu/inventory", { cache: "no-store" });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json.ok) {
                setInventory(json.inventory as InventoryRowClient[]);
            }
        } catch (err) {
            console.error("[gpu-dashboard] load inventory failed:", err);
        }
    }, []);

    useEffect(() => { loadInventory(); }, [loadInventory]);

    const loadPods = useCallback(async (silent = false) => {
        if (!silent) setPodsLoading(true);
        try {
            const res = await fetch("/api/services/gpu/pods", { cache: "no-store" });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json.ok) setPods(json.pods as GpuPodSummaryClient[]);
        } catch (err) {
            console.error("[gpu-dashboard] load pods failed:", err);
            if (!silent) toast.error("Unable to load pods");
        } finally {
            setPodsLoading(false);
            setRefreshing(false);
        }
    }, []);

    const schedulePodsRefetch = useCallback(() => {
        if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = setTimeout(() => loadPods(true), PODS_REFETCH_DEBOUNCE_MS);
    }, [loadPods]);

    useEffect(() => {
        loadPods(false);
        const t = setInterval(() => loadPods(true), PODS_POLL_FALLBACK_MS);
        return () => clearInterval(t);
    }, [loadPods]);

    useEffect(() => {
        const channel = supabase
            .channel("gpu-pods-dashboard")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "gpu_pods" },
                () => schedulePodsRefetch()
            )
            .subscribe();
        podsChannelRef.current = channel;
        return () => { channel.unsubscribe(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        loadPods(false);
        loadInventory();
    };

    // ── Derived ────────────────────────────────────────────────
    const runningCount = pods.filter((p) => p.status === "running").length;
    const provisioningCount = pods.filter((p) => p.status === "provisioning").length;
    const hourlyBurn = pods
        .filter((p) => p.status === "running" || p.status === "stopped")
        .reduce((sum, p) => sum + (p.hourlyCostUsd || 0), 0);
    const stockedTypes = inventory.filter((i) => i.stockStatus !== "none").length;
    const totalSkus = inventory.length || stockedTypes || FEATURED_PRESETS.length;

    type FeaturedRow = GpuPreset & {
        stockStatus: string;
        onDemandPerHr: number | null;
        availableCounts: number[];
    };
    const featured = useMemo<FeaturedRow[]>(() => {
        const secure = inventory.filter((i) => i.cloudType === "SECURE");
        return FEATURED_PRESETS.map((preset) => {
            const live = secure.find((i) =>
                i.displayName.toLowerCase().includes(preset.matcher),
            );
            return {
                ...preset,
                stockStatus: live?.stockStatus ?? (preset.requestOnly ? "new" : "unknown"),
                onDemandPerHr:
                    live?.onDemandPerHr ?? preset.priceFallback ?? null,
                availableCounts: live?.availableCounts ?? [],
            };
        });
    }, [inventory]);

    return (
        <div>
            {/* ── Hero ─────────────────────────────────────────── */}
            <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-12">
                <div className="max-w-2xl">
                    <h1 className="text-[36px] sm:text-[44px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
                        On-demand{" "}
                        <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">
                            GPUs
                        </span>
                    </h1>
                    <p className={`${MONO} mt-3 max-w-xl text-[11.5px] text-white/45 leading-relaxed`}>
                        Blackwell, Hopper, Ada, and Ampere on demand. Per-second
                        billing, NVLink fabric, and managed persistent storage.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Link
                        href="/dashboard/services/gpu/enterprise"
                        className={`${MONO} h-10 inline-flex items-center gap-2 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                    >
                        Reserved capacity
                    </Link>
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={refreshing}
                        className={`${MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] disabled:opacity-50 rounded-[5px] transition-colors`}
                        title="Refresh inventory"
                    >
                        {refreshing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <RefreshCw className="h-3 w-3" />
                        )}
                    </button>
                    <Link
                        href="/dashboard/services/gpu/deploy"
                        className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                        style={{
                            background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                            color: "#ffffff",
                            boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                            e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                            e.currentTarget.style.transform = "none";
                        }}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Deploy pod
                    </Link>
                </div>
            </header>

            {/* ── Stats — horizontal divider strip ──────────── */}
            <section className="mb-12 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
                <StatCell
                    label="Running"
                    value={String(runningCount)}
                    hint={`${pods.length} total pod${pods.length === 1 ? "" : "s"}`}
                    accent="#4ade80"
                    pulse={runningCount > 0}
                />
                <StatCell
                    label="Provisioning"
                    value={String(provisioningCount)}
                    hint={provisioningCount > 0 ? "Coming online" : "All settled"}
                    accent={ACCENT}
                    pulse={provisioningCount > 0}
                />
                <StatCell
                    label="Hourly burn"
                    value={`$${hourlyBurn.toFixed(2)}`}
                    hint={`≈ $${(hourlyBurn * 730).toFixed(0)}/mo at current usage`}
                />
                <StatCell
                    label="In stock"
                    value={String(stockedTypes || totalSkus)}
                    suffix="SKUs"
                    hint="GPU types deployable now"
                    accent="#a78bfa"
                />
            </section>

            <div className="space-y-14">
                {/* ── Featured GPUs ────────────────────────────────── */}
                <section>
                    <SectionHead
                        eyebrow="Available now"
                        title="Featured"
                        accent="GPUs"
                        link={{
                            label: `Browse all ${totalSkus} SKUs`,
                            href: "/dashboard/services/gpu/deploy",
                        }}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {featured.map((row) => (
                            <FeaturedGpuCard key={row.gpuCatalogId} row={row} />
                        ))}
                    </div>
                </section>

                {/* ── Workload patterns ────────────────────────────── */}
                <section>
                    <SectionHead
                        eyebrow="Not sure which to pick?"
                        title="Choose by"
                        accent="workload"
                        link={{ label: "Read the guide", href: "/dashboard/services/gpu/deploy" }}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        {WORKLOADS.map((w, i) => (
                            <WorkloadCard key={w.title} index={i + 1} {...w} />
                        ))}
                    </div>
                </section>

                {/* ── Active pods ──────────────────────────────────── */}
                <section>
                    <SectionHead
                        eyebrow="Cluster inventory"
                        title="Your"
                        accent="pods"
                        rightMeta={
                            pods.length > 0
                                ? `${runningCount} running · ${pods.length} total`
                                : undefined
                        }
                        link={
                            pods.length > 0
                                ? { label: "Deploy another", href: "/dashboard/services/gpu/deploy" }
                                : undefined
                        }
                    />
                    <ActivePodsTable loading={podsLoading} pods={pods} />
                </section>
            </div>
        </div>
    );
}

// ─── Subcomponents ─────────────────────────────────────────────────

function StatCell({
    label,
    value,
    suffix,
    hint,
    accent,
    pulse,
}: {
    label: string;
    value: string;
    suffix?: string;
    hint?: string;
    accent?: string;
    pulse?: boolean;
}) {
    const dotColor = accent ?? "rgba(255,255,255,0.35)";
    return (
        <div className="px-5 py-5 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
                <span
                    className="relative h-1.5 w-1.5 rounded-full"
                    style={{
                        background: dotColor,
                        boxShadow: accent ? `0 0 6px ${dotColor}` : "none",
                    }}
                >
                    {pulse && (
                        <span
                            className="absolute inset-0 rounded-full animate-ping"
                            style={{ background: dotColor, opacity: 0.6 }}
                        />
                    )}
                </span>
                <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                    {label}
                </span>
            </div>
            <div className="flex items-baseline gap-1">
                <span
                    style={SERIF_STYLE}
                    className="text-[40px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white"
                >
                    {value}
                </span>
                {suffix && (
                    <span
                        style={SERIF_STYLE}
                        className="text-[14px] text-white/45 font-medium"
                    >
                        {suffix}
                    </span>
                )}
            </div>
            {hint && (
                <p className={`${MONO} text-[10.5px] text-white/40 mt-auto`}>{hint}</p>
            )}
        </div>
    );
}

function SectionHead({
    eyebrow,
    title,
    accent,
    link,
    rightMeta,
}: {
    eyebrow: string;
    title: string;
    accent: string;
    link?: { label: string; href: string };
    rightMeta?: string;
}) {
    return (
        <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
            <div>
                <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-1.5`}>
                    {eyebrow}
                </p>
                <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
                    {title}{" "}
                    <span style={SERIF_STYLE} className="text-white/55 font-normal">
                        {accent}
                    </span>
                    <span className="text-white/55 font-normal">.</span>
                </h2>
            </div>
            {link && (
                <Link
                    href={link.href}
                    className={`${MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/50 hover:text-[#0095FF] transition-colors`}
                >
                    {link.label}
                    <ChevronRight className="h-3 w-3" />
                </Link>
            )}
            {rightMeta && (
                <span className={`${MONO} text-[11px] text-white/45 tabular-nums`}>
                    {rightMeta}
                </span>
            )}
        </div>
    );
}

function tierStyles(tier: GpuTier) {
    switch (tier) {
        case "blackwell":
            return {
                color: "#a78bfa",
                background: "rgba(167,139,250,0.06)",
                borderColor: "rgba(167,139,250,0.25)",
                stripe: "linear-gradient(180deg, #0095FF, #a78bfa)",
                cardBg: "linear-gradient(135deg, #111216 0%, rgba(0,149,255,0.04) 100%)",
            };
        case "hopper":
            return {
                color: ACCENT,
                background: ACCENT_DIM,
                borderColor: "rgba(0,149,255,0.25)",
                stripe: ACCENT,
                cardBg: "#111216",
            };
        case "ada":
            return {
                color: "#fbbf24",
                background: "rgba(251,191,36,0.06)",
                borderColor: "rgba(251,191,36,0.25)",
                stripe: "#fbbf24",
                cardBg: "#111216",
            };
        case "ampere":
        default:
            return {
                color: "#4ade80",
                background: "rgba(74,222,128,0.06)",
                borderColor: "rgba(74,222,128,0.25)",
                stripe: "#4ade80",
                cardBg: "#111216",
            };
    }
}

function FeaturedGpuCard({
    row,
}: {
    row: GpuPreset & {
        stockStatus: string;
        onDemandPerHr: number | null;
        availableCounts: number[];
    };
}) {
    const tier = tierStyles(row.tier);
    const stock = stockMeta(row.stockStatus);
    const showPrice = row.onDemandPerHr !== null && !row.requestOnly;

    return (
        <Link
            href={`/dashboard/services/gpu/deploy?gpu=${encodeURIComponent(row.gpuCatalogId)}`}
            className="group relative border rounded-[6px] px-5 py-4 flex flex-col gap-2.5 transition-all overflow-hidden"
            style={
                row.featured
                    ? {
                          borderColor: tier.stripe,
                          background: tier.cardBg,
                          boxShadow: `0 0 0 1px ${tier.stripe}, 0 6px 18px rgba(0,149,255,0.08)`,
                      }
                    : {
                          borderColor: "rgba(255,255,255,0.06)",
                          background: "#111216",
                      }
            }
            onMouseEnter={(e) => {
                if (row.featured) return;
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
                e.currentTarget.style.background = "#16181d";
            }}
            onMouseLeave={(e) => {
                if (row.featured) return;
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                e.currentTarget.style.background = "#111216";
            }}
        >
            {row.featured && (
                <span
                    className="absolute left-0 top-0 bottom-0 w-[2px]"
                    style={{ background: tier.stripe }}
                />
            )}

            {/* Top row: name + variant | stock pill */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <NvidiaLogo width={22} height={16} className="shrink-0 opacity-95" />
                    <div className="flex items-baseline gap-1.5 min-w-0">
                        <span
                            style={SERIF_STYLE}
                            className="text-[20px] font-bold leading-none tracking-[-0.02em] text-white truncate"
                        >
                            {row.displayName}
                        </span>
                        {row.variant && (
                            <span
                                className={`${MONO} text-[10px] text-white/45 font-medium`}
                            >
                                {row.variant}
                            </span>
                        )}
                    </div>
                </div>
                <span
                    className={`${MONO} shrink-0 text-[9px] uppercase tracking-[0.1em] font-semibold inline-flex items-center gap-1`}
                    style={{ color: stock.color }}
                >
                    <span
                        className="h-1 w-1 rounded-full"
                        style={{
                            background: stock.color,
                            boxShadow:
                                stock.color === "#52525b"
                                    ? "none"
                                    : `0 0 5px ${stock.color}`,
                        }}
                    />
                    {stock.label}
                </span>
            </div>

            {/* Meta line: memory + arch */}
            <div
                className={`${MONO} text-[10.5px] text-white/45 flex items-center gap-1.5`}
            >
                <span className="text-white/75 tabular-nums font-medium">
                    {row.memoryGb} GB
                </span>
                <span className="text-white/15">·</span>
                <span>{row.arch}</span>
            </div>

            {/* Footer: price + deploy chip */}
            <div className="mt-1 pt-2.5 border-t border-dashed border-white/[0.06] flex items-center justify-between gap-2">
                {showPrice ? (
                    <div className="flex items-baseline gap-0.5">
                        <span
                            style={SERIF_STYLE}
                            className="text-[12px] text-white/55 font-medium"
                        >
                            $
                        </span>
                        <span
                            style={SERIF_STYLE}
                            className="text-[18px] leading-none font-bold tabular-nums tracking-[-0.02em] text-white"
                        >
                            {row.onDemandPerHr!.toFixed(2)}
                        </span>
                        <span className={`${MONO} ml-0.5 text-[9.5px] text-white/40`}>
                            /GPU·hr
                        </span>
                    </div>
                ) : (
                    <div
                        className={`${MONO} text-[11px] text-white/50 font-medium`}
                    >
                        Contact sales
                    </div>
                )}
                <span
                    className={`${MONO} inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] font-semibold transition-colors`}
                    style={{ color: row.featured ? ACCENT_BRIGHT : ACCENT }}
                >
                    {row.requestOnly ? "Request" : "Deploy"}
                    <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
            </div>
        </Link>
    );
}

function WorkloadCard({
    index,
    kind,
    title,
    desc,
    recommended,
    href,
}: {
    index: number;
    kind: string;
    title: string;
    desc: string;
    recommended: string;
    href: string;
}) {
    return (
        <Link
            href={href}
            className="group border border-white/[0.06] bg-[#111216] hover:bg-[#16181d] hover:border-white/[0.14] rounded-[6px] p-5 transition-all flex flex-col gap-3 min-h-[190px]"
        >
            <div className="flex items-center justify-between">
                <span
                    className={`${MONO} inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] font-semibold`}
                    style={{ color: ACCENT }}
                >
                    <span className="text-white/30 tabular-nums">
                        {String(index).padStart(2, "0")}
                    </span>
                    {kind}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-white/25 group-hover:text-[#0095FF] group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white mb-1">
                    {title}
                </h3>
                <p className="text-[12px] text-white/55 leading-snug">{desc}</p>
            </div>
            <div className="mt-auto pt-3 border-t border-white/[0.05]">
                <span
                    className={`${MONO} block text-[9.5px] uppercase tracking-[0.12em] font-semibold text-white/40`}
                >
                    Recommended
                </span>
                <span
                    className={`${MONO} mt-1 block text-[11.5px] text-white/85 font-semibold`}
                >
                    {recommended}
                </span>
            </div>
        </Link>
    );
}

function stockMeta(status: string): { label: string; color: string } {
    switch (status) {
        case "high":    return { label: "Available",     color: "#4ade80" };
        case "medium":  return { label: "Limited",       color: "#fbbf24" };
        case "low":     return { label: "Very limited",  color: "#fb923c" };
        case "new":     return { label: "New",           color: ACCENT };
        case "unknown": return { label: "Available",     color: "#4ade80" };
        case "none":
        default:        return { label: "Out of stock",  color: "#52525b" };
    }
}
