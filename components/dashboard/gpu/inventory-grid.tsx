"use client";

// GPU inventory grid. In-stock GPUs are shown first; out-of-stock
// rows collapse behind a "Show unavailable" toggle so the page
// doesn't drown in cards that the customer can't buy.

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

import { NvidiaLogo } from "@/components/branding/nvidia-logo";
import type { InventoryRowClient, StockStatus } from "./types";

interface InventoryGridProps {
    loading: boolean;
    rows: InventoryRowClient[];
}

function stockMeta(status: StockStatus): { dot: string; label: string } {
    switch (status) {
        case "high":   return { dot: "bg-emerald-400",  label: "In stock" };
        case "medium": return { dot: "bg-amber-400",    label: "Limited" };
        case "low":    return { dot: "bg-amber-400/70", label: "Very limited" };
        case "none":
        default:       return { dot: "bg-white/25",     label: "Out of stock" };
    }
}

function maxAvailable(row: InventoryRowClient): number {
    if (row.availableCounts.length > 0) return Math.max(...row.availableCounts);
    return row.stockStatus === "none" ? 0 : 1;
}

function formatPrice(v: number | null | undefined): string {
    if (v === null || v === undefined) return "—";
    return `$${v.toFixed(2)}`;
}

function GpuCard({ row }: { row: InventoryRowClient }) {
    const stock = stockMeta(row.stockStatus);
    const max = maxAvailable(row);
    const outOfStock = row.stockStatus === "none";
    const deployUrl = `/dashboard/services/gpu/deploy?gpu=${encodeURIComponent(row.gpuCatalogId)}`;

    return (
        <div className={`border bg-[#15171c] transition-colors ${
            outOfStock
                ? "border-white/[0.05] opacity-65"
                : "border-white/[0.08] hover:border-white/[0.14]"
        }`}>
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                    <NvidiaLogo width={20} height={14} className="mt-0.5 shrink-0 opacity-95" />
                    <div className="min-w-0">
                        <h3 className="text-[14px] font-semibold text-white truncate tracking-tight">
                            {row.displayName}
                        </h3>
                        <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40">
                            {row.memoryGb} GB
                        </p>
                    </div>
                </div>
                <div className="inline-flex items-center gap-1.5 text-[11px] text-white/65 shrink-0">
                    <span className={`h-1.5 w-1.5 rounded-full ${stock.dot}`} />
                    {stock.label}
                </div>
            </div>

            <div className="px-4 py-3 grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <div>
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        On-demand
                    </p>
                    <p className="mt-0.5 font-mono text-[14px] font-semibold text-white tabular-nums tracking-tight">
                        {formatPrice(row.onDemandPerHr)}
                        <span className="ml-0.5 text-[10px] font-normal text-white/40">/hr</span>
                    </p>
                </div>
                <div>
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Spot
                    </p>
                    <p className="mt-0.5 font-mono text-[14px] font-semibold text-white tabular-nums tracking-tight">
                        {formatPrice(row.spotPerHr)}
                        <span className="ml-0.5 text-[10px] font-normal text-white/40">/hr</span>
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Max
                    </p>
                    <p
                        className="mt-0.5 font-mono text-[14px] font-semibold text-white tabular-nums tracking-tight"
                        title={
                            row.availableCounts.length > 0
                                ? `Pod sizes: ${row.availableCounts.join(", ")}`
                                : undefined
                        }
                    >
                        {max > 0 ? `${max}×` : "—"}
                    </p>
                </div>
            </div>

            <div className="border-t border-white/[0.06] px-4 py-2.5">
                {outOfStock ? (
                    <span className="block text-center text-[11.5px] text-white/35 py-1.5">
                        Currently unavailable
                    </span>
                ) : (
                    <Button
                        asChild
                        size="sm"
                        className="w-full h-8 bg-[#0095FF] hover:bg-white hover:text-black hover:-translate-y-0.5 text-white text-[12px] font-medium"
                    >
                        <Link href={deployUrl}>Deploy</Link>
                    </Button>
                )}
            </div>
        </div>
    );
}

export function InventoryGrid({ loading, rows }: InventoryGridProps) {
    const [showUnavailable, setShowUnavailable] = useState(false);

    if (loading) {
        return (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className="h-[160px] border border-white/[0.06] bg-[#15171c] animate-pulse"
                        style={{ animationDelay: `${i * 60}ms` }}
                    />
                ))}
            </div>
        );
    }

    const secureRows = rows.filter((r) => r.cloudType === "SECURE");
    const inStock = secureRows.filter((r) => r.stockStatus !== "none");
    const outOfStock = secureRows.filter((r) => r.stockStatus === "none");

    if (secureRows.length === 0) {
        return (
            <div className="border border-white/[0.08] bg-[#15171c] px-6 py-12 text-center">
                <p className="text-[14px] font-semibold text-white">No GPU inventory yet</p>
                <p className="mt-1 text-[12px] text-white/45">
                    Inventory refreshes in the background. Check back shortly.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {inStock.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {inStock.map((r) => (
                        <GpuCard key={`${r.gpuCatalogId}-${r.cloudType}`} row={r} />
                    ))}
                </div>
            ) : (
                <div className="border border-white/[0.08] bg-[#15171c] px-5 py-6 text-center">
                    <p className="text-[13px] text-white/65">All GPU types are temporarily out of stock.</p>
                    <p className="mt-0.5 text-[11.5px] text-white/40">Check back shortly or join the waitlist for reserved capacity.</p>
                </div>
            )}

            {outOfStock.length > 0 && (
                <div>
                    <button
                        type="button"
                        onClick={() => setShowUnavailable((s) => !s)}
                        className="w-full flex items-center justify-between border border-white/[0.07] bg-transparent hover:bg-white/[0.02] px-4 py-2 text-[12px] text-white/55 hover:text-white/85 transition-colors"
                    >
                        <span>
                            {showUnavailable ? "Hide" : "Show"} unavailable ({outOfStock.length})
                        </span>
                        {showUnavailable ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                        )}
                    </button>
                    {showUnavailable && (
                        <div className="mt-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {outOfStock.map((r) => (
                                <GpuCard key={`${r.gpuCatalogId}-${r.cloudType}`} row={r} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
