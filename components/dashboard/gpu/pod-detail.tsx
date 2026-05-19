"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
    AlertTriangle,
    ArrowLeft,
    ChevronRight,
    Copy,
    Loader2,
    Pause,
    Play,
    RotateCw,
    Sparkles,
    Trash2,
    XCircle,
} from "lucide-react";

import type { CloudType, PodStatus } from "./types";

interface GpuPodDetailFromApi {
    id: number;
    name: string;
    status: PodStatus;
    gpuCatalogId: string;
    gpuCount: number;
    cloudType: CloudType;
    interruptible: boolean;
    publicIp: string | null;
    portMappings: Record<string, number> | null;
    hourlyCostUsd: number;
    createdAt: string;
    runpodPodId: string | null;
    ownerId: string;
    imageName: string;
    templateId: string | null;
    containerDiskGb: number;
    volumeGb: number;
    networkVolumeId: string | null;
    dataCenterId: string | null;
    ports: string[];
    envKeys: string[];
    sshCommand: string | null;
    details: Record<string, unknown> | null;
    billingStart: string | null;
    billingEnd: string | null;
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
        default:
            return {
                pill: "border-white/[0.06] bg-white/[0.02] text-white/35",
                accent: "bg-white/20",
            };
    }
}

export default function GpuPodDetail() {
    const params = useParams();
    const router = useRouter();
    const supabase = createClient();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const podId = Number(params.id);
    const [pod, setPod] = useState<GpuPodDetailFromApi | null>(null);
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch(`/api/services/gpu/pods/${podId}`, {
                cache: "no-store",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
            setPod(json.pod as GpuPodDetailFromApi);
        } catch (e) {
            console.error("[gpu-pod-detail] refresh:", e);
        } finally {
            setLoading(false);
        }
    }, [podId]);

    useEffect(() => {
        refresh();
        const channel = supabase
            .channel(`gpu-pod-${podId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "gpu_pods",
                    filter: `id=eq.${podId}`,
                },
                () => refresh()
            )
            .subscribe();
        channelRef.current = channel;
        return () => {
            channel.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [podId]);

    const copy = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied`);
        } catch {
            toast.error(`Copy failed`);
        }
    };

    async function powerAction(action: "start" | "stop" | "restart") {
        setActing(true);
        try {
            const res = await fetch(`/api/services/gpu/pods/${podId}/power`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
            toast.success(`Pod ${action} requested`);
            await refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : `Could not ${action}`);
        } finally {
            setActing(false);
        }
    }

    async function destroyPod() {
        if (!pod) return;
        if (!confirm(`Destroy pod "${pod.name}"? Billing will stop after the final prorated charge.`)) {
            return;
        }
        setActing(true);
        try {
            const res = await fetch(`/api/services/gpu/pods/${podId}`, {
                method: "DELETE",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
            toast.success(
                `Destroyed. Final charge: $${Number(json.finalChargeUsd || 0).toFixed(4)}`
            );
            router.push("/dashboard/services/gpu");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not destroy");
            setActing(false);
        }
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-12 w-1/3 animate-pulse bg-white/[0.06]" />
                <div className="glass-panel h-32 animate-pulse" />
                <div className="glass-panel h-48 animate-pulse" />
            </div>
        );
    }

    if (!pod) {
        return (
            <div className="glass-panel overflow-hidden">
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <Sparkles className="mb-3 h-10 w-10 text-white/20" />
                    <p className="text-sm font-semibold text-white">Pod not found</p>
                    <Button asChild className="mt-5 rounded-none border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]">
                        <Link href="/dashboard/services/gpu">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back to GPU Cloud
                        </Link>
                    </Button>
                </div>
            </div>
        );
    }

    const style = statusStyle(pod.status);
    const isRunning = pod.status === "running";
    const isStopped = pod.status === "stopped";
    const isTerminal = pod.status === "terminated" || pod.status === "failed";
    const monthlyEst = (pod.hourlyCostUsd || 0) * 730;
    const provisioning = pod.details?.provisioning as
        | { stage?: string; progress?: number; message?: string }
        | undefined;

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm text-white/38">
                <Link
                    href="/dashboard/services/gpu"
                    className="flex items-center gap-1.5 transition-colors hover:text-white/70"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    GPU Cloud
                </Link>
                <ChevronRight className="h-3 w-3 text-white/20" />
                <span className="truncate text-white/55">{pod.name}</span>
            </nav>

            {/* Header */}
            <div className="glass-panel overflow-hidden">
                <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300/70">
                            GPU Pod
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <h1 className="truncate font-mono text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                                {pod.name}
                            </h1>
                            <span
                                className={`inline-flex items-center gap-1.5 border px-2 py-1 text-xs font-medium ${style.pill}`}
                            >
                                {(pod.status === "provisioning" ||
                                    pod.status === "restarting") && (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                )}
                                {pod.status === "running" && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                )}
                                {pod.status === "failed" && <XCircle className="h-3 w-3" />}
                                {pod.status === "interrupted" && (
                                    <AlertTriangle className="h-3 w-3" />
                                )}
                                {pod.status}
                            </span>
                            {pod.interruptible && (
                                <span className="border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
                                    Spot
                                </span>
                            )}
                        </div>
                        <p className="mt-2 text-sm text-white/45">
                            {pod.gpuCount}× {pod.gpuCatalogId}
                            {" · "}
                            {pod.cloudType === "SECURE" ? "Secure cloud" : "Community"}
                            {pod.dataCenterId ? ` · ${pod.dataCenterId}` : ""}
                        </p>
                        {provisioning?.stage && pod.status === "provisioning" && (
                            <div className="mt-3 max-w-md">
                                <div className="h-1 overflow-hidden bg-white/[0.06]">
                                    <div
                                        className="h-full bg-gradient-to-r from-fuchsia-600 to-fuchsia-400 transition-all duration-700"
                                        style={{ width: `${provisioning.progress || 10}%` }}
                                    />
                                </div>
                                <p className="mt-1 text-[11px] text-fuchsia-400/80">
                                    {provisioning.message}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {isRunning && (
                            <Button
                                size="sm"
                                disabled={acting}
                                onClick={() => powerAction("stop")}
                                className="rounded-none border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            >
                                <Pause className="mr-1.5 h-3.5 w-3.5" /> Stop
                            </Button>
                        )}
                        {isStopped && (
                            <Button
                                size="sm"
                                disabled={acting}
                                onClick={() => powerAction("start")}
                                className="rounded-none border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                            >
                                <Play className="mr-1.5 h-3.5 w-3.5" /> Start
                            </Button>
                        )}
                        {(isRunning || isStopped) && (
                            <Button
                                size="sm"
                                disabled={acting}
                                onClick={() => powerAction("restart")}
                                className="rounded-none border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            >
                                <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Restart
                            </Button>
                        )}
                        {!isTerminal && (
                            <Button
                                size="sm"
                                disabled={acting}
                                onClick={destroyPod}
                                className="rounded-none border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15"
                            >
                                {acting ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Destroy
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                    {
                        label: "GPUs",
                        value: `${pod.gpuCount}× ${pod.gpuCatalogId.split("-")[0].toUpperCase()}`,
                        sub: pod.gpuCatalogId,
                    },
                    {
                        label: "Container disk",
                        value: `${pod.containerDiskGb} GB`,
                        sub: pod.volumeGb > 0 ? `+ ${pod.volumeGb} GB volume` : "ephemeral",
                    },
                    {
                        label: "Hourly cost",
                        value: `$${pod.hourlyCostUsd.toFixed(2)}`,
                        sub: `~$${monthlyEst.toFixed(2)}/mo`,
                    },
                    {
                        label: "Cloud",
                        value: pod.cloudType === "SECURE" ? "Secure" : "Community",
                        sub: pod.dataCenterId || "—",
                    },
                ].map((s) => (
                    <div key={s.label} className="glass-panel p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                            {s.label}
                        </p>
                        <p className="mt-3 text-xl font-semibold text-white tabular-nums">
                            {s.value}
                        </p>
                        <p className="mt-1 truncate text-xs text-white/40">{s.sub}</p>
                    </div>
                ))}
            </div>

            {/* Connection details */}
            <div className="glass-panel overflow-hidden">
                <div className="border-b border-white/[0.06] px-6 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                        Connection
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-white">SSH access</h2>
                </div>
                <div className="divide-y divide-white/[0.04]">
                    <Row
                        label="Public IP"
                        value={pod.publicIp || "—"}
                        mono
                        onCopy={pod.publicIp ? () => copy(pod.publicIp!, "IP") : undefined}
                    />
                    <Row
                        label="SSH command"
                        value={pod.sshCommand || "Available once running"}
                        mono
                        onCopy={
                            pod.sshCommand
                                ? () => copy(pod.sshCommand!, "SSH command")
                                : undefined
                        }
                    />
                    <Row
                        label="Exposed ports"
                        value={pod.ports.length > 0 ? pod.ports.join(", ") : "—"}
                        mono
                    />
                    <Row
                        label="Port mappings"
                        value={
                            pod.portMappings && Object.keys(pod.portMappings).length > 0
                                ? Object.entries(pod.portMappings)
                                      .map(([k, v]) => `${k}→${v}`)
                                      .join(", ")
                                : "—"
                        }
                        mono
                    />
                </div>
            </div>

            {/* Config */}
            <div className="glass-panel overflow-hidden">
                <div className="border-b border-white/[0.06] px-6 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                        Configuration
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-white">Pod spec</h2>
                </div>
                <div className="divide-y divide-white/[0.04]">
                    <Row label="Image" value={pod.imageName} mono />
                    <Row label="Template" value={pod.templateId || "—"} />
                    <Row
                        label="Pricing mode"
                        value={pod.interruptible ? "Spot (interruptible)" : "On-demand"}
                    />
                    <Row
                        label="Env variables"
                        value={
                            pod.envKeys.length > 0
                                ? pod.envKeys.join(", ")
                                : "—"
                        }
                        mono
                    />
                    <Row
                        label="RunPod ID"
                        value={pod.runpodPodId || "—"}
                        mono
                        onCopy={
                            pod.runpodPodId
                                ? () => copy(pod.runpodPodId!, "RunPod ID")
                                : undefined
                        }
                    />
                    <Row
                        label="Network volume"
                        value={pod.networkVolumeId || "—"}
                        mono
                    />
                    <Row
                        label="Created"
                        value={new Date(pod.createdAt).toLocaleString()}
                    />
                </div>
            </div>
        </div>
    );
}

function Row({
    label,
    value,
    mono,
    onCopy,
}: {
    label: string;
    value: string;
    mono?: boolean;
    onCopy?: () => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4 px-6 py-3">
            <span className="text-sm text-white/42">{label}</span>
            <div className="flex min-w-0 items-center gap-2">
                <span
                    className={`truncate text-sm text-white/85 ${
                        mono ? "font-mono" : ""
                    }`}
                >
                    {value}
                </span>
                {onCopy && (
                    <button
                        type="button"
                        onClick={onCopy}
                        className="shrink-0 text-white/20 transition-colors hover:text-white/60"
                    >
                        <Copy className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
