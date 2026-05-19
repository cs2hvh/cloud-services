"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    AlertTriangle,
    ArrowRight,
    ChevronRight,
    Copy,
    Loader2,
    Pause,
    Play,
    Plus,
    Power,
    RotateCw,
    Sparkles,
    Trash2,
    XCircle,
} from "lucide-react";

import type { GpuPodSummaryClient, PodStatus } from "./types";

interface ActivePodsTableProps {
    loading: boolean;
    pods: GpuPodSummaryClient[];
}

function statusStyle(status: PodStatus) {
    switch (status) {
        case "running":
            return {
                pill: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
                accent: "bg-emerald-500",
            };
        case "provisioning":
        case "restarting":
            return {
                pill: "border-blue-500/20 bg-blue-500/10 text-blue-300",
                accent: "bg-blue-500",
            };
        case "stopped":
            return {
                pill: "border-white/[0.08] bg-white/[0.04] text-white/55",
                accent: "bg-white/30",
            };
        case "interrupted":
            return {
                pill: "border-amber-500/20 bg-amber-500/10 text-amber-300",
                accent: "bg-amber-500",
            };
        case "failed":
            return {
                pill: "border-red-500/20 bg-red-500/10 text-red-300",
                accent: "bg-red-500",
            };
        case "terminated":
        default:
            return {
                pill: "border-white/[0.06] bg-white/[0.02] text-white/35",
                accent: "bg-white/20",
            };
    }
}

export function ActivePodsTable({ loading, pods }: ActivePodsTableProps) {
    const [acting, setActing] = useState<Record<number, boolean>>({});

    async function copyToClipboard(
        e: React.MouseEvent,
        text: string,
        label: string
    ) {
        e.preventDefault();
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied`);
        } catch {
            toast.error(`Failed to copy ${label}`);
        }
    }

    async function powerAction(
        e: React.MouseEvent,
        podId: number,
        action: "start" | "stop" | "restart"
    ) {
        e.preventDefault();
        e.stopPropagation();
        setActing((s) => ({ ...s, [podId]: true }));
        try {
            const res = await fetch(`/api/services/gpu/pods/${podId}/power`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) {
                throw new Error(json.error || `Failed to ${action}`);
            }
            toast.success(`Pod ${action} requested`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : `Could not ${action} pod`);
        } finally {
            setActing((s) => ({ ...s, [podId]: false }));
        }
    }

    async function destroyPod(e: React.MouseEvent, podId: number, name: string) {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Destroy pod "${name}"? Billing will stop after the final prorated charge.`)) {
            return;
        }
        setActing((s) => ({ ...s, [podId]: true }));
        try {
            const res = await fetch(`/api/services/gpu/pods/${podId}`, {
                method: "DELETE",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) {
                throw new Error(json.error || "Failed to destroy");
            }
            toast.success(
                `Pod destroyed. Final charge: $${Number(json.finalChargeUsd || 0).toFixed(4)}`
            );
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not destroy pod");
        } finally {
            setActing((s) => ({ ...s, [podId]: false }));
        }
    }

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="glass-panel h-[72px] animate-pulse"
                        style={{ animationDelay: `${i * 80}ms` }}
                    />
                ))}
            </div>
        );
    }

    if (pods.length === 0) {
        return (
            <div className="glass-panel overflow-hidden">
                <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <Sparkles className="mb-3 h-10 w-10 text-white/20" />
                    <p className="text-sm font-semibold text-white">No active pods</p>
                    <p className="mt-1 max-w-sm text-xs text-white/45">
                        Deploy your first GPU pod to get started.
                    </p>
                    <Button
                        asChild
                        size="sm"
                        className="mt-5 rounded-none border border-fuchsia-400/25 bg-fuchsia-500/90 text-slate-950 hover:bg-fuchsia-400"
                    >
                        <Link href="/dashboard/services/gpu/deploy">
                            <Plus className="mr-2 h-3.5 w-3.5" />
                            Deploy a pod
                        </Link>
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel overflow-hidden">
            <div className="hidden border-b border-white/[0.06] px-5 py-3 sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_180px_36px] sm:gap-4">
                {["Pod", "GPU", "Public IP", "Hourly", "Actions"].map((h) => (
                    <div
                        key={h}
                        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/28"
                    >
                        {h}
                    </div>
                ))}
                <div />
            </div>

            {pods.map((pod) => {
                const isRunning = pod.status === "running";
                const isStopped = pod.status === "stopped";
                const isProvisioning = pod.status === "provisioning";
                const isFailed = pod.status === "failed";
                const isInterrupted = pod.status === "interrupted";
                const style = statusStyle(pod.status);
                const sshPort = pod.portMappings?.["22"];
                const sshCmd =
                    pod.publicIp && sshPort
                        ? `ssh root@${pod.publicIp} -p ${sshPort}`
                        : null;
                const acting_ = !!acting[pod.id];

                return (
                    <Link
                        key={pod.id}
                        href={`/dashboard/services/gpu/${pod.id}`}
                        className="group relative block border-b border-white/[0.04] transition-colors last:border-b-0 hover:bg-white/[0.025]"
                    >
                        <span
                            className={`absolute left-0 top-0 h-full w-0.5 ${style.accent} opacity-60`}
                        />

                        {/* Mobile */}
                        <div className="px-5 py-4 pl-6 sm:hidden">
                            <div className="flex items-center justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2.5">
                                        <span className="truncate font-mono text-sm font-semibold text-white">
                                            {pod.name}
                                        </span>
                                        <span
                                            className={`inline-flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${style.pill}`}
                                        >
                                            {isProvisioning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                            {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                            {isFailed && <XCircle className="h-2.5 w-2.5" />}
                                            {isInterrupted && <AlertTriangle className="h-2.5 w-2.5" />}
                                            {pod.status}
                                        </span>
                                    </div>
                                    <div className="mt-1.5 flex items-center gap-2 text-xs text-white/38">
                                        <span>
                                            {pod.gpuCount}× {pod.gpuCatalogId}
                                        </span>
                                        {pod.interruptible && (
                                            <span className="rounded-sm bg-amber-500/10 px-1.5 text-[10px] text-amber-300">
                                                Spot
                                            </span>
                                        )}
                                    </div>
                                    {pod.publicIp && (
                                        <div className="mt-1 font-mono text-xs text-white/55">
                                            {pod.publicIp}
                                        </div>
                                    )}
                                </div>
                                <ChevronRight className="ml-3 h-4 w-4 shrink-0 text-white/20 transition-colors group-hover:text-white/50" />
                            </div>
                        </div>

                        {/* Desktop */}
                        <div className="hidden px-5 py-4 pl-6 sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_180px_36px] sm:items-center sm:gap-4">
                            {/* Name + status */}
                            <div className="min-w-0">
                                <div className="flex items-center gap-2.5">
                                    <span className="truncate font-mono text-sm font-semibold text-white">
                                        {pod.name}
                                    </span>
                                    <span
                                        className={`inline-flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${style.pill}`}
                                    >
                                        {isProvisioning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                        {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                        {isFailed && <XCircle className="h-2.5 w-2.5" />}
                                        {isInterrupted && <AlertTriangle className="h-2.5 w-2.5" />}
                                        {pod.status}
                                    </span>
                                </div>
                                {isInterrupted && (
                                    <p className="mt-1 text-[11px] text-amber-300/80">
                                        Spot pod was interrupted by the provider
                                    </p>
                                )}
                            </div>

                            {/* GPU */}
                            <div className="flex items-center gap-2 text-xs text-white/55">
                                <span>{pod.gpuCount}×</span>
                                <span className="truncate">{pod.gpuCatalogId}</span>
                                {pod.interruptible && (
                                    <span className="rounded-sm bg-amber-500/10 px-1.5 text-[10px] text-amber-300">
                                        Spot
                                    </span>
                                )}
                            </div>

                            {/* IP */}
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-mono text-sm text-white/60">
                                    {pod.publicIp || "—"}
                                </span>
                                {sshCmd && (
                                    <button
                                        onClick={(e) => copyToClipboard(e, sshCmd, "SSH command")}
                                        className="shrink-0 text-white/20 transition-colors hover:text-white/60"
                                        title="Copy SSH command"
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Cost */}
                            <div className="font-mono text-sm font-medium text-white tabular-nums">
                                ${pod.hourlyCostUsd.toFixed(2)}
                                <span className="text-[11px] font-normal text-white/40">/hr</span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-1.5">
                                {isRunning && (
                                    <button
                                        onClick={(e) => powerAction(e, pod.id, "stop")}
                                        disabled={acting_}
                                        className="flex h-7 items-center justify-center border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white/70 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
                                        title="Stop"
                                    >
                                        <Pause className="h-3 w-3" />
                                    </button>
                                )}
                                {isStopped && (
                                    <button
                                        onClick={(e) => powerAction(e, pod.id, "start")}
                                        disabled={acting_}
                                        className="flex h-7 items-center justify-center border border-emerald-500/20 bg-emerald-500/10 px-2 text-[11px] text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-40"
                                        title="Start"
                                    >
                                        <Play className="h-3 w-3" />
                                    </button>
                                )}
                                {(isRunning || isStopped) && (
                                    <button
                                        onClick={(e) => powerAction(e, pod.id, "restart")}
                                        disabled={acting_}
                                        className="flex h-7 items-center justify-center border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white/70 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
                                        title="Restart"
                                    >
                                        <RotateCw className="h-3 w-3" />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => destroyPod(e, pod.id, pod.name)}
                                    disabled={acting_}
                                    className="flex h-7 items-center justify-center border border-red-500/15 bg-red-500/10 px-2 text-[11px] text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-40"
                                    title="Destroy"
                                >
                                    {acting_ ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-3 w-3" />
                                    )}
                                </button>
                            </div>

                            {/* Arrow */}
                            <div className="flex justify-end">
                                <ArrowRight className="h-4 w-4 text-white/15 transition-all group-hover:translate-x-0.5 group-hover:text-white/50" />
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
