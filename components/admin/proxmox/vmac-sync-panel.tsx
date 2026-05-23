"use client";

// Admin sub-panel: shows the upstream failover-IP / vMAC state for one
// host and lets the operator (a) sync new vMACs for IPs that lack one,
// (b) import vMACs that were created manually outside the platform.
//
// Mounted inside each Proxmox host card in hosts-manager.

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ServerCog, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";

import { StatTile } from "./vmac-sync/stat-tile";
import { ResultList } from "./vmac-sync/result-list";

type VmacEntry = { mac: string; ips: string[] };

type StatusResponse = {
    ok: boolean;
    error?: string;
    serviceName?: string;
    cap?: number;
    currentVmacCount?: number;
    capRemaining?: number;
    failoverIpsTotal?: number;
    unboundIpsCount?: number;
    unboundIps?: string[];
    virtualMacs?: VmacEntry[];
};

type SyncResponse = {
    ok: boolean;
    error?: string;
    created?: Array<{ ip: string; mac: string }>;
    errors?: Array<{ ip: string; error: string }>;
    message?: string;
};

type ImportResponse = {
    ok: boolean;
    error?: string;
    imported?: Array<{ ip: string; mac: string }>;
    errors?: Array<{ ip: string; mac: string; error: string }>;
    message?: string;
};

type Props = {
    hostId: string;
    hostUrl: string;
    onPoolsChanged?: () => void;
};

const VMAC_CAP = 32;

export function VmacSyncPanel({ hostId, hostUrl, onPoolsChanged }: Props) {
    const [status, setStatus] = useState<StatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResponse | null>(null);
    const [importResult, setImportResult] = useState<ImportResponse | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showUnbound, setShowUnbound] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const res = await fetch(`/api/admin/proxmox/hosts/${hostId}/sync-vmacs`);
            const data: StatusResponse = await res.json();
            if (!data.ok) {
                setErrorMsg(data.error || "Failed to load failover-IP state");
                setStatus(null);
            } else {
                setStatus(data);
            }
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : String(e));
            setStatus(null);
        } finally {
            setLoading(false);
        }
    }, [hostId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const runSync = useCallback(
        async (limit: number) => {
            setSyncing(true);
            setSyncResult(null);
            setErrorMsg(null);
            try {
                const res = await fetch(
                    `/api/admin/proxmox/hosts/${hostId}/sync-vmacs?limit=${limit}`,
                    { method: "POST" }
                );
                const data: SyncResponse = await res.json();
                setSyncResult(data);
                if (!data.ok) setErrorMsg(data.error || "Sync failed");
                await refresh();
                onPoolsChanged?.();
            } catch (e) {
                setErrorMsg(e instanceof Error ? e.message : String(e));
            } finally {
                setSyncing(false);
            }
        },
        [hostId, refresh, onPoolsChanged]
    );

    const runImport = useCallback(async () => {
        setImporting(true);
        setImportResult(null);
        setErrorMsg(null);
        try {
            const res = await fetch(`/api/admin/proxmox/hosts/${hostId}/import-vmacs`, {
                method: "POST",
            });
            const data: ImportResponse = await res.json();
            setImportResult(data);
            if (!data.ok && data.error) setErrorMsg(data.error);
            await refresh();
            onPoolsChanged?.();
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : String(e));
        } finally {
            setImporting(false);
        }
    }, [hostId, refresh, onPoolsChanged]);

    const syncLimit = status
        ? Math.min(10, status.capRemaining ?? 10, status.unboundIpsCount ?? 10)
        : 0;
    const canSync =
        (status?.unboundIpsCount ?? 0) > 0 && (status?.capRemaining ?? 0) > 0;
    const capReached =
        (status?.capRemaining ?? 0) === 0 && (status?.unboundIpsCount ?? 0) > 0;
    const noIps =
        status &&
        (status.unboundIpsCount ?? 0) === 0 &&
        (status.currentVmacCount ?? 0) === 0;

    return (
        <div className="rounded-md border border-[#0095FF]/25 bg-[#0095FF]/[0.04] p-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0095FF]">
                        <ServerCog className="h-3.5 w-3.5" />
                        Failover IP integration · virtual MAC sync
                    </p>
                    <p className="mt-1 text-xs text-white/55">
                        Auto-create virtual MAC addresses for failover IPs on this host. Cap is{" "}
                        {VMAC_CAP} per host.
                    </p>
                </div>
                <Button
                    onClick={refresh}
                    disabled={loading || syncing}
                    size="sm"
                    className="bg-white/[0.06] text-white hover:bg-white/[0.10]"
                >
                    {loading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                    )}
                </Button>
            </div>

            {errorMsg && (
                <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {errorMsg}
                </div>
            )}

            {loading && !status && !errorMsg && (
                <p className="mt-3 text-xs text-white/45">Loading state for {hostUrl}…</p>
            )}

            {status?.ok && (
                <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <StatTile
                            label="Failover IPs"
                            value={String(status.failoverIpsTotal ?? 0)}
                            hint="upstream total"
                        />
                        <StatTile
                            label="With vMAC"
                            value={String(status.currentVmacCount ?? 0)}
                            hint={`of ${status.cap ?? VMAC_CAP} cap`}
                        />
                        <StatTile
                            label="Cap remaining"
                            value={String(status.capRemaining ?? 0)}
                            hint="slots"
                            accent={(status.capRemaining ?? 0) === 0 ? "danger" : undefined}
                        />
                        <StatTile
                            label="Unbound IPs"
                            value={String(status.unboundIpsCount ?? 0)}
                            hint="need vMAC"
                            accent={(status.unboundIpsCount ?? 0) > 0 ? "warn" : undefined}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                        {canSync && (
                            <Button
                                onClick={() => runSync(syncLimit)}
                                disabled={syncing || importing}
                                size="sm"
                                className="rounded-none border border-[#0095FF] bg-[#0095FF] text-white hover:bg-[#0aa0ff]"
                            >
                                {syncing ? (
                                    <>
                                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                        Syncing…
                                    </>
                                ) : (
                                    <>
                                        <Zap className="mr-2 h-3.5 w-3.5" />
                                        Sync up to {syncLimit} vMACs
                                    </>
                                )}
                            </Button>
                        )}

                        {(status.currentVmacCount ?? 0) > 0 && (
                            <Button
                                onClick={runImport}
                                disabled={syncing || importing}
                                size="sm"
                                className="rounded-none border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.10]"
                            >
                                {importing ? (
                                    <>
                                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                        Importing…
                                    </>
                                ) : (
                                    <>
                                        <Zap className="mr-2 h-3.5 w-3.5" />
                                        Import existing vMACs to pool
                                    </>
                                )}
                            </Button>
                        )}

                        {capReached && (
                            <p className="text-xs text-white/55">
                                Cap reached — {status.unboundIpsCount} IP
                                {(status.unboundIpsCount ?? 0) === 1 ? "" : "s"} can&apos;t get vMACs.
                                Add another host to grow.
                            </p>
                        )}
                        {noIps && (
                            <p className="text-xs text-white/55">
                                No failover IPs configured on this host yet. Add an IP block to the
                                upstream service first.
                            </p>
                        )}
                    </div>

                    {/* Unbound IPs list */}
                    {(status.unboundIps?.length ?? 0) > 0 && (
                        <div className="border-t border-white/[0.06] pt-3">
                            <button
                                type="button"
                                onClick={() => setShowUnbound((x) => !x)}
                                className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45 hover:text-white/70"
                            >
                                {showUnbound ? "Hide" : "Show"} unbound IPs (
                                {status.unboundIps?.length ?? 0})
                            </button>
                            {showUnbound && (
                                <div className="mt-2 max-h-36 overflow-y-auto rounded border border-white/10 bg-black/30 p-2 text-xs font-mono text-white/65">
                                    {status.unboundIps?.map((ip) => (
                                        <div key={ip}>{ip}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Results */}
                    {syncResult?.ok && (
                        <div className="border-t border-white/[0.06] pt-3">
                            {syncResult.message ? (
                                <p className="text-xs text-white/55">{syncResult.message}</p>
                            ) : (
                                <ResultList
                                    title="Created vMACs"
                                    successRows={syncResult.created}
                                    errorRows={syncResult.errors}
                                />
                            )}
                        </div>
                    )}
                    {importResult?.ok && (
                        <div className="border-t border-white/[0.06] pt-3">
                            <ResultList
                                title="Imported bindings"
                                successRows={importResult.imported}
                                errorRows={importResult.errors}
                                emptyMessage={importResult.message}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
