"use client";

// Linode admin — Instances: read-only ledger of every servers row provisioned
// on Linode, with per-instance margin (frozen customer $/hr vs the type's
// current Linode list $/hr).

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface InstanceRow {
    id: number;
    name: string;
    owner_email: string | null;
    linode_id: number | null;
    location: string | null;
    plan_slug: string | null;
    type_id: string | null;
    type_label: string | null;
    status: string | null;
    hourly_cost: number | null;
    linode_hourly_usd: number | null;
    created_at: string | null;
}

const STATUS_STYLE: Record<string, string> = {
    running: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    provisioning: "border-[#0095FF]/30 bg-[#0095FF]/10 text-[#82adfb]",
    stopped: "border-white/[0.12] bg-white/[0.05] text-white/55",
    suspended: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    failed: "border-red-500/30 bg-red-500/10 text-red-400",
    error: "border-red-500/30 bg-red-500/10 text-red-400",
};

function marginPct(customer: number | null, linode: number | null): number | null {
    if (customer === null || linode === null || linode <= 0) return null;
    return ((customer - linode) / linode) * 100;
}

export default function InstancesTab() {
    const [rows, setRows] = useState<InstanceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        setError(null);
        fetch("/api/admin/linode/instances", { cache: "no-store" })
            .then((r) => r.json())
            .then((d: { ok?: boolean; instances?: InstanceRow[]; error?: string }) => {
                if (!d?.ok) {
                    setError(d?.error ?? "Failed to load instances");
                    return;
                }
                setRows(d.instances ?? []);
            })
            .catch(() => setError("Failed to load instances"))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

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
            <div className="flex items-center justify-between">
                <p className="text-[13px] text-white/50">
                    {rows.length} Linode-backed {rows.length === 1 ? "instance" : "instances"}.
                    Margin compares the frozen customer rate against the type&apos;s current Linode
                    list price.
                </p>
                <button
                    onClick={load}
                    className="inline-flex h-8 items-center gap-2 border border-white/[0.08] bg-white/[0.02] px-3 text-[12px] text-white/60 hover:text-white"
                >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
            </div>

            <div className="overflow-hidden border border-white/[0.08] bg-[#111216]">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1080px] text-left text-[13px]">
                        <thead>
                            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.14em] text-white/35">
                                <th className="px-4 py-3 font-semibold">Owner</th>
                                <th className="px-4 py-3 font-semibold">Server</th>
                                <th className="px-4 py-3 font-semibold">Linode ID</th>
                                <th className="px-4 py-3 font-semibold">Region</th>
                                <th className="px-4 py-3 font-semibold">Type</th>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3 font-semibold">Customer $/hr</th>
                                <th className="px-4 py-3 font-semibold">Linode $/hr</th>
                                <th className="px-4 py-3 font-semibold">Margin</th>
                                <th className="px-4 py-3 font-semibold">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05]">
                            {rows.map((row) => {
                                const margin = marginPct(row.hourly_cost, row.linode_hourly_usd);
                                return (
                                    <tr key={row.id} className="transition-colors hover:bg-white/[0.02]">
                                        <td className="px-4 py-3 text-white/80">
                                            {row.owner_email ?? "—"}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-white">
                                            {row.name}
                                        </td>
                                        <td className={`${MONO} px-4 py-3 text-[12px] text-white/60`}>
                                            {row.linode_id ?? "—"}
                                        </td>
                                        <td className={`${MONO} px-4 py-3 text-[12px] text-white/60`}>
                                            {row.location ?? "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`${MONO} text-[12px] text-white/70`}>
                                                {row.type_id ?? row.plan_slug ?? "—"}
                                            </span>
                                            {row.type_label && (
                                                <p className="mt-0.5 text-[11px] text-white/40">
                                                    {row.type_label}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`${MONO} inline-flex items-center border px-2 py-0.5 text-[11px] ${
                                                    STATUS_STYLE[row.status ?? ""] ??
                                                    "border-white/[0.12] bg-white/[0.05] text-white/55"
                                                }`}
                                            >
                                                {row.status ?? "unknown"}
                                            </span>
                                        </td>
                                        <td className={`${MONO} px-4 py-3 text-[12px] text-white/70`}>
                                            {row.hourly_cost === null
                                                ? "—"
                                                : `$${row.hourly_cost.toFixed(4)}`}
                                        </td>
                                        <td className={`${MONO} px-4 py-3 text-[12px] text-white/60`}>
                                            {row.linode_hourly_usd === null
                                                ? "—"
                                                : `$${row.linode_hourly_usd.toFixed(4)}`}
                                        </td>
                                        <td className={`${MONO} px-4 py-3 text-[12px]`}>
                                            {margin === null ? (
                                                <span className="text-white/30">—</span>
                                            ) : (
                                                <span
                                                    className={
                                                        margin >= 0
                                                            ? "text-emerald-300"
                                                            : "text-red-400"
                                                    }
                                                >
                                                    {margin >= 0 ? "+" : ""}
                                                    {margin.toFixed(1)}%
                                                </span>
                                            )}
                                        </td>
                                        <td className={`${MONO} px-4 py-3 text-[12px] text-white/50`}>
                                            {row.created_at
                                                ? new Date(row.created_at).toLocaleDateString()
                                                : "—"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {rows.length === 0 && (
                    <p className="py-10 text-center text-[13px] text-white/35">
                        No Linode-backed instances yet. They appear here as customers deploy.
                    </p>
                )}
            </div>
        </div>
    );
}
