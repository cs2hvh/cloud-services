"use client";

// GPU network volumes. Persistent block storage that survives pod destruction.
// Attached to pods at deploy time; pinned to a single datacenter (the pod is
// forced into that DC when mounting). Editorial dark theme to match the GPU
// dashboard / pod detail: aurora + dotted grid canvas, mono labels, Nunito
// serif accents, brand-blue #0095FF.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { RegionFlag } from "@/components/ui/region-flag";
import { createClient } from "@/lib/supabase/client";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { ArrowLeft, HardDrive, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";

// ─── Design tokens (shared with the GPU surfaces) ──────────────────
const SERIF_STYLE: CSSProperties = { fontFamily: "var(--font-nunito), system-ui, sans-serif" };
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

const DATA_CENTERS: { id: string; label: string; cc: string }[] = [
    { id: "US-CA-2", label: "United States — California", cc: "us" },
    { id: "US-TX-3", label: "United States — Texas", cc: "us" },
    { id: "US-WA-1", label: "United States — Washington", cc: "us" },
    { id: "US-KS-2", label: "United States — Kansas", cc: "us" },
    { id: "US-IL-1", label: "United States — Illinois", cc: "us" },
    { id: "CA-MTL-1", label: "Canada — Montreal", cc: "ca" },
    { id: "EU-RO-1", label: "Europe — Romania", cc: "ro" },
    { id: "EU-NL-1", label: "Europe — Netherlands", cc: "nl" },
    { id: "EU-FR-1", label: "Europe — France", cc: "fr" },
    { id: "EU-SE-1", label: "Europe — Sweden", cc: "se" },
    { id: "EUR-NO-1", label: "Europe — Norway", cc: "no" },
    { id: "AP-JP-1", label: "Asia Pacific — Japan", cc: "jp" },
    { id: "OC-AU-1", label: "Oceania — Australia", cc: "au" },
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
    "h-10 rounded-[5px] border-white/[0.08] bg-[#0d0e11] text-white text-[13px] placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-[#0095FF]/60";

function statusMeta(status: VolumeSummary["status"]): { color: string; label: string; pulse?: boolean } {
    switch (status) {
        case "available": return { color: "#4ade80", label: "Available", pulse: true };
        case "attached":  return { color: ACCENT, label: "Attached", pulse: true };
        case "creating":  return { color: "#fbbf24", label: "Creating", pulse: true };
        case "error":     return { color: "#f87171", label: "Error" };
        default:          return { color: "rgba(255,255,255,0.3)", label: "Deleted" };
    }
}

function dc(id: string) {
    return DATA_CENTERS.find((d) => d.id === id);
}

export default function GpuStorage() {
    const confirm = useConfirm();
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
        if (!(await confirm({ title: `Destroy "${vol.name}" (${vol.sizeGb} GB)?`, description: "This permanently deletes the volume and all data on it.", confirmText: "Destroy", danger: true }))) return;
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
        <>
                {/* Hero */}
                <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-8">
                    <div className="max-w-3xl">
                        <Link href="/dashboard/services/gpu" className={`${MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition-colors mb-5`}>
                            <ArrowLeft className="h-3 w-3" />
                            Back to GPU Cloud
                        </Link>
                        <div className={`${MONO} mb-3 flex items-center gap-3 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
                            <span className="h-px w-4" style={{ background: ACCENT }} />
                            GPU Cloud · Storage
                        </div>
                        <h1 className="text-[34px] sm:text-[42px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
                            Network{" "}
                            <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">volumes</span>
                        </h1>
                        <p className={`mt-3 max-w-xl text-[13px] text-white/55 leading-relaxed`}>
                            Persistent block storage that outlives pods — mounted at{" "}
                            <span className={`${MONO} text-white/75`}>/workspace</span>. Attach at deploy
                            time; pinned to a single datacenter.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => load(false)}
                            className={`${MONO} inline-flex h-10 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                        >
                            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCreate((s) => !s)}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#000000'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'none'; }}
                            className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                            style={{
                                background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                                color: "#fff",
                                boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                            }}
                        >
                            {showCreate ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            {showCreate ? "Close" : "New volume"}
                        </button>
                    </div>
                </header>

                {/* Stats strip */}
                <section className="mb-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatTile label="Volumes" value={String(volumes.length)} hint="Provisioned" accent />
                    <StatTile label="Total size" value={String(totalGb)} suffix="GB" hint="Aggregate" />
                    <StatTile label="Monthly cost" value={`$${monthlyTotal.toFixed(2)}`} hint="At current usage" />
                    <StatTile label="Attached" value={String(attachedCount)} hint={attachedCount === 1 ? "In use" : "In use"} tone="green" />
                </section>

                {/* Create form */}
                {showCreate && (
                    <section className="mb-8 border border-white/[0.07] bg-[#111216] rounded-[8px] overflow-hidden">
                        <div className="border-b border-white/[0.06] px-5 py-3.5">
                            <h2 style={SERIF_STYLE} className="text-[16px] font-semibold text-white">New volume</h2>
                            <p className={`${MONO} mt-0.5 text-[11px] text-white/45`}>
                                $0.07 / GB-month up to 1 TB, $0.05 / GB-month beyond.
                            </p>
                        </div>
                        <div className="grid gap-3.5 px-5 py-4 sm:grid-cols-[1fr_130px_260px_auto] sm:items-end">
                            <Field label="Name">
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="model-weights" className={inputClassName} />
                            </Field>
                            <Field label="Size (GB)">
                                <Input
                                    type="number"
                                    min={1}
                                    max={4000}
                                    value={sizeGb}
                                    onChange={(e) => setSizeGb(Math.max(1, Math.min(4000, parseInt(e.target.value || "1", 10))))}
                                    className={inputClassName}
                                />
                            </Field>
                            <Field label="Datacenter">
                                <Select value={dataCenterId} onValueChange={setDataCenterId}>
                                    <SelectTrigger className={inputClassName}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                                        {DATA_CENTERS.map((d) => (
                                            <SelectItem key={d.id} value={d.id}>
                                                <span className="inline-flex items-center gap-2">
                                                    <RegionFlag code={d.cc} size={14} />
                                                    {d.label}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreate(false)}
                                    className={`${MONO} h-10 inline-flex items-center px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white rounded-[5px] transition-colors`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={onCreate}
                                    disabled={creating}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#000000'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'none'; }}
                                    className={`${MONO} h-10 inline-flex items-center gap-1.5 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-60`}
                                    style={{ background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`, color: "#fff", boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)" }}
                                >
                                    {creating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating</> : "Create"}
                                </button>
                            </div>
                        </div>
                    </section>
                )}

                {/* List */}
                <div className={`${MONO} mb-3 text-[10.5px] uppercase tracking-[0.14em] text-white/35`}>
                    {volumes.length > 0 ? `${volumes.length} volume${volumes.length === 1 ? "" : "s"}` : "Volumes"}
                </div>

                {loading ? (
                    <div className="space-y-2.5">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-[64px] border border-white/[0.06] bg-[#111216] rounded-[6px] animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
                        ))}
                    </div>
                ) : volumes.length === 0 ? (
                    <div className="relative border border-white/[0.07] bg-[#111216] rounded-[8px] px-8 py-10 text-center overflow-hidden">
                        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 30% 20%, rgba(0,149,255,0.04), transparent 50%)" }} />
                        <div className="relative z-10 mx-auto mb-3.5 h-10 w-10 inline-flex items-center justify-center rounded-full" style={{ color: ACCENT, background: "rgba(0,149,255,0.10)", border: "1px solid rgba(0,149,255,0.22)" }}>
                            <HardDrive className="h-[18px] w-[18px]" />
                        </div>
                        <h3 className="relative z-10 text-[15px] font-semibold text-white">No volumes yet</h3>
                        <p className={`${MONO} relative z-10 mt-1.5 max-w-sm mx-auto text-[11px] text-white/45`}>
                            Create one to persist data across pod restarts and redeploys.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowCreate(true)}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#000000'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'none'; }}
                            className={`${MONO} relative z-10 mt-4 inline-flex h-9 items-center gap-1.5 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                            style={{ background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`, color: "#fff", boxShadow: "0 8px 20px rgba(0,149,255,0.20)" }}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            New volume
                        </button>
                    </div>
                ) : (
                    <div className="border border-white/[0.06] bg-[#111216] rounded-[8px] overflow-hidden">
                        {/* Column headers */}
                        <div className="hidden sm:grid grid-cols-[minmax(0,1.5fr)_90px_minmax(0,1.4fr)_130px_120px_44px] gap-4 border-b border-white/[0.06] px-5 py-2.5">
                            {["Name", "Size", "Datacenter", "Status", "Monthly", ""].map((h, i) => (
                                <ColHead key={i} align={h === "Monthly" ? "right" : "left"}>{h}</ColHead>
                            ))}
                        </div>

                        {volumes.map((vol) => {
                            const s = statusMeta(vol.status);
                            const d = dc(vol.dataCenterId);
                            return (
                                <div
                                    key={vol.id}
                                    className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-white/[0.04] px-5 py-3.5 last:border-b-0 hover:bg-white/[0.015] transition-colors sm:grid-cols-[minmax(0,1.5fr)_90px_minmax(0,1.4fr)_130px_120px_44px] sm:items-center sm:gap-y-0"
                                >
                                    {/* Name */}
                                    <div className="col-span-2 sm:col-span-1 min-w-0">
                                        <p style={SERIF_STYLE} className="truncate text-[15px] font-semibold text-white">{vol.name}</p>
                                        {vol.runpodVolumeId && (
                                            <p className={`${MONO} mt-0.5 truncate text-[10px] text-white/30`}>{vol.runpodVolumeId}</p>
                                        )}
                                    </div>
                                    {/* Size */}
                                    <Cell label="Size">
                                        <span className="text-[12.5px] text-white/90 tabular-nums">{vol.sizeGb} GB</span>
                                    </Cell>
                                    {/* Datacenter */}
                                    <Cell label="Datacenter">
                                        <span className="inline-flex items-center gap-2 min-w-0">
                                            {d && <RegionFlag code={d.cc} size={15} />}
                                            <span className="truncate text-[12px] text-white/70">{d?.label ?? vol.dataCenterId}</span>
                                        </span>
                                    </Cell>
                                    {/* Status */}
                                    <Cell label="Status">
                                        <span className={`${MONO} inline-flex items-center gap-1.5 text-[11px]`} style={{ color: s.color }}>
                                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color, boxShadow: s.color.startsWith("rgba") ? "none" : `0 0 5px ${s.color}` }} />
                                            {s.label}
                                        </span>
                                    </Cell>
                                    {/* Monthly */}
                                    <Cell label="Monthly" align="right">
                                        <span style={SERIF_STYLE} className="text-[15px] font-bold tabular-nums text-white">
                                            ${vol.monthlyCostUsd.toFixed(2)}
                                        </span>
                                        <span className={`${MONO} ml-0.5 text-[9.5px] text-white/40`}>/mo</span>
                                    </Cell>
                                    {/* Destroy */}
                                    <div className="col-span-2 sm:col-span-1 flex sm:justify-end">
                                        <button
                                            type="button"
                                            onClick={() => onDelete(vol)}
                                            disabled={!!destroying[vol.id] || vol.status === "attached"}
                                            title={vol.status === "attached" ? "Destroy the pod first" : "Destroy volume"}
                                            className="h-8 w-8 inline-flex items-center justify-center rounded-[5px] border border-white/[0.08] bg-[#0d0e11] text-white/55 hover:text-rose-300 hover:border-rose-500/30 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            {destroying[vol.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

        </>
    );
}

// ─── Subcomponents ─────────────────────────────────────────────────

function StatTile({
    label,
    value,
    suffix,
    hint,
    accent,
    tone,
}: {
    label: string;
    value: string;
    suffix?: string;
    hint?: string;
    accent?: boolean;
    tone?: "green";
}) {
    const dotColor = tone === "green" ? "#4ade80" : accent ? ACCENT : "rgba(255,255,255,0.45)";
    return (
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full shrink-0" style={{ background: dotColor, boxShadow: dotColor.startsWith("rgba") ? "none" : `0 0 5px ${dotColor}` }} />
                <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span style={SERIF_STYLE} className="text-[30px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white">{value}</span>
                {suffix && <span style={SERIF_STYLE} className="text-[14px] text-white/40 font-medium">{suffix}</span>}
            </div>
            {hint && <p className={`${MONO} text-[10.5px] text-white/40 mt-auto`}>{hint}</p>}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-white/45`}>{label}</label>
            {children}
        </div>
    );
}

function ColHead({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
    return (
        <span className={`${MONO} text-[9.5px] uppercase tracking-[0.16em] text-white/35 ${align === "right" ? "text-right" : ""}`}>
            {children}
        </span>
    );
}

function Cell({ label, children, align = "left" }: { label: string; children: React.ReactNode; align?: "left" | "right" }) {
    return (
        <div className={`min-w-0 ${align === "right" ? "sm:text-right" : ""}`}>
            <span className={`${MONO} sm:hidden mb-0.5 block text-[9px] uppercase tracking-[0.12em] text-white/30`}>{label}</span>
            {children}
        </div>
    );
}
