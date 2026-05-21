"use client";

// GPU network volumes. Persistent block storage that survives pod
// destruction. Attached to pods at deploy time; pinned to a single
// datacenter (the pod is forced into that DC when mounting).

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { Loader2 } from "lucide-react";

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
    "h-9 border-white/[0.1] bg-[#0f1116] text-white text-[13px] placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/25";

function statusMeta(status: VolumeSummary["status"]): { dot: string; label: string } {
    switch (status) {
        case "available": return { dot: "bg-emerald-400",    label: "Available" };
        case "attached":  return { dot: "bg-[#0095FF]",      label: "Attached"  };
        case "creating":  return { dot: "bg-amber-400",      label: "Creating"  };
        case "error":     return { dot: "bg-red-400",        label: "Error"     };
        default:          return { dot: "bg-white/25",       label: "Deleted"   };
    }
}

function dcLabel(id: string): string {
    return DATA_CENTERS.find((d) => d.id === id)?.label ?? id;
}

export default function GpuStorage() {
    const supabase = createClient();
    const [volumes, setVolumes] = useState<VolumeSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [destroying, setDestroying] = useState<Record<number, boolean>>({});
    const [showCreate, setShowCreate] = useState(false);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
            if (!silent) toast.error(e instanceof Error ? e.message : "Unable to load volumes");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(false);
        const channel = supabase
            .channel("gpu-volumes-page")
            .on("postgres_changes",
                { event: "*", schema: "public", table: "gpu_network_volumes" },
                () => load(true)
            ).subscribe();
        channelRef.current = channel;
        return () => { channel.unsubscribe(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function onCreate() {
        if (!name.trim()) { toast.error("Name is required"); return; }
        if (sizeGb < 1 || sizeGb > 4000) { toast.error("Size must be 1–4000 GB"); return; }
        setCreating(true);
        try {
            const res = await fetch("/api/services/gpu/volumes", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": generateIdempotencyKey("gpu-vol"),
                },
                body: JSON.stringify({ name: name.trim(), sizeGb, dataCenterId }),
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
            toast.error("Destroy the pod first — volumes can't be detached");
            return;
        }
        if (!confirm(`Destroy "${vol.name}" (${vol.sizeGb} GB)? This is permanent.`)) return;
        setDestroying((s) => ({ ...s, [vol.id]: true }));
        try {
            const res = await fetch(`/api/services/gpu/volumes/${vol.id}`, { method: "DELETE" });
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
    const attachedCount = volumes.filter((v) => v.status === "attached").length;

    return (
        <div className="space-y-8">
            {/* Header */}
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-[28px] font-semibold tracking-tight text-white">Network volumes</h1>
                    <p className="mt-1.5 text-[14px] text-white/55 max-w-xl">
                        Persistent storage that outlives pods. Mounted at <span className="font-mono text-white/70">/workspace</span>.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => load(false)}
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 border-white/[0.1] bg-transparent hover:bg-white/[0.04] text-white/80 hover:text-white text-[12.5px] font-medium"
                    >
                        Refresh
                    </Button>
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 border-white/[0.1] bg-transparent hover:bg-white/[0.04] text-white/80 hover:text-white text-[12.5px] font-medium"
                    >
                        <Link href="/dashboard/services/gpu">Back to GPU</Link>
                    </Button>
                    <Button
                        onClick={() => setShowCreate((s) => !s)}
                        size="sm"
                        className="h-9 px-4 bg-[#0095FF] hover:bg-[#0aa0ff] text-white text-[12.5px] font-medium"
                    >
                        {showCreate ? "Close" : "Create volume"}
                    </Button>
                </div>
            </header>

            {/* Stats */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile label="Volumes" value={String(volumes.length)} />
                <StatTile label="Total size" value={`${totalGb} GB`} />
                <StatTile label="Monthly cost" value={`$${monthlyTotal.toFixed(2)}`} />
                <StatTile label="Attached" value={String(attachedCount)} />
            </section>

            {/* Create form */}
            {showCreate && (
                <section className="border border-white/[0.08] bg-[#15171c]">
                    <div className="border-b border-white/[0.06] px-5 py-3">
                        <h2 className="text-[14px] font-semibold text-white">New volume</h2>
                        <p className="mt-0.5 text-[12px] text-white/45">
                            $0.07/GB-month up to 1 TB, $0.05/GB-month beyond.
                        </p>
                    </div>
                    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_120px_240px_auto]">
                        <div>
                            <Label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
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
                            <Label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
                                Size (GB)
                            </Label>
                            <Input
                                type="number"
                                min={1}
                                max={4000}
                                value={sizeGb}
                                onChange={(e) =>
                                    setSizeGb(
                                        Math.max(1, Math.min(4000, parseInt(e.target.value || "1", 10)))
                                    )
                                }
                                className={inputClassName}
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
                                Datacenter
                            </Label>
                            <Select value={dataCenterId} onValueChange={setDataCenterId}>
                                <SelectTrigger className={inputClassName}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-white/[0.1] bg-[#15171c] text-white">
                                    {DATA_CENTERS.map((d) => (
                                        <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowCreate(false)}
                                className="h-9 px-3 border-white/[0.1] bg-transparent hover:bg-white/[0.04] text-white/80 hover:text-white text-[12.5px] font-medium"
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={onCreate}
                                disabled={creating}
                                className="h-9 px-4 bg-[#0095FF] hover:bg-[#0aa0ff] text-white text-[12.5px] font-medium disabled:opacity-50"
                            >
                                {creating ? (
                                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Creating</>
                                ) : "Create"}
                            </Button>
                        </div>
                    </div>
                </section>
            )}

            {/* List */}
            <section>
                <div className="mb-3 flex items-end justify-between flex-wrap gap-2">
                    <h2 className="text-[17px] font-semibold tracking-tight text-white">Volumes</h2>
                    {volumes.length > 0 && (
                        <span className="text-[11.5px] text-white/45 font-mono tabular-nums">
                            {volumes.length} total
                        </span>
                    )}
                </div>

                {loading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="h-[56px] border border-white/[0.06] bg-[#15171c] animate-pulse"
                                style={{ animationDelay: `${i * 60}ms` }}
                            />
                        ))}
                    </div>
                ) : volumes.length === 0 ? (
                    <div className="border border-white/[0.08] bg-[#15171c] px-6 py-12 text-center">
                        <p className="text-[14px] font-semibold text-white">No volumes yet</p>
                        <p className="mt-1 text-[12px] text-white/45">
                            Create one to persist data across pod restarts and redeploys.
                        </p>
                        <Button
                            onClick={() => setShowCreate(true)}
                            size="sm"
                            className="mt-4 h-9 px-4 bg-[#0095FF] hover:bg-[#0aa0ff] text-white text-[12.5px] font-medium"
                        >
                            Create volume
                        </Button>
                    </div>
                ) : (
                    <div className="border border-white/[0.08] bg-[#15171c]">
                        <div className="hidden sm:grid grid-cols-[minmax(0,1.5fr)_100px_minmax(0,1.3fr)_140px_120px_40px] gap-4 border-b border-white/[0.06] px-5 py-2.5">
                            {["Name", "Size", "Datacenter", "Status", "Monthly", ""].map((h, i) => (
                                <div
                                    key={i}
                                    className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/40"
                                >
                                    {h}
                                </div>
                            ))}
                        </div>

                        {volumes.map((vol) => {
                            const s = statusMeta(vol.status);
                            return (
                                <div
                                    key={vol.id}
                                    className="grid grid-cols-1 gap-2 border-b border-white/[0.04] px-5 py-3.5 last:border-b-0 hover:bg-white/[0.015] transition-colors sm:grid-cols-[minmax(0,1.5fr)_100px_minmax(0,1.3fr)_140px_120px_40px] sm:items-center sm:gap-4"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-mono text-[13px] font-semibold text-white">
                                            {vol.name}
                                        </p>
                                        {vol.runpodVolumeId && (
                                            <p className="mt-0.5 truncate font-mono text-[10.5px] text-white/30">
                                                {vol.runpodVolumeId}
                                            </p>
                                        )}
                                    </div>
                                    <p className="font-mono text-[13px] text-white tabular-nums">
                                        {vol.sizeGb} GB
                                    </p>
                                    <p className="truncate text-[12.5px] text-white/55">
                                        {dcLabel(vol.dataCenterId)}
                                    </p>
                                    <div className="inline-flex items-center gap-1.5 text-[12px] text-white/75">
                                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                                        {s.label}
                                    </div>
                                    <p className="font-mono text-[13px] text-white tabular-nums">
                                        ${vol.monthlyCostUsd.toFixed(2)}
                                        <span className="ml-0.5 text-[10.5px] font-normal text-white/40">/mo</span>
                                    </p>
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => onDelete(vol)}
                                            disabled={!!destroying[vol.id] || vol.status === "attached"}
                                            title={
                                                vol.status === "attached"
                                                    ? "Destroy the pod first"
                                                    : "Destroy volume"
                                            }
                                            className="h-7 px-2 border border-white/[0.08] bg-transparent text-[11px] text-white/65 hover:text-white hover:border-white/[0.2] transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            {destroying[vol.id] ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : "Destroy"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Tip */}
            <section className="border border-white/[0.06] bg-[#15171c] px-5 py-3.5">
                <p className="text-[12px] leading-5 text-white/55">
                    <span className="font-semibold text-white/80">Note</span> · Network volumes are pinned to a single datacenter. Any pod that mounts one is forced into that DC. Volumes can only be attached at pod-create time and cannot be detached without destroying the pod.
                </p>
            </section>
        </div>
    );
}

function StatTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="border border-white/[0.08] bg-[#15171c] px-4 py-3.5">
            <p className="text-[10.5px] uppercase tracking-[0.16em] text-white/45 font-medium">{label}</p>
            <p className="mt-1.5 text-[22px] font-semibold tabular-nums leading-none text-white tracking-tight">
                {value}
            </p>
        </div>
    );
}
