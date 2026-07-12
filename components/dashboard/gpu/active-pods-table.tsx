"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
    ArrowUpRight,
    Copy,
    Cpu,
    Loader2,
    Pause,
    Play,
    Plus,
    RotateCw,
    Trash2,
} from "lucide-react";

import { NvidiaLogo } from "@/components/branding/nvidia-logo";
import { copyToClipboard as safeCopyToClipboard } from "@/lib/utils/safe-clipboard";
import { useConfirm } from "@/components/ui/confirm";
import type { GpuPodSummaryClient, PodStatus } from "./types";

// ─── Design tokens ────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

interface ActivePodsTableProps {
    loading: boolean;
    pods: GpuPodSummaryClient[];
}

function statusMeta(status: PodStatus): {
    dot: string;
    color: string;
    label: string;
    pulse?: boolean;
} {
    switch (status) {
        case "running":
            return { dot: "#4ade80", color: "#4ade80", label: "Running", pulse: true };
        case "provisioning":
            return { dot: ACCENT, color: ACCENT, label: "Deploying", pulse: true };
        case "restarting":
            return { dot: ACCENT, color: ACCENT, label: "Restarting", pulse: true };
        case "stopped":
            return { dot: "rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.55)", label: "Stopped" };
        case "interrupted":
            return { dot: "#fbbf24", color: "#fbbf24", label: "Interrupted" };
        case "failed":
            return { dot: "#f87171", color: "#f87171", label: "Failed" };
        case "terminated":
        default:
            return { dot: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.45)", label: "Terminated" };
    }
}

export function ActivePodsTable({ loading, pods }: ActivePodsTableProps) {
    const confirm = useConfirm();
    const [acting, setActing] = useState<Record<number, boolean>>({});

    async function copyToClipboard(
        e: React.MouseEvent,
        text: string,
        label: string,
    ) {
        e.preventDefault();
        e.stopPropagation();
        try {
            await safeCopyToClipboard(text);
            toast.success(`${label} copied`);
        } catch {
            toast.error(`Failed to copy ${label}`);
        }
    }

    async function powerAction(
        e: React.MouseEvent,
        podId: number,
        action: "start" | "stop" | "restart",
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
        if (!(await confirm({
            title: `Destroy pod "${name}"?`,
            description: "Billing will stop after the final prorated charge.",
            confirmText: "Destroy pod",
            danger: true,
        }))) {
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
                `Pod destroyed. Final charge: $${Number(json.finalChargeUsd || 0).toFixed(4)}`,
            );
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not destroy pod");
        } finally {
            setActing((s) => ({ ...s, [podId]: false }));
        }
    }

    if (loading) {
        return (
            <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="h-[60px] border-b border-white/[0.04] last:border-b-0 animate-pulse bg-white/[0.015]"
                        style={{ animationDelay: `${i * 80}ms` }}
                    />
                ))}
            </div>
        );
    }

    if (pods.length === 0) {
        return (
            <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] px-8 py-7 text-center overflow-hidden">
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(circle at 30% 20%, rgba(0,149,255,0.04), transparent 50%)",
                    }}
                />
                <div
                    className="relative z-10 mx-auto mb-3.5 h-10 w-10 inline-flex items-center justify-center rounded-full"
                    style={{
                        color: ACCENT,
                        background: "rgba(0,149,255,0.10)",
                        border: "1px solid rgba(0,149,255,0.22)",
                    }}
                >
                    <Cpu className="h-[18px] w-[18px]" />
                </div>
                <h3 className="relative z-10 text-[15px] font-semibold tracking-[-0.015em] text-white">
                    No active pods
                </h3>
                <p
                    className={`${MONO} relative z-10 mt-1.5 max-w-sm mx-auto text-[11px] text-white/45 leading-relaxed`}
                >
                    Deploy your first GPU pod from the featured list above.
                </p>
                <div className="relative z-10 mt-4">
                    <Link
                        href="/dashboard/services/gpu/deploy"
                        className={`${MONO} inline-flex items-center gap-2 h-9 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                        style={{
                            background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                            color: "#ffffff",
                            boxShadow:
                                "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#ffffff";
                            e.currentTarget.style.color = "#000000";
                            e.currentTarget.style.transform = "translateY(-2px)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                            e.currentTarget.style.color = "#ffffff";
                            e.currentTarget.style.transform = "none";
                        }}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Deploy a pod
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
            {/* Header */}
            <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_180px] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
                <ColHead>Pod</ColHead>
                <ColHead>GPU</ColHead>
                <ColHead>Public IP</ColHead>
                <ColHead align="right">Hourly</ColHead>
                <ColHead align="right">Actions</ColHead>
            </div>

            {pods.map((pod) => {
                const isRunning = pod.status === "running";
                const isStopped = pod.status === "stopped";
                const isInterrupted = pod.status === "interrupted";
                const status = statusMeta(pod.status);
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
                        className="group relative block border-b border-white/[0.04] transition-colors last:border-b-0 hover:bg-white/[0.015]"
                    >
                        {/* Mobile */}
                        <div className="px-5 py-3 md:hidden">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`${MONO} text-[12.5px] font-semibold text-white truncate`}
                                        >
                                            {pod.name}
                                        </span>
                                        <StatusPill status={status} />
                                    </div>
                                    <div
                                        className={`${MONO} mt-1 flex items-center gap-1.5 text-[11px] text-white/55`}
                                    >
                                        <NvidiaLogo width={14} height={10} className="shrink-0 opacity-90" />
                                        <span className="tabular-nums">
                                            {pod.gpuCount}×
                                        </span>
                                        <span className="truncate">
                                            {pod.gpuCatalogId}
                                        </span>
                                        {pod.interruptible && (
                                            <span
                                                className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] px-1.5 py-px border border-amber-400/25 bg-amber-400/[0.06] text-amber-300 rounded-[3px]`}
                                            >
                                                Spot
                                            </span>
                                        )}
                                    </div>
                                    {pod.publicIp && (
                                        <div
                                            className={`${MONO} mt-1 text-[10.5px] text-white/50 truncate`}
                                        >
                                            {pod.publicIp}
                                        </div>
                                    )}
                                </div>
                                <ArrowUpRight className="h-4 w-4 shrink-0 text-white/20 group-hover:text-white/60 transition-colors" />
                            </div>
                        </div>

                        {/* Desktop */}
                        <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_180px] gap-3 px-5 py-3 items-center">
                            {/* Name + status */}
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`${MONO} text-[12.5px] font-semibold text-white truncate`}
                                    >
                                        {pod.name}
                                    </span>
                                    <StatusPill status={status} />
                                </div>
                                {isInterrupted && (
                                    <p
                                        className={`${MONO} mt-1 text-[10.5px] text-amber-300/75`}
                                    >
                                        Spot pod was interrupted by the provider
                                    </p>
                                )}
                            </div>

                            {/* GPU */}
                            <div
                                className={`${MONO} flex items-center gap-1.5 text-[11.5px] text-white/75 min-w-0`}
                            >
                                <NvidiaLogo width={16} height={11} className="shrink-0 opacity-90" />
                                <span className="tabular-nums text-white/90 font-medium">
                                    {pod.gpuCount}×
                                </span>
                                <span className="truncate">
                                    {pod.gpuCatalogId}
                                </span>
                                {pod.interruptible && (
                                    <span
                                        className={`${MONO} shrink-0 text-[9px] uppercase tracking-[0.12em] px-1.5 py-px border border-amber-400/25 bg-amber-400/[0.06] text-amber-300 rounded-[3px] font-semibold`}
                                    >
                                        Spot
                                    </span>
                                )}
                            </div>

                            {/* IP */}
                            <div className="flex min-w-0 items-center gap-2">
                                <span
                                    className={`${MONO} truncate text-[11.5px] text-white/65`}
                                >
                                    {pod.publicIp || "—"}
                                </span>
                                {sshCmd && (
                                    <button
                                        onClick={(e) =>
                                            copyToClipboard(e, sshCmd, "SSH command")
                                        }
                                        className="shrink-0 text-white/25 hover:text-white/70 transition-colors"
                                        title="Copy SSH command"
                                    >
                                        <Copy className="h-3 w-3" />
                                    </button>
                                )}
                            </div>

                            {/* Cost */}
                            <div className="text-right">
                                <span
                                    style={SERIF_STYLE}
                                    className="text-[15px] font-bold text-white tabular-nums"
                                >
                                    ${pod.hourlyCostUsd.toFixed(2)}
                                </span>
                                <span
                                    className={`${MONO} ml-0.5 text-[10px] text-white/35`}
                                >
                                    /hr
                                </span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-1.5">
                                {isRunning && (
                                    <IconBtn
                                        onClick={(e) => powerAction(e, pod.id, "stop")}
                                        disabled={acting_}
                                        title="Stop"
                                    >
                                        <Pause className="h-3 w-3" />
                                    </IconBtn>
                                )}
                                {isStopped && (
                                    <IconBtn
                                        onClick={(e) =>
                                            powerAction(e, pod.id, "start")
                                        }
                                        disabled={acting_}
                                        title="Start"
                                        tone="accent"
                                    >
                                        <Play className="h-3 w-3" />
                                    </IconBtn>
                                )}
                                {(isRunning || isStopped) && (
                                    <IconBtn
                                        onClick={(e) =>
                                            powerAction(e, pod.id, "restart")
                                        }
                                        disabled={acting_}
                                        title="Restart"
                                    >
                                        <RotateCw className="h-3 w-3" />
                                    </IconBtn>
                                )}
                                <IconBtn
                                    onClick={(e) =>
                                        destroyPod(e, pod.id, pod.name)
                                    }
                                    disabled={acting_}
                                    title="Destroy"
                                    tone="danger"
                                >
                                    {acting_ ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-3 w-3" />
                                    )}
                                </IconBtn>
                                <span
                                    className="ml-1 inline-flex items-center justify-center h-7 w-7 text-white/25 group-hover:text-[#0095FF] transition-colors"
                                    title="Open pod"
                                >
                                    <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </span>
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}

function ColHead({
    children,
    align = "left",
}: {
    children: React.ReactNode;
    align?: "left" | "right";
}) {
    return (
        <span
            className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 ${
                align === "right" ? "text-right" : ""
            }`}
        >
            {children}
        </span>
    );
}

function StatusPill({
    status,
}: {
    status: { dot: string; color: string; label: string; pulse?: boolean };
}) {
    return (
        <span
            className={`${MONO} shrink-0 inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.12em] font-semibold`}
            style={{ color: status.color }}
        >
            <span
                className={`h-1.5 w-1.5 rounded-full ${status.pulse ? "animate-pulse" : ""}`}
                style={{
                    background: status.dot,
                    boxShadow:
                        status.color === "rgba(255,255,255,0.55)" ||
                        status.color === "rgba(255,255,255,0.45)"
                            ? "none"
                            : `0 0 5px ${status.color}`,
                }}
            />
            {status.label}
        </span>
    );
}

function IconBtn({
    onClick,
    disabled,
    title,
    tone,
    children,
}: {
    onClick: (e: React.MouseEvent) => void;
    disabled?: boolean;
    title: string;
    tone?: "accent" | "danger";
    children: React.ReactNode;
}) {
    const styles =
        tone === "accent"
            ? {
                  color: ACCENT_BRIGHT,
                  borderColor: "rgba(0,149,255,0.3)",
                  background: "rgba(0,149,255,0.08)",
              }
            : tone === "danger"
              ? {
                    color: "rgba(248,113,113,0.85)",
                    borderColor: "rgba(248,113,113,0.22)",
                    background: "rgba(248,113,113,0.06)",
                }
              : {
                    color: "rgba(255,255,255,0.65)",
                    borderColor: "rgba(255,255,255,0.08)",
                    background: "#0d0e11",
                };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className="inline-flex h-7 w-7 items-center justify-center border rounded-[4px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-125"
            style={styles}
        >
            {children}
        </button>
    );
}
