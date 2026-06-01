"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";

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

import { NvidiaLogo } from "@/components/branding/nvidia-logo";
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

// ─── Design tokens ────────────────────────────────────────────────
const SERIF_STYLE: CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

function statusMeta(status: PodStatus): { color: string; label: string; pulse: boolean } {
    switch (status) {
        case "running":
            return { color: "#4ade80", label: "Running", pulse: true };
        case "provisioning":
            return { color: ACCENT, label: "Provisioning", pulse: true };
        case "restarting":
            return { color: ACCENT, label: "Restarting", pulse: true };
        case "stopped":
            return { color: "#94a3b8", label: "Stopped", pulse: false };
        case "interrupted":
            return { color: "#fbbf24", label: "Interrupted", pulse: false };
        case "failed":
            return { color: "#f87171", label: "Failed", pulse: false };
        default:
            return { color: "rgba(255,255,255,0.45)", label: String(status), pulse: false };
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
            <div className="space-y-6">
                <div className="h-8 w-48 animate-pulse bg-white/[0.04] rounded-[5px]" />
                <div className="h-16 w-2/3 animate-pulse bg-white/[0.04] rounded-[5px]" />
                <div className="h-24 animate-pulse border border-white/[0.06] bg-[#111216] rounded-[6px]" />
                <div className="h-64 animate-pulse border border-white/[0.06] bg-[#111216] rounded-[6px]" />
            </div>
        );
    }

    if (!pod) {
        return (
            <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-6 py-16 text-center">
                <Sparkles className="mb-4 h-10 w-10 text-white/20 mx-auto" />
                <p className="text-[15px] font-semibold text-white">Pod not found</p>
                <p className={`${MONO} mt-2 text-[11px] text-white/45`}>
                    This pod may have been destroyed.
                </p>
                <Link
                    href="/dashboard/services/gpu"
                    className={`${MONO} mt-6 inline-flex items-center gap-1.5 h-10 px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                >
                    <ArrowLeft className="h-3 w-3" />
                    Back to GPU Cloud
                </Link>
            </div>
        );
    }

    const status = statusMeta(pod.status);
    const isRunning = pod.status === "running";
    const isStopped = pod.status === "stopped";
    const isTerminal = pod.status === "terminated" || pod.status === "failed";
    const monthlyEst = (pod.hourlyCostUsd || 0) * 730;
    const provisioning = pod.details?.provisioning as
        | { stage?: string; progress?: number; message?: string }
        | undefined;

    return (
        <div className="mx-auto max-w-[1600px]">
            {/* ── Hero ─────────────────────────────────────────── */}
            <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-10">
                <div className="max-w-3xl min-w-0">
                    <Link
                        href="/dashboard/services/gpu"
                        className={`${MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition-colors mb-5`}
                    >
                        <ArrowLeft className="h-3 w-3" />
                        Back to GPU Cloud
                    </Link>

                    <div className={`${MONO} flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
                        <span>GPU Cloud</span>
                        <ChevronRight className="h-3 w-3 text-white/20" />
                        <span className="text-white/65 truncate">{pod.name}</span>
                    </div>

                    <h1 className={`${MONO} text-[28px] sm:text-[36px] leading-[1.05] tracking-[-0.015em] text-white font-semibold truncate`}>
                        {pod.name}
                    </h1>

                    <div className={`${MONO} mt-3 text-[11.5px] text-white/45 flex flex-wrap items-center gap-1.5`}>
                        <NvidiaLogo width={18} height={13} className="opacity-95" />
                        <span className="text-white/75 tabular-nums font-medium">
                            {pod.gpuCount}× {pod.gpuCatalogId.toUpperCase()}
                        </span>
                        <span className="text-white/15">·</span>
                        <span>{pod.cloudType === "SECURE" ? "Secure cloud" : "Community"}</span>
                        {pod.dataCenterId && (
                            <>
                                <span className="text-white/15">·</span>
                                <span>{pod.dataCenterId}</span>
                            </>
                        )}
                        {pod.interruptible && (
                            <>
                                <span className="text-white/15">·</span>
                                <span className="text-amber-300/85 uppercase tracking-[0.1em]">
                                    Spot
                                </span>
                            </>
                        )}
                    </div>

                    {provisioning?.stage && pod.status === "provisioning" && (
                        <div className="mt-4 max-w-md">
                            <div className="h-[3px] overflow-hidden bg-white/[0.06] rounded-full">
                                <div
                                    className="h-full transition-all duration-700"
                                    style={{
                                        width: `${provisioning.progress || 10}%`,
                                        background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_BRIGHT})`,
                                        boxShadow: `0 0 8px ${ACCENT}`,
                                    }}
                                />
                            </div>
                            <p className={`${MONO} mt-1.5 text-[10.5px] text-white/55`}>
                                {provisioning.message}
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span
                        className={`${MONO} inline-flex items-center gap-1.5 h-10 px-3.5 border bg-[#111216] text-[11px] uppercase tracking-[0.14em] rounded-[5px]`}
                        style={{ borderColor: `${status.color}33`, color: status.color }}
                    >
                        {pod.status === "provisioning" || pod.status === "restarting" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : pod.status === "failed" ? (
                            <XCircle className="h-3 w-3" />
                        ) : pod.status === "interrupted" ? (
                            <AlertTriangle className="h-3 w-3" />
                        ) : (
                            <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: status.color, boxShadow: `0 0 6px ${status.color}` }}
                            />
                        )}
                        {status.label}
                    </span>

                    {isStopped && (
                        <button
                            type="button"
                            disabled={acting}
                            onClick={() => powerAction("start")}
                            className={`${MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-emerald-500/25 bg-emerald-500/[0.06] text-[11px] uppercase tracking-[0.14em] text-emerald-300 hover:bg-emerald-500/[0.10] rounded-[5px] transition-colors disabled:opacity-50`}
                        >
                            <Play className="h-3 w-3" />
                            Start
                        </button>
                    )}
                    {isRunning && (
                        <button
                            type="button"
                            disabled={acting}
                            onClick={() => powerAction("stop")}
                            className={`${MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50`}
                        >
                            <Pause className="h-3 w-3" />
                            Stop
                        </button>
                    )}
                    {(isRunning || isStopped) && (
                        <button
                            type="button"
                            disabled={acting}
                            onClick={() => powerAction("restart")}
                            className={`${MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50`}
                        >
                            <RotateCw className="h-3 w-3" />
                            Restart
                        </button>
                    )}
                    {!isTerminal && (
                        <button
                            type="button"
                            disabled={acting}
                            onClick={destroyPod}
                            className={`${MONO} h-10 inline-flex items-center gap-1.5 px-3.5 border border-rose-500/25 bg-rose-500/[0.06] text-[11px] uppercase tracking-[0.14em] text-rose-300 hover:bg-rose-500/[0.10] rounded-[5px] transition-colors disabled:opacity-50`}
                        >
                            {acting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Trash2 className="h-3 w-3" />
                            )}
                            Destroy
                        </button>
                    )}
                </div>
            </header>

            {/* ── Stats strip ───────────────────────────────────── */}
            <section className="mb-12 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
                <StatCell
                    label="GPUs"
                    value={`${pod.gpuCount}×`}
                    suffix={pod.gpuCatalogId.split("-")[0].toUpperCase()}
                    hint={pod.gpuCatalogId}
                    accent="#a78bfa"
                />
                <StatCell
                    label="Container disk"
                    value={`${pod.containerDiskGb}`}
                    suffix="GB"
                    hint={pod.volumeGb > 0 ? `+ ${pod.volumeGb} GB volume` : "ephemeral"}
                />
                <StatCell
                    label="Hourly cost"
                    value={`$${pod.hourlyCostUsd.toFixed(2)}`}
                    hint={`≈ $${monthlyEst.toFixed(0)}/mo`}
                    accent={ACCENT}
                />
                <StatCell
                    label="Cloud"
                    value={pod.cloudType === "SECURE" ? "Secure" : "Community"}
                    hint={pod.dataCenterId || "—"}
                />
            </section>

            <div className="space-y-12">
                {/* ── 01 Connection ─────────────────────────────── */}
                <section>
                    <SectionHead index="01" title="The" accent="connection" />
                    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] divide-y divide-white/[0.04]">
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
                </section>

                {/* ── 02 Configuration ──────────────────────────── */}
                <section>
                    <SectionHead index="02" title="Pod" accent="configuration" />
                    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] divide-y divide-white/[0.04]">
                        <Row label="Image" value={pod.imageName} mono />
                        <Row label="Template" value={pod.templateId || "—"} />
                        <Row
                            label="Pricing mode"
                            value={pod.interruptible ? "Spot (interruptible)" : "On-demand"}
                        />
                        <Row
                            label="Env variables"
                            value={pod.envKeys.length > 0 ? pod.envKeys.join(", ") : "—"}
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
                        <Row label="Network volume" value={pod.networkVolumeId || "—"} mono />
                        <Row label="Created" value={new Date(pod.createdAt).toLocaleString()} />
                    </div>
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
}: {
    label: string;
    value: string;
    suffix?: string;
    hint?: string;
    accent?: string;
}) {
    const dotColor = accent ?? "rgba(255,255,255,0.35)";
    return (
        <div className="px-5 py-5 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
                <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                        background: dotColor,
                        boxShadow: accent ? `0 0 6px ${dotColor}` : "none",
                    }}
                />
                <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                    {label}
                </span>
            </div>
            <div className="flex items-baseline gap-1">
                <span
                    style={SERIF_STYLE}
                    className="text-[32px] sm:text-[36px] leading-none font-bold tabular-nums tracking-[-0.03em] text-white"
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
                <p className={`${MONO} text-[10.5px] text-white/40 mt-auto truncate`}>{hint}</p>
            )}
        </div>
    );
}

function SectionHead({
    index,
    title,
    accent,
    meta,
}: {
    index: string;
    title: string;
    accent: string;
    meta?: React.ReactNode;
}) {
    return (
        <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-3">
                <span className={`${MONO} text-[10.5px] tabular-nums text-white/35`}>
                    {index}
                </span>
                <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-white">
                    {title}{" "}
                    <span style={SERIF_STYLE} className="text-white/55 font-normal">
                        {accent}
                    </span>
                    <span className="text-white/55 font-normal">.</span>
                </h2>
            </div>
            {meta && (
                <span className={`${MONO} text-[11px] text-white/45 tabular-nums`}>{meta}</span>
            )}
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
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
            <span className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 shrink-0`}>
                {label}
            </span>
            <div className="flex min-w-0 items-center gap-2">
                <span
                    className={`truncate text-[12.5px] text-white/85 ${
                        mono ? MONO : ""
                    }`}
                >
                    {value}
                </span>
                {onCopy && (
                    <button
                        type="button"
                        onClick={onCopy}
                        className="shrink-0 text-white/25 transition-colors hover:text-[#0095FF]"
                        title="Copy"
                    >
                        <Copy className="h-3 w-3" />
                    </button>
                )}
            </div>
        </div>
    );
}
