"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Sparkles, Zap } from "lucide-react";

import type { InventoryRowClient, StockStatus } from "./types";

interface InventoryGridProps {
    loading: boolean;
    rows: InventoryRowClient[];
}

function stockStyle(status: StockStatus) {
    switch (status) {
        case "high":
            return {
                pill: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
                dot: "bg-emerald-400",
                label: "In stock",
            };
        case "medium":
            return {
                pill: "border-amber-500/20 bg-amber-500/10 text-amber-300",
                dot: "bg-amber-400",
                label: "Limited",
            };
        case "low":
            return {
                pill: "border-orange-500/20 bg-orange-500/10 text-orange-300",
                dot: "bg-orange-400",
                label: "Very limited",
            };
        case "none":
        default:
            return {
                pill: "border-white/[0.08] bg-white/[0.04] text-white/40",
                dot: "bg-white/30",
                label: "Out of stock",
            };
    }
}

function maxAvailable(row: InventoryRowClient): number {
    // Mirror server-side fallback: empty counts + non-zero stock ⇒ 1 max.
    if (row.availableCounts.length > 0) return Math.max(...row.availableCounts);
    return row.stockStatus === "none" ? 0 : 1;
}

function formatPrice(v: number | null | undefined): string {
    if (v === null || v === undefined) return "—";
    return `$${v.toFixed(2)}`;
}

function GpuCard({ row }: { row: InventoryRowClient }) {
    const status = row.stockStatus;
    const style = stockStyle(status);
    const max = maxAvailable(row);
    const deployUrl = `/dashboard/services/gpu/deploy?gpu=${encodeURIComponent(
        row.gpuCatalogId
    )}`;
    const outOfStock = status === "none";

    return (
        <div className="glass-panel overflow-hidden">
            {/* Header */}
            <div className="border-b border-white/[0.04] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-white">
                            {row.displayName}
                        </h3>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/35">
                            {row.memoryGb} GB VRAM · NVIDIA
                        </p>
                    </div>
                    {max > 0 && (
                        <span
                            className={`inline-flex shrink-0 items-center border px-2 py-0.5 text-[11px] font-mono font-semibold tabular-nums ${
                                max >= 4
                                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                                    : max >= 2
                                      ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                                      : "border-orange-500/20 bg-orange-500/10 text-orange-300"
                            }`}
                            title={
                                row.availableCounts.length > 0
                                    ? `Available counts: ${row.availableCounts.join(", ")}`
                                    : "At least 1 GPU available"
                            }
                        >
                            {max}× max
                        </span>
                    )}
                </div>
            </div>

            {/* Stock + pricing */}
            <div className="flex flex-col gap-3 px-5 py-4">
                <span
                    className={`inline-flex w-fit items-center gap-1.5 border px-2 py-0.5 text-[11px] font-medium ${style.pill}`}
                >
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {style.label}
                </span>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
                            On-demand
                        </p>
                        <p className="mt-1 font-mono text-base font-semibold text-white tabular-nums">
                            {formatPrice(row.onDemandPerHr)}
                            <span className="ml-1 text-[11px] font-normal text-white/40">
                                /GPU/hr
                            </span>
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
                            Spot
                        </p>
                        <p className="mt-1 font-mono text-base font-semibold text-white tabular-nums">
                            {formatPrice(row.spotPerHr)}
                            <span className="ml-1 text-[11px] font-normal text-white/40">
                                /GPU/hr
                            </span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Deploy CTA */}
            <div className="border-t border-white/[0.04] px-5 py-3">
                <Button
                    asChild
                    size="sm"
                    disabled={outOfStock}
                    className={`w-full rounded-none border text-sm ${
                        outOfStock
                            ? "cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-white/30"
                            : "border-fuchsia-400/25 bg-fuchsia-500/85 text-slate-950 hover:bg-fuchsia-400"
                    }`}
                >
                    {outOfStock ? (
                        <span>Currently unavailable</span>
                    ) : (
                        <Link href={deployUrl}>
                            <Zap className="mr-1.5 h-3.5 w-3.5" />
                            Deploy
                        </Link>
                    )}
                </Button>
            </div>
        </div>
    );
}

export function InventoryGrid({ loading, rows }: InventoryGridProps) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                        key={i}
                        className="glass-panel h-[210px] animate-pulse"
                        style={{ animationDelay: `${i * 60}ms` }}
                    />
                ))}
            </div>
        );
    }

    // Show only Secure cloud rows. Community is hidden from the UI by design;
    // the sync still writes both so this can be re-enabled later without a
    // schema change.
    const secureRows = rows.filter((r) => r.cloudType === "SECURE");

    if (secureRows.length === 0) {
        return (
            <div className="glass-panel px-6 py-12 text-center">
                <Sparkles className="mx-auto mb-3 h-10 w-10 text-white/20" />
                <p className="text-sm font-semibold text-white">No GPU inventory yet</p>
                <p className="mt-1 text-xs text-white/45">
                    Inventory refreshes in the background. Check back shortly.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {secureRows.map((r) => (
                <GpuCard key={`${r.gpuCatalogId}-${r.cloudType}`} row={r} />
            ))}
        </div>
    );
}
