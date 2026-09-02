"use client";

// Linode admin — Overview: integration status (token probe + catalog counts +
// last sync), manual Sync Now, the deploy kill-switch and the compute-provider
// routing select. Reads /status, syncs via /sync, writes /settings.

import { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Globe2,
    HardDrive,
    Loader2,
    RefreshCw,
    Tag,
    Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface Status {
    ok: boolean;
    token: {
        valid: boolean;
        accountEmail?: string;
        username?: string;
        restricted?: boolean;
        error?: string;
    };
    catalog: {
        regions: number;
        types: number;
        images: number;
        pricingRows: number;
        lastSyncedAt: string | null;
    };
    settings: { linodeDeployEnabled: boolean; computeProvider: "linode" | "proxmox" };
}

interface SyncSummary {
    regions: number;
    types: number;
    images: number;
    availabilityPairs: number;
    newPricingRows: number;
    durationMs: number;
}

function Stat({
    icon: Icon,
    label,
    value,
    tint,
}: {
    icon: typeof Tag;
    label: string;
    value: string;
    tint: string;
}) {
    return (
        <div className="border border-white/[0.08] bg-[#111216] px-5 py-4">
            <div className="flex items-center gap-3">
                <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ background: `${tint}22`, color: tint }}
                >
                    <Icon className="h-4 w-4" />
                </span>
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                        {label}
                    </p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums text-white">{value}</p>
                </div>
            </div>
        </div>
    );
}

function formatWhen(iso: string | null): string {
    if (!iso) return "never";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "never";
    return date.toLocaleString();
}

export default function OverviewTab() {
    const confirm = useConfirm();
    const [status, setStatus] = useState<Status | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [savingSetting, setSavingSetting] = useState(false);

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch("/api/admin/linode/status", { cache: "no-store" });
            const data = (await res.json().catch(() => null)) as Status | null;
            if (!res.ok || !data?.ok) {
                setError((data as { error?: string } | null)?.error ?? "Failed to load status");
                return;
            }
            setStatus(data);
        } catch {
            setError("Failed to load status");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const syncNow = async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/admin/linode/sync", { method: "POST" });
            const data = (await res.json().catch(() => null)) as {
                ok?: boolean;
                skipped?: boolean;
                reason?: string;
                summary?: SyncSummary;
                error?: string;
            } | null;
            if (!res.ok || !data?.ok) {
                toast.error(data?.error ?? "Sync failed");
                return;
            }
            if (data.skipped) {
                toast.info(data.reason ?? "Sync already in progress");
                return;
            }
            const s = data.summary;
            toast.success(
                s
                    ? `Synced ${s.regions} regions · ${s.types} types · ${s.images} images · ${s.availabilityPairs} availability pairs · ${s.newPricingRows} new pricing rows (${(s.durationMs / 1000).toFixed(1)}s)`
                    : "Catalog synced"
            );
            void load();
        } catch {
            toast.error("Sync failed");
        } finally {
            setSyncing(false);
        }
    };

    const patchSettings = async (patch: {
        linode_deploy_enabled?: boolean;
        compute_provider?: "linode" | "proxmox";
    }): Promise<boolean> => {
        setSavingSetting(true);
        try {
            const res = await fetch("/api/admin/linode/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            const data = (await res.json().catch(() => null)) as {
                ok?: boolean;
                error?: string;
                linodeDeployEnabled?: boolean;
                computeProvider?: "linode" | "proxmox";
            } | null;
            if (!res.ok || !data?.ok) {
                toast.error(data?.error ?? "Failed to save settings");
                return false;
            }
            setStatus((prev) =>
                prev
                    ? {
                          ...prev,
                          settings: {
                              linodeDeployEnabled:
                                  data.linodeDeployEnabled ?? prev.settings.linodeDeployEnabled,
                              computeProvider:
                                  data.computeProvider ?? prev.settings.computeProvider,
                          },
                      }
                    : prev
            );
            return true;
        } catch {
            toast.error("Failed to save settings");
            return false;
        } finally {
            setSavingSetting(false);
        }
    };

    const toggleDeploys = async (enabled: boolean) => {
        if (await patchSettings({ linode_deploy_enabled: enabled })) {
            toast.success(enabled ? "Linode deploys enabled" : "Linode deploys disabled");
        }
    };

    const changeProvider = async (provider: "linode" | "proxmox") => {
        if (!status || provider === status.settings.computeProvider) return;
        const ok = await confirm({
            title: `Switch compute provider to ${provider}?`,
            description:
                "New server deploys will provision on the selected backend. Existing servers keep running on their own provider — only the create path changes.",
            confirmText: `Switch to ${provider}`,
            danger: provider === "proxmox",
        });
        if (!ok) return;
        if (await patchSettings({ compute_provider: provider })) {
            toast.success(`Compute provider set to ${provider}`);
        }
    };

    if (error) {
        return (
            <div className="border border-red-500/20 bg-red-500/[0.06] px-5 py-8 text-center">
                <AlertTriangle className="mx-auto h-5 w-5 text-red-400" />
                <p className="mt-2 text-[13px] text-red-300">{error}</p>
                <button
                    onClick={() => void load()}
                    className="mt-4 inline-flex h-8 items-center gap-2 border border-white/[0.1] bg-white/[0.03] px-3 text-[12px] text-white/70 hover:text-white"
                >
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                </button>
            </div>
        );
    }

    if (!status) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-[74px] animate-pulse border border-white/[0.08] bg-[#111216]"
                        />
                    ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="h-48 animate-pulse border border-white/[0.08] bg-[#111216]" />
                    <div className="h-48 animate-pulse border border-white/[0.08] bg-[#111216]" />
                </div>
            </div>
        );
    }

    const { token, catalog, settings } = status;

    return (
        <div className="space-y-6">
            {/* Catalog counts */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat icon={Globe2} label="Regions" value={String(catalog.regions)} tint="#0095FF" />
                <Stat icon={Tag} label="Types" value={String(catalog.types)} tint="#a78bfa" />
                <Stat icon={HardDrive} label="Images" value={String(catalog.images)} tint="#4ade80" />
                <Stat
                    icon={Wallet}
                    label="Pricing rows"
                    value={String(catalog.pricingRows)}
                    tint="#fbbf24"
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* Integration status */}
                <div className="border border-white/[0.08] bg-[#111216] p-5">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                            Integration
                        </p>
                        <button
                            onClick={() => void syncNow()}
                            disabled={syncing}
                            className="inline-flex h-8 items-center gap-2 bg-[#0095FF] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#0aa0ff] disabled:opacity-50"
                        >
                            {syncing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Sync now
                        </button>
                    </div>

                    <div className="mt-4 space-y-3 text-[13px]">
                        <div className="flex items-center gap-2">
                            {token.valid ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            ) : (
                                <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                            )}
                            <span className="text-white/80">
                                {token.valid ? "API token valid" : "API token invalid"}
                            </span>
                            {token.valid && (token.accountEmail || token.username) && (
                                <span className={`${MONO} text-[12px] text-white/45`}>
                                    {token.accountEmail ?? token.username}
                                    {token.restricted && " · restricted"}
                                </span>
                            )}
                        </div>
                        {!token.valid && token.error && (
                            <p className="border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[12.5px] text-red-300">
                                {token.error}
                            </p>
                        )}
                        <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                            <span className="text-white/50">Last catalog sync</span>
                            <span className={`${MONO} text-[12px] text-white/70`}>
                                {formatWhen(catalog.lastSyncedAt)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Platform switches */}
                <div className="border border-white/[0.08] bg-[#111216] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                        Platform switches
                    </p>

                    <div className="mt-4 flex items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
                        <div>
                            <p className="text-[13.5px] font-medium text-white">Linode deploys</p>
                            <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/50">
                                Kill-switch for NEW customer deploys. Existing instances keep
                                running and stay manageable.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span
                                className={`text-[11px] font-semibold uppercase tracking-wider ${
                                    settings.linodeDeployEnabled ? "text-emerald-400" : "text-red-400"
                                }`}
                            >
                                {settings.linodeDeployEnabled ? "On" : "Off"}
                            </span>
                            <Switch
                                checked={settings.linodeDeployEnabled}
                                disabled={savingSetting}
                                onCheckedChange={(v) => void toggleDeploys(v)}
                                className="data-[state=checked]:bg-[#0095FF]"
                            />
                        </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4">
                        <div>
                            <p className="text-[13.5px] font-medium text-white">Compute provider</p>
                            <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/50">
                                Backend for NEW servers. Existing rows always dispatch on their own
                                provider.
                            </p>
                        </div>
                        <select
                            value={settings.computeProvider}
                            disabled={savingSetting}
                            onChange={(e) =>
                                void changeProvider(e.target.value as "linode" | "proxmox")
                            }
                            className={`h-9 border border-white/[0.1] bg-[#0d0e11] px-2 text-[13px] text-white focus:outline-none disabled:opacity-50 ${MONO}`}
                        >
                            <option value="linode">linode</option>
                            <option value="proxmox">proxmox</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
}
