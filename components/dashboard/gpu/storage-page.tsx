"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { generateIdempotencyKey } from "@/lib/idempotency";
import {
    AlertTriangle,
    ArrowLeft,
    HardDrive,
    Loader2,
    Plus,
    RotateCw,
    Trash2,
} from "lucide-react";

// Common RunPod datacenters that support network volumes. The full list is
// not exhaustively documented; this covers the regions users actually pick.
const DATA_CENTERS = [
    { id: "US-CA-2", label: "United States — California" },
    { id: "US-TX-3", label: "United States — Texas" },
    { id: "US-WA-1", label: "United States — Washington" },
    { id: "US-KS-2", label: "United States — Kansas" },
    { id: "US-IL-1", label: "United States — Illinois" },
    { id: "CA-MTL-1", label: "Canada — Montreal" },
    { id: "EU-RO-1", label: "Europe — Romania" },
    { id: "EU-NL-1", label: "Europe — Netherlands" },
    { id: "EU-FR-1", label: "Europe — France" },
    { id: "EU-SE-1", label: "Europe — Sweden" },
    { id: "EUR-NO-1", label: "Europe — Norway" },
    { id: "AP-JP-1", label: "Asia Pacific — Japan" },
    { id: "OC-AU-1", label: "Oceania — Australia" },
];

interface VolumeSummary {
    id: number;
    runpodVolumeId: string | null;
    name: string;
    sizeGb: number;
    dataCenterId: string;
    status: "creating" | "available" | "attached" | "error" | "deleted";
    monthlyCostUsd: number;
    createdAt: string;
}

const inputClassName =
    "border-white/[0.14] bg-white/[0.05] text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/25";

function statusStyle(status: VolumeSummary["status"]) {
    switch (status) {
        case "available":
            return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
        case "attached":
            return "border-blue-500/20 bg-blue-500/10 text-blue-300";
        case "creating":
            return "border-amber-500/20 bg-amber-500/10 text-amber-300";
        case "error":
            return "border-red-500/20 bg-red-500/10 text-red-300";
        default:
            return "border-white/[0.08] bg-white/[0.04] text-white/40";
    }
}

function dcLabel(id: string): string {
    const match = DATA_CENTERS.find((d) => d.id === id);
    return match ? match.label : id;
}

export default function GpuStorage() {
    const supabase = createClient();
    const [volumes, setVolumes] = useState<VolumeSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [destroying, setDestroying] = useState<Record<number, boolean>>({});
    const [showCreate, setShowCreate] = useState(false);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    // Create form
    const [name, setName] = useState("");
    const [sizeGb, setSizeGb] = useState(100);
    const [dataCenterId, setDataCenterId] = useState(DATA_CENTERS[0].id);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch("/api/services/gpu/volumes", { cache: "no-store" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
            setVolumes(json.volumes as VolumeSummary[]);
        } catch (e) {
            if (!silent) {
                toast.error(e instanceof Error ? e.message : "Unable to load volumes");
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(false);
        const channel = supabase
            .channel("gpu-volumes-page")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "gpu_network_volumes" },
                () => load(true)
            )
            .subscribe();
        channelRef.current = channel;
        return () => {
            channel.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function onCreate() {
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        if (sizeGb < 1 || sizeGb > 4000) {
            toast.error("Size must be 1–4000 GB");
            return;
        }
        setCreating(true);
        try {
            const res = await fetch("/api/services/gpu/volumes", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": generateIdempotencyKey("gpu-vol"),
                },
                body: JSON.stringify({
                    name: name.trim(),
                    sizeGb,
                    dataCenterId,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) throw new Error(json.error || "Create failed");
            toast.success(`Volume "${name.trim()}" created`);
            setName("");
            setSizeGb(100);
            setShowCreate(false);
            await load(true);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Create failed");
        } finally {
            setCreating(false);
        }
    }

    async function onDelete(vol: VolumeSummary) {
        if (vol.status === "attached") {
            toast.error("Detach the pod first (destroy the pod that uses this volume)");
            return;
        }
        if (!confirm(`Destroy volume "${vol.name}" (${vol.sizeGb} GB)? This is permanent.`)) {
            return;
        }
        setDestroying((s) => ({ ...s, [vol.id]: true }));
        try {
            const res = await fetch(`/api/services/gpu/volumes/${vol.id}`, {
                method: "DELETE",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) throw new Error(json.error || "Delete failed");
            toast.success("Volume destroyed");
            await load(true);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Delete failed");
        } finally {
            setDestroying((s) => ({ ...s, [vol.id]: false }));
        }
    }

    const totalGb = volumes.reduce((sum, v) => sum + v.sizeGb, 0);
    const monthlyTotal = volumes.reduce((sum, v) => sum + v.monthlyCostUsd, 0);

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
                        <nav className="mb-3 flex items-center gap-1.5 text-sm text-white/38">
                            <Link
                                href="/dashboard/services/gpu"
                                className="flex items-center gap-1.5 transition-colors hover:text-white/70"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" />
                                GPU Cloud
                            </Link>
                        </nav>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300/70">
                            Persistent Storage
                        </p>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                            Network volumes
                        </h1>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
                            Persistent block storage that survives pod destruction. Mounted at{" "}
                            <code className="rounded-sm bg-white/[0.06] px-1 py-0.5 font-mono text-[12px] text-white/80">
                                /workspace
                            </code>{" "}
                            on attached pods. Use this for model weights, datasets, and any
                            work you don't want to lose.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                                onClick={() => load(false)}
                                variant="outline"
                                size="sm"
                                className="rounded-none border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            >
                                <RotateCw className="mr-2 h-3.5 w-3.5" />
                                Refresh
                            </Button>
                            <Button
                                onClick={() => setShowCreate((s) => !s)}
                                size="sm"
                                className="rounded-none border border-fuchsia-400/25 bg-fuchsia-500/90 text-slate-950 hover:bg-fuchsia-400"
                            >
                                <Plus className="mr-2 h-3.5 w-3.5" />
                                Create volume
                            </Button>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                    {
                        label: "Volumes",
                        value: volumes.length,
                        sub: "Across all datacenters",
                    },
                    { label: "Total size", value: `${totalGb} GB`, sub: "Allocated" },
                    {
                        label: "Monthly cost",
                        value: `$${monthlyTotal.toFixed(2)}`,
                        sub: "At current sizes",
                    },
                    {
                        label: "Attached",
                        value: volumes.filter((v) => v.status === "attached").length,
                        sub: "In use by pods",
                    },
                ].map((s) => (
                    <div key={s.label} className="glass-panel p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                            {s.label}
                        </p>
                        <p className="mt-3 text-2xl font-semibold tracking-tight text-white tabular-nums">
                            {s.value}
                        </p>
                        <p className="mt-1 text-xs text-white/40">{s.sub}</p>
                    </div>
                ))}
            </div>

            {/* Create form */}
            {showCreate && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="glass-panel overflow-hidden"
                >
                    <div className="border-b border-white/[0.06] px-6 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                            New volume
                        </p>
                        <h2 className="mt-1 text-base font-semibold text-white">
                            Create a network volume
                        </h2>
                    </div>
                    <div className="grid gap-4 px-6 py-5 sm:grid-cols-[1fr_140px_220px_auto]">
                        <div>
                            <Label className="mb-2 block text-sm font-medium text-white/78">
                                Name
                            </Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="model-weights"
                                className={inputClassName}
                            />
                        </div>
                        <div>
                            <Label className="mb-2 block text-sm font-medium text-white/78">
                                Size (GB)
                            </Label>
                            <Input
                                type="number"
                                min={1}
                                max={4000}
                                value={sizeGb}
                                onChange={(e) =>
                                    setSizeGb(
                                        Math.max(
                                            1,
                                            Math.min(4000, parseInt(e.target.value || "1", 10))
                                        )
                                    )
                                }
                                className={inputClassName}
                            />
                        </div>
                        <div>
                            <Label className="mb-2 block text-sm font-medium text-white/78">
                                Datacenter
                            </Label>
                            <Select value={dataCenterId} onValueChange={setDataCenterId}>
                                <SelectTrigger className={inputClassName}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-white/[0.12] bg-[#0a0a0c] text-white">
                                    {DATA_CENTERS.map((d) => (
                                        <SelectItem key={d.id} value={d.id}>
                                            {d.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowCreate(false)}
                                className="rounded-none border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={onCreate}
                                disabled={creating}
                                className="rounded-none border border-fuchsia-400/25 bg-fuchsia-500/90 text-slate-950 hover:bg-fuchsia-400 disabled:opacity-50"
                            >
                                {creating ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Creating…
                                    </>
                                ) : (
                                    "Create"
                                )}
                            </Button>
                        </div>
                    </div>
                    <div className="border-t border-white/[0.04] px-6 py-3 text-[11px] leading-5 text-white/45">
                        <AlertTriangle className="mr-1.5 inline h-3 w-3 -translate-y-0.5 text-amber-300/80" />
                        Pricing: <span className="font-mono text-white/70">$0.07/GB-month</span>{" "}
                        up to 1 TB, $0.05/GB-month beyond. A volume can only be attached at pod
                        creation time and cannot be detached without destroying the pod.
                    </div>
                </motion.div>
            )}

            {/* List */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06, duration: 0.24 }}
            >
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="glass-panel h-[64px] animate-pulse"
                                style={{ animationDelay: `${i * 60}ms` }}
                            />
                        ))}
                    </div>
                ) : volumes.length === 0 ? (
                    <div className="glass-panel overflow-hidden">
                        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                            <HardDrive className="mb-3 h-10 w-10 text-white/20" />
                            <p className="text-sm font-semibold text-white">No volumes yet</p>
                            <p className="mt-1 max-w-sm text-xs text-white/45">
                                Create a network volume to persist data across pod restarts and
                                redeploys.
                            </p>
                            <Button
                                onClick={() => setShowCreate(true)}
                                size="sm"
                                className="mt-5 rounded-none border border-fuchsia-400/25 bg-fuchsia-500/90 text-slate-950 hover:bg-fuchsia-400"
                            >
                                <Plus className="mr-2 h-3.5 w-3.5" />
                                Create your first volume
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="glass-panel overflow-hidden">
                        <div className="hidden border-b border-white/[0.06] px-5 py-3 sm:grid sm:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1.2fr)_120px_120px_36px] sm:gap-4">
                            {["Name", "Size", "Datacenter", "Status", "Monthly"].map((h) => (
                                <div
                                    key={h}
                                    className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/28"
                                >
                                    {h}
                                </div>
                            ))}
                            <div />
                        </div>

                        {volumes.map((vol) => (
                            <div
                                key={vol.id}
                                className="grid grid-cols-1 gap-2 border-b border-white/[0.04] px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1.2fr)_120px_120px_36px] sm:items-center sm:gap-4"
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-mono text-sm font-semibold text-white">
                                        {vol.name}
                                    </p>
                                    {vol.runpodVolumeId && (
                                        <p className="mt-0.5 truncate font-mono text-[11px] text-white/30">
                                            {vol.runpodVolumeId}
                                        </p>
                                    )}
                                </div>
                                <p className="font-mono text-sm text-white tabular-nums">
                                    {vol.sizeGb} GB
                                </p>
                                <p className="truncate text-sm text-white/55">
                                    {dcLabel(vol.dataCenterId)}
                                </p>
                                <div>
                                    <span
                                        className={`inline-flex items-center border px-2 py-0.5 text-[11px] font-medium ${statusStyle(
                                            vol.status
                                        )}`}
                                    >
                                        {vol.status}
                                    </span>
                                </div>
                                <p className="font-mono text-sm text-white tabular-nums">
                                    ${vol.monthlyCostUsd.toFixed(2)}
                                    <span className="ml-0.5 text-[11px] font-normal text-white/40">
                                        /mo
                                    </span>
                                </p>
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => onDelete(vol)}
                                        disabled={!!destroying[vol.id] || vol.status === "attached"}
                                        title={
                                            vol.status === "attached"
                                                ? "Destroy the pod first"
                                                : "Destroy volume"
                                        }
                                        className="flex h-7 items-center justify-center border border-red-500/15 bg-red-500/10 px-2 text-[11px] text-red-300 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        {destroying[vol.id] ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-3 w-3" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>

            {/* Help */}
            <div className="glass-panel overflow-hidden">
                <div className="px-6 py-4 text-[12px] leading-5 text-white/55">
                    <p className="font-semibold text-white/80">How storage works</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-white/45">
                        <li>
                            <strong className="text-white/65">Container disk</strong> on a pod is
                            wiped every time the pod stops or restarts.
                        </li>
                        <li>
                            <strong className="text-white/65">Pod volume</strong> persists across
                            stops but disappears when the pod is destroyed.
                        </li>
                        <li>
                            <strong className="text-white/65">Network volumes</strong> (this page)
                            survive everything. They live in a specific datacenter; any pod that
                            mounts one will be deployed in that datacenter automatically.
                        </li>
                        <li>
                            Attach a volume to a new pod in the deploy wizard's Storage section.
                            You cannot attach or detach mid-flight without destroying the pod.
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
