"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
    ArrowRight,
    ChevronRight,
    Plus,
    RotateCw,
    Sparkles,
} from "lucide-react";

import { ActivePodsTable } from "./active-pods-table";
import { InventoryGrid } from "./inventory-grid";
import type { GpuPodSummaryClient, InventoryRowClient } from "./types";

// Polling acts as a safety net behind realtime. Realtime should push within
// ~1 s of the cron writing a snapshot; if the websocket drops we still
// recover within this interval.
const POLL_FALLBACK_MS = 15_000;

function formatRelative(ts: number | null, _tick: number): string {
    if (!ts) return "just now";
    const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
}

// Coalesce a burst of realtime inserts (one cron tick writes ~10 rows in <100 ms)
// into a single refetch.
const REFETCH_DEBOUNCE_MS = 400;

export default function GpuDashboard() {
    const [inventory, setInventory] = useState<InventoryRowClient[]>([]);
    const [pods, setPods] = useState<GpuPodSummaryClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [tick, setTick] = useState(0); // forces the "X s ago" label to recompute
    const supabase = createClient();
    const inventoryChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const podsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadAll = useCallback(
        async (silent = false) => {
            if (!silent) setLoading(true);
            try {
                const [invRes, podsRes] = await Promise.all([
                    fetch("/api/services/gpu/inventory", { cache: "no-store" }),
                    fetch("/api/services/gpu/pods", { cache: "no-store" }),
                ]);
                const invJson = await invRes.json().catch(() => ({}));
                const podsJson = await podsRes.json().catch(() => ({}));
                if (invRes.ok && invJson.ok) {
                    setInventory(invJson.inventory as InventoryRowClient[]);
                }
                if (podsRes.ok && podsJson.ok) {
                    setPods(podsJson.pods as GpuPodSummaryClient[]);
                }
                setLastUpdated(Date.now());
            } catch (err) {
                console.error("[gpu-dashboard] load failed:", err);
                if (!silent) toast.error("Unable to load GPU data");
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        []
    );

    const scheduleRefetch = useCallback(() => {
        if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = setTimeout(() => {
            loadAll(true);
        }, REFETCH_DEBOUNCE_MS);
    }, [loadAll]);

    // Initial load + periodic safety-net poll
    useEffect(() => {
        loadAll(false);
        const t = setInterval(() => loadAll(true), POLL_FALLBACK_MS);
        return () => clearInterval(t);
    }, [loadAll]);

    // "X s ago" label tick
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 1000);
        return () => clearInterval(t);
    }, []);

    // Realtime — inventory snapshots
    useEffect(() => {
        const channel = supabase
            .channel("gpu-inventory-dashboard")
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "gpu_inventory_snapshots",
                },
                () => scheduleRefetch()
            )
            .subscribe();
        inventoryChannelRef.current = channel;
        return () => {
            channel.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Realtime — pod changes
    useEffect(() => {
        const channel = supabase
            .channel("gpu-pods-dashboard")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "gpu_pods" },
                () => scheduleRefetch()
            )
            .subscribe();
        podsChannelRef.current = channel;
        return () => {
            channel.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        loadAll(false);
    };

    // Aggregate stats
    const runningCount = pods.filter((p) => p.status === "running").length;
    const provisioningCount = pods.filter((p) => p.status === "provisioning").length;
    const hourlyBurn = pods
        .filter((p) => p.status === "running" || p.status === "stopped")
        .reduce((sum, p) => sum + (p.hourlyCostUsd || 0), 0);
    const inStockCount = inventory.filter((i) => i.stockStatus !== "none").length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }}
                className="glass-panel overflow-hidden"
            >
                <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0095FF]/85">
                            GPU Cloud
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                                GPU compute, on demand
                            </h1>
                            <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Live inventory
                            </Badge>
                        </div>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
                            Spot and on-demand H100, H200, and B200 pods backed by RunPod. Per-second
                            billing against your account credits. Reserved capacity and multi-node
                            clusters available via sales.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            {["H100", "H200", "B200", "Spot + on-demand", "Per-second billing"].map(
                                (tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/42"
                                    >
                                        {tag}
                                    </span>
                                )
                            )}
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <Button
                                onClick={onRefresh}
                                variant="outline"
                                disabled={refreshing}
                                size="sm"
                                className="rounded-none border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            >
                                <RotateCw
                                    className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                                />
                                Refresh
                            </Button>
                            <Button
                                asChild
                                size="sm"
                                className="rounded-none border border-[#0095FF] bg-[#0095FF] text-white shadow-[0_12px_32px_-12px_rgba(0,149,255,0.7)] hover:bg-[#0aa0ff]"
                            >
                                <Link href="/dashboard/services/gpu/deploy">
                                    <Plus className="mr-2 h-3.5 w-3.5" />
                                    Deploy pod
                                </Link>
                            </Button>
                            <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="rounded-none border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            >
                                <Link href="/dashboard/services/gpu/enterprise">
                                    Reserved & Clusters
                                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                                </Link>
                            </Button>
                        </div>
                    </div>
                    <div className="hidden shrink-0 items-center justify-center rounded-full lg:flex">
                        <div className="glass-icon flex h-32 w-32 items-center justify-center text-[#0095FF]">
                            <Sparkles className="h-16 w-16" />
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Enterprise CTA banner */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04, duration: 0.24 }}
                className="glass-panel overflow-hidden border-l-2 border-l-[#0095FF]/60"
            >
                <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0095FF]/85">
                            Reserved & Clusters
                        </p>
                        <p className="mt-1 text-sm text-white/80">
                            Need 16+ GPUs, reserved capacity, or a multi-node cluster?
                            NVLink fabric, up to 60% off on-demand, dedicated support — our
                            team handles it directly.
                        </p>
                    </div>
                    <Button
                        asChild
                        size="sm"
                        className="shrink-0 rounded-none border border-[#0095FF] bg-[#0095FF] px-4 text-white shadow-[0_12px_32px_-12px_rgba(0,149,255,0.7)] hover:bg-[#0aa0ff]"
                    >
                        <Link href="/dashboard/services/gpu/enterprise">
                            Talk to sales
                            <ArrowRight className="ml-2 h-3.5 w-3.5" />
                        </Link>
                    </Button>
                </div>
            </motion.div>

            {/* Stats */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06, duration: 0.24 }}
                className="grid grid-cols-2 gap-4 lg:grid-cols-4"
            >
                {[
                    {
                        label: "Running",
                        value: runningCount,
                        sub: "Active pods",
                    },
                    {
                        label: "Provisioning",
                        value: provisioningCount,
                        sub: "In progress",
                    },
                    {
                        label: "Hourly burn",
                        value: `$${hourlyBurn.toFixed(2)}`,
                        sub: "Across all pods",
                    },
                    {
                        label: "In stock",
                        value: inStockCount,
                        sub: "GPU × cloud options",
                    },
                ].map((stat) => (
                    <div key={stat.label} className="glass-panel p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                            {stat.label}
                        </p>
                        <p className="mt-3 text-2xl font-semibold tracking-tight text-white tabular-nums">
                            {stat.value}
                        </p>
                        <p className="mt-1 text-xs text-white/40">{stat.sub}</p>
                    </div>
                ))}
            </motion.div>

            {/* Inventory grid */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.24 }}
            >
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                            Available now
                        </p>
                        <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                            GPU inventory
                        </h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </span>
                        <span>
                            Live · updated {formatRelative(lastUpdated, tick)}
                        </span>
                    </div>
                </div>
                <InventoryGrid loading={loading} rows={inventory} />
            </motion.div>

            {/* Active pods */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.24 }}
            >
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                            Your pods
                        </p>
                        <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                            Active GPU pods
                        </h2>
                    </div>
                </div>
                <ActivePodsTable loading={loading} pods={pods} />
            </motion.div>
        </div>
    );
}
