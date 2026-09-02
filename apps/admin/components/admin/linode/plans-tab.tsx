"use client";

// Linode admin — Plans: every synced linode_types row grouped by class, with
// the linode_pricing resale controls (markup ≥ 1.0, floor ≥ 0) edited via the
// gpu-tab.tsx draft/dirty/save-per-row pattern. The customer price column
// recomputes live from the draft: max(list hourly × markup, floor), monthly
// = hourly × 720 (base region; per-region overrides resolve at quote time).
// GPU/accelerated classes are shown for completeness but are excluded from the
// customer catalog by policy (EXCLUDED_LINODE_CLASSES).

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const HOURS_PER_MONTH = 720;

interface PlanRow {
    id: string;
    label: string;
    class: string;
    vcpus: number;
    memory_mb: number;
    disk_mb: number;
    transfer_gb: number;
    network_out_mbps: number;
    hourly_usd: number;
    monthly_usd: number;
    backups_hourly_usd: number | null;
    type_is_active: boolean;
    markup_pct: number;
    floor_per_hour_usd: number;
    pricing_is_active: boolean;
    available_regions: number;
    total_regions: number;
}

type Draft = PlanRow & { _dirty?: boolean };

type ClassTab = "shared" | "dedicated" | "highmem" | "premium" | "gpu" | "accelerated";

const CLASS_TABS: { id: ClassTab; label: string; classes: string[]; excluded?: boolean }[] = [
    { id: "shared", label: "Shared", classes: ["nanode", "standard"] },
    { id: "dedicated", label: "Dedicated", classes: ["dedicated"] },
    { id: "highmem", label: "High Memory", classes: ["highmem"] },
    { id: "premium", label: "Premium", classes: ["premium"] },
    { id: "gpu", label: "GPU", classes: ["gpu"], excluded: true },
    { id: "accelerated", label: "Accelerated", classes: ["accelerated"], excluded: true },
];

function round(value: number, dp: number): number {
    const f = Math.pow(10, dp);
    return Math.round(value * f) / f;
}

function resaleHourly(row: Draft): number {
    return round(Math.max(row.hourly_usd * row.markup_pct, row.floor_per_hour_usd), 5);
}

function formatGB(mb: number): string {
    return `${Math.round(mb / 1024)} GB`;
}

export default function PlansTab() {
    const [rows, setRows] = useState<Draft[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [toggling, setToggling] = useState<string | null>(null);
    const [classTab, setClassTab] = useState<ClassTab>("shared");

    const load = () => {
        setLoading(true);
        setError(null);
        fetch("/api/admin/linode/plans", { cache: "no-store" })
            .then((r) => r.json())
            .then((d: { ok?: boolean; plans?: PlanRow[]; error?: string }) => {
                if (!d?.ok) {
                    setError(d?.error ?? "Failed to load plans");
                    return;
                }
                setRows(d.plans ?? []);
            })
            .catch(() => setError("Failed to load plans"))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const update = (id: string, field: "markup_pct" | "floor_per_hour_usd", raw: string) => {
        setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, [field]: Number(raw) || 0, _dirty: true } : r))
        );
    };

    const save = async (row: Draft) => {
        if (!Number.isFinite(row.markup_pct) || row.markup_pct < 1) {
            toast.error("Markup must be ≥ 1.000 (1.25 = 25% markup)");
            return;
        }
        if (!Number.isFinite(row.floor_per_hour_usd) || row.floor_per_hour_usd < 0) {
            toast.error("Floor must be ≥ 0");
            return;
        }
        setSaving(row.id);
        try {
            const res = await fetch("/api/admin/linode/plans", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type_id: row.id,
                    markup_pct: row.markup_pct,
                    floor_per_hour_usd: row.floor_per_hour_usd,
                }),
            });
            const data = (await res.json().catch(() => null)) as {
                ok?: boolean;
                error?: string;
            } | null;
            if (!res.ok || !data?.ok) {
                toast.error(data?.error ?? "Failed to save");
                return;
            }
            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, _dirty: false } : r)));
            toast.success(`Saved ${row.id}`);
        } catch {
            toast.error("Failed to save");
        } finally {
            setSaving(null);
        }
    };

    const toggle = async (
        row: Draft,
        field: "pricing_is_active" | "type_is_active",
        value: boolean
    ) => {
        const key = `${row.id}:${field}`;
        setToggling(key);
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)));
        try {
            const res = await fetch("/api/admin/linode/plans", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type_id: row.id,
                    ...(field === "pricing_is_active"
                        ? { is_active: value }
                        : { type_is_active: value }),
                }),
            });
            const data = (await res.json().catch(() => null)) as {
                ok?: boolean;
                error?: string;
            } | null;
            if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Failed to update");
            toast.success(
                `${row.id} ${field === "pricing_is_active" ? "selling" : "listing"} ${value ? "enabled" : "disabled"}`
            );
        } catch (e) {
            // Revert the optimistic flip.
            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: !value } : r)));
            toast.error(e instanceof Error ? e.message : "Failed to update");
        } finally {
            setToggling(null);
        }
    };

    if (loading) {
        return (
            <div className="space-y-3">
                <div className="h-9 w-full max-w-md animate-pulse border border-white/[0.08] bg-[#111216]" />
                <div className="h-72 animate-pulse border border-white/[0.08] bg-[#111216]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="border border-red-500/20 bg-red-500/[0.06] px-5 py-8 text-center">
                <AlertTriangle className="mx-auto h-5 w-5 text-red-400" />
                <p className="mt-2 text-[13px] text-red-300">{error}</p>
                <button
                    onClick={load}
                    className="mt-4 inline-flex h-8 items-center gap-2 border border-white/[0.1] bg-white/[0.03] px-3 text-[12px] text-white/70 hover:text-white"
                >
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                </button>
            </div>
        );
    }

    const activeTab = CLASS_TABS.find((t) => t.id === classTab) ?? CLASS_TABS[0];
    const visible = rows.filter((r) => activeTab.classes.includes(r.class));
    const countFor = (t: (typeof CLASS_TABS)[number]) =>
        rows.filter((r) => t.classes.includes(r.class)).length;

    return (
        <div className="space-y-4">
            <p className="text-[13px] text-white/50">
                Markup multiplies Linode&apos;s list price (1.25 = 25% markup); floor is the minimum
                customer $/hr. Customer price = max(list × markup, floor). An edited price applies
                to VMs created from then on — running VMs keep the rate they were sold at.
            </p>

            {/* Class sub-tabs */}
            <div className="flex flex-wrap gap-1.5">
                {CLASS_TABS.map((t) => {
                    const active = t.id === classTab;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setClassTab(t.id)}
                            className={`inline-flex h-8 items-center gap-2 border px-3 text-[12.5px] font-medium transition-colors ${
                                active
                                    ? "border-[#0095FF]/50 bg-[#0095FF]/10 text-white"
                                    : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80"
                            }`}
                        >
                            {t.label}
                            <span className={`${MONO} text-[11px] text-white/35`}>{countFor(t)}</span>
                        </button>
                    );
                })}
            </div>

            {activeTab.excluded && (
                <div className="flex items-start gap-2 border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <p className="text-[12.5px] leading-relaxed text-amber-200/90">
                        The <span className={MONO}>{activeTab.classes.join(", ")}</span> class is
                        excluded from the customer compute catalog by policy (GPUs are sold through
                        the RunPod-backed GPU service). Rows are synced and shown here for
                        completeness only.
                    </p>
                </div>
            )}

            <div className="overflow-hidden border border-white/[0.08] bg-[#111216]">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1180px] text-left text-[13px]">
                        <thead>
                            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.14em] text-white/35">
                                <th className="px-4 py-3 font-semibold">Type</th>
                                <th className="px-4 py-3 font-semibold">Specs</th>
                                <th className="px-4 py-3 font-semibold">Linode price</th>
                                <th className="w-32 px-4 py-3 font-semibold">Markup (×)</th>
                                <th className="w-32 px-4 py-3 font-semibold">Floor ($/hr)</th>
                                <th className="px-4 py-3 font-semibold">Customer price</th>
                                <th className="px-4 py-3 font-semibold">Availability</th>
                                <th className="px-4 py-3 font-semibold">Active</th>
                                <th className="w-16 px-4 py-3 font-semibold"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05]">
                            {visible.map((row) => {
                                const customerHourly = resaleHourly(row);
                                const customerMonthly = round(customerHourly * HOURS_PER_MONTH, 2);
                                const availTone =
                                    row.total_regions === 0
                                        ? "border-white/[0.1] bg-white/[0.04] text-white/45"
                                        : row.available_regions === 0
                                          ? "border-red-500/30 bg-red-500/10 text-red-400"
                                          : row.available_regions < row.total_regions
                                            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
                                return (
                                    <tr key={row.id} className="transition-colors hover:bg-white/[0.02]">
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-white">{row.label}</p>
                                            <p className={`${MONO} mt-0.5 text-[11px] text-white/40`}>
                                                {row.id}
                                            </p>
                                        </td>
                                        <td className={`${MONO} px-4 py-3 text-[12px] text-white/60`}>
                                            {row.vcpus} vCPU · {formatGB(row.memory_mb)} ·{" "}
                                            {formatGB(row.disk_mb)} disk
                                        </td>
                                        <td className={`${MONO} px-4 py-3 text-[12px] text-white/60`}>
                                            <p>${row.hourly_usd.toFixed(4)}/hr</p>
                                            <p className="mt-0.5 text-white/40">
                                                ${row.monthly_usd.toFixed(2)}/mo
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Input
                                                type="number"
                                                step="0.001"
                                                min="1"
                                                value={row.markup_pct}
                                                onChange={(e) =>
                                                    update(row.id, "markup_pct", e.target.value)
                                                }
                                                className={`h-8 border-white/[0.1] bg-[#0d0e11] text-[12.5px] text-white ${MONO}`}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <Input
                                                type="number"
                                                step="0.0001"
                                                min="0"
                                                value={row.floor_per_hour_usd}
                                                onChange={(e) =>
                                                    update(
                                                        row.id,
                                                        "floor_per_hour_usd",
                                                        e.target.value
                                                    )
                                                }
                                                className={`h-8 border-white/[0.1] bg-[#0d0e11] text-[12.5px] text-white ${MONO}`}
                                            />
                                        </td>
                                        <td className={`${MONO} px-4 py-3 text-[12px]`}>
                                            <p className="text-[#82adfb]">
                                                ${customerHourly.toFixed(4)}/hr
                                            </p>
                                            <p className="mt-0.5 text-white/40">
                                                ${customerMonthly.toFixed(2)}/mo
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`${MONO} inline-flex items-center border px-2 py-0.5 text-[11px] ${availTone}`}
                                            >
                                                {row.available_regions}/{row.total_regions} regions
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        checked={row.pricing_is_active}
                                                        disabled={
                                                            toggling ===
                                                            `${row.id}:pricing_is_active`
                                                        }
                                                        onCheckedChange={(v) =>
                                                            void toggle(row, "pricing_is_active", v)
                                                        }
                                                        className="data-[state=checked]:bg-[#0095FF]"
                                                    />
                                                    <span className="text-[10.5px] uppercase tracking-wider text-white/35">
                                                        Sell
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        checked={row.type_is_active}
                                                        disabled={
                                                            toggling === `${row.id}:type_is_active`
                                                        }
                                                        onCheckedChange={(v) =>
                                                            void toggle(row, "type_is_active", v)
                                                        }
                                                        className="data-[state=checked]:bg-[#0095FF]"
                                                    />
                                                    <span className="text-[10.5px] uppercase tracking-wider text-white/35">
                                                        Type
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Button
                                                size="sm"
                                                disabled={!row._dirty || saving === row.id}
                                                onClick={() => void save(row)}
                                                className="h-8 cursor-pointer bg-[#0095FF] text-white hover:bg-[#0aa0ff] disabled:opacity-40"
                                            >
                                                {saving === row.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <Save className="h-3 w-3" />
                                                )}
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {visible.length === 0 && (
                    <p className="py-10 text-center text-[13px] text-white/35">
                        No {activeTab.label.toLowerCase()} plans synced yet. Run the catalog sync
                        from the Overview tab.
                    </p>
                )}
            </div>
        </div>
    );
}
