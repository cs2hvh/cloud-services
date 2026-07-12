"use client";

// Linode admin — Images: synced public distro images grouped by vendor, with
// deprecated/EOL flags. The active switch gates whether an image is offered
// on the customer deploy page.

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface ImageRow {
    id: string;
    label: string;
    vendor: string | null;
    size_mb: number;
    is_public: boolean;
    deprecated: boolean;
    eol: string | null;
    is_active: boolean;
    synced_at: string | null;
}

function formatSize(mb: number): string {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb} MB`;
}

function formatEol(iso: string | null): string {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString();
}

export default function ImagesTab() {
    const [rows, setRows] = useState<ImageRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toggling, setToggling] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        setError(null);
        fetch("/api/admin/linode/images", { cache: "no-store" })
            .then((r) => r.json())
            .then((d: { ok?: boolean; images?: ImageRow[]; error?: string }) => {
                if (!d?.ok) {
                    setError(d?.error ?? "Failed to load images");
                    return;
                }
                setRows(d.images ?? []);
            })
            .catch(() => setError("Failed to load images"))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggle = async (row: ImageRow, value: boolean) => {
        setToggling(row.id);
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: value } : r)));
        try {
            const res = await fetch("/api/admin/linode/images", {
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

    // Vendor-grouped, vendors sorted alphabetically with unknown last.
    const byVendor = new Map<string, ImageRow[]>();
    for (const row of rows) {
        const vendor = row.vendor ?? "Other";
        const list = byVendor.get(vendor) ?? [];
        list.push(row);
        byVendor.set(vendor, list);
    }
    const vendors = [...byVendor.keys()].sort((a, b) =>
        a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)
    );

    return (
        <div className="space-y-3">
            <p className="text-[13px] text-white/50">
                {rows.length} public images synced across {vendors.length} vendors. Disabled images
                disappear from the customer deploy page.
            </p>

            <div className="overflow-hidden border border-white/[0.08] bg-[#111216]">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-[13px]">
                        <thead>
                            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.14em] text-white/35">
                                <th className="px-4 py-3 font-semibold">Image</th>
                                <th className="px-4 py-3 font-semibold">Size</th>
                                <th className="px-4 py-3 font-semibold">Flags</th>
                                <th className="px-4 py-3 font-semibold">EOL</th>
                                <th className="px-4 py-3 font-semibold">Active</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendors.map((vendor) => {
                                const group = byVendor.get(vendor) ?? [];
                                return [
                                    <tr key={`vendor:${vendor}`} className="border-y border-white/[0.06] bg-white/[0.02]">
                                        <td
                                            colSpan={5}
                                            className="px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/45"
                                        >
                                            {vendor}
                                            <span className={`${MONO} ml-2 text-white/30`}>
                                                {group.length}
                                            </span>
                                        </td>
                                    </tr>,
                                    ...group.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02]"
                                        >
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-white">{row.label}</p>
                                                <p className={`${MONO} mt-0.5 text-[11px] text-white/40`}>
                                                    {row.id}
                                                </p>
                                            </td>
                                            <td className={`${MONO} px-4 py-3 text-[12px] text-white/60`}>
                                                {formatSize(row.size_mb)}
                                            </td>
                                            <td className="px-4 py-3">
                                                {row.deprecated ? (
                                                    <span className={`${MONO} inline-flex items-center border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300`}>
                                                        deprecated
                                                    </span>
                                                ) : (
                                                    <span className="text-[12px] text-white/30">—</span>
                                                )}
                                            </td>
                                            <td className={`${MONO} px-4 py-3 text-[12px] text-white/60`}>
                                                {formatEol(row.eol)}
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
                                    )),
                                ];
                            })}
                        </tbody>
                    </table>
                </div>
                {rows.length === 0 && (
                    <p className="py-10 text-center text-[13px] text-white/35">
                        No images synced yet. Run the catalog sync from the Overview tab.
                    </p>
                )}
            </div>
        </div>
    );
}
