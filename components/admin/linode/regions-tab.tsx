"use client";

// Linode admin — Regions: every synced region (including sync-deactivated
// ones) with capability counts and plan-availability summary. The active
// switch gates whether the region is offered on the customer deploy page.

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface RegionRow {
    id: string;
    label: string;
    country: string;
    capabilities: string[];
    status: string;
    is_active: boolean;
    synced_at: string | null;
    available_types: number;
    total_types: number;
}

export default function RegionsTab() {
    const [rows, setRows] = useState<RegionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toggling, setToggling] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        setError(null);
        fetch("/api/admin/linode/regions", { cache: "no-store" })
            .then((r) => r.json())
            .then((d: { ok?: boolean; regions?: RegionRow[]; error?: string }) => {
                if (!d?.ok) {
                    setError(d?.error ?? "Failed to load regions");
                    return;
                }
                setRows(d.regions ?? []);
            })
            .catch(() => setError("Failed to load regions"))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggle = async (row: RegionRow, value: boolean) => {
        setToggling(row.id);
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: value } : r)));
        try {
            const res = await fetch("/api/admin/linode/regions", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: row.id, is_active: value }),
            });
            const data = (await res.json().catch(() => null)) as {
                ok?: boolean;
                error?: string;
            } | null;
            if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Failed to update");
            toast.success(`${row.label} ${value ? "enabled" : "disabled"}`);
        } catch (e) {
            setRows((prev) =>
                prev.map((r) => (r.id === row.id ? { ...r, is_active: !value } : r))
            );
            toast.error(e instanceof Error ? e.message : "Failed to update");
        } finally {
            setToggling(null);
        }
    };

    if (loading) {
        return <div className="h-72 animate-pulse border border-white/[0.08] bg-[#111216]" />;
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

    return (
        <div className="space-y-3">
            <p className="text-[13px] text-white/50">
                {rows.length} regions synced. Disabling a region hides it from the customer deploy
                page — running instances there are unaffected.
            </p>

            <div className="overflow-hidden border border-white/[0.08] bg-[#111216]">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-[13px]">
                        <thead>
                            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.14em] text-white/35">
                                <th className="px-4 py-3 font-semibold">Region</th>
                                <th className="px-4 py-3 font-semibold">Country</th>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3 font-semibold">Capabilities</th>
                                <th className="px-4 py-3 font-semibold">Plan availability</th>
                                <th className="px-4 py-3 font-semibold">Active</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05]">
                            {rows.map((row) => (
                                <tr key={row.id} className="transition-colors hover:bg-white/[0.02]">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-white">{row.label}</p>
                                        <p className={`${MONO} mt-0.5 text-[11px] text-white/40`}>
                                            {row.id}
                                        </p>
                                    </td>
                                    <td className={`${MONO} px-4 py-3 text-[12px] uppercase text-white/60`}>
                                        {row.country}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`${MONO} inline-flex items-center border px-2 py-0.5 text-[11px] ${
                                                row.status === "ok"
                                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                            }`}
                                        >
                                            {row.status}
                                        </span>
                                    </td>
                                    <td className={`${MONO} px-4 py-3 text-[12px] text-white/60`}>
                                        {row.capabilities.length}
                                    </td>
                                    <td className={`${MONO} px-4 py-3 text-[12px] text-white/60`}>
                                        {row.total_types > 0
                                            ? `${row.available_types}/${row.total_types} types`
                                            : "—"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Switch
                                            checked={row.is_active}
                                            disabled={toggling === row.id}
                                            onCheckedChange={(v) => void toggle(row, v)}
                                            className="data-[state=checked]:bg-[#0095FF]"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {rows.length === 0 && (
                    <p className="py-10 text-center text-[13px] text-white/35">
                        No regions synced yet. Run the catalog sync from the Overview tab.
                    </p>
                )}
            </div>
        </div>
    );
}
