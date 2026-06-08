// Network volume operations against RunPod REST.
//
// RunPod constraints (https://docs.runpod.io/storage/network-volumes):
//   - POST /v1/networkvolumes  body { name, size, dataCenterId }
//   - size:        1–4000 GB
//   - Cost:        $0.07/GB/month (first 1 TB), $0.05/GB/month (beyond)
//   - Volumes are pinned to a datacenter. A pod with networkVolumeId
//     auto-pins to that same datacenter.
//   - Volumes cannot be detached without destroying the pod.

import { createServiceClient } from "@/lib/supabase/server";
import {
    closeActiveBilling,
    releaseProvision,
    reserveProvision,
    settleProvision,
    type ProvisionReservation,
} from "@/config/billing-flow";
import { BillingCredits } from "@/lib/billing/credits";

import { RunPodClient } from "../client";
import type {
    CreateNetworkVolumeRequest,
    NetworkVolumeSummary,
    RunPodError,
    RunPodNetworkVolume,
    ServiceResult,
    VolumeStatus,
} from "../types";

// ─── Pricing ────────────────────────────────────────────────────────────────
const RUNPOD_VOL_PER_GB_TIER1 = 0.07; // up to 1 TB
const RUNPOD_VOL_PER_GB_TIER2 = 0.05; // beyond 1 TB
const RESALE_MARKUP = 1.25; // matches GPU pod default markup

export function computeMonthlyVolumeCost(sizeGb: number): {
    runpod: number;
    resale: number;
} {
    if (sizeGb <= 0) return { runpod: 0, resale: 0 };
    const tier1 = Math.min(sizeGb, 1000) * RUNPOD_VOL_PER_GB_TIER1;
    const tier2 = Math.max(0, sizeGb - 1000) * RUNPOD_VOL_PER_GB_TIER2;
    const runpod = Math.round((tier1 + tier2) * 100) / 100;
    const resale = Math.round(runpod * RESALE_MARKUP * 100) / 100;
    return { runpod, resale };
}

// ─── Row helpers ────────────────────────────────────────────────────────────
interface VolumeRowDb {
    id: number;
    owner_id: string;
    runpod_volume_id: string | null;
    name: string;
    size_gb: number;
    data_center_id: string;
    status: VolumeStatus;
    monthly_cost_usd: number;
    billing_service_id: string;
    created_at: string;
}

function rowToSummary(r: VolumeRowDb): NetworkVolumeSummary {
    return {
        id: r.id,
        runpodVolumeId: r.runpod_volume_id,
        name: r.name,
        sizeGb: r.size_gb,
        dataCenterId: r.data_center_id,
        status: r.status,
        monthlyCostUsd: Number(r.monthly_cost_usd),
        createdAt: r.created_at,
    };
}

function isRunPodError(e: unknown): e is RunPodError {
    return (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        "retryable" in e &&
        "message" in e
    );
}

export interface ReconcileVolumeResult {
    checked: number;
    updated: number;
    deleted: number;
    cleanupCompleted: number;
}

export function buildRunPodVolumeName(rowId: number, name: string): string {
    return `samatva-${rowId}-${name}`.slice(0, 191);
}

// ─── Operations ─────────────────────────────────────────────────────────────
export const volumeOperations = {
    async reserveVolumeAttachment(args: {
        volumeId: number;
        ownerId: string;
    }): Promise<
        ServiceResult<{ runpodVolumeId: string; dataCenterId: string }>
    > {
        try {
            const supabase = await createServiceClient();
            const { data, error } = await supabase
                .from("gpu_network_volumes")
                .update({ status: "attached" })
                .eq("id", args.volumeId)
                .eq("owner_id", args.ownerId)
                .eq("status", "available")
                .not("runpod_volume_id", "is", null)
                .select("runpod_volume_id, data_center_id")
                .maybeSingle();
            if (error) throw new Error(error.message);
            if (!data?.runpod_volume_id) {
                return {
                    success: false,
                    error: "Volume not found, not owned by the caller, or already attached",
                    errorCode: "CAPACITY",
                };
            }
            return {
                success: true,
                data: {
                    runpodVolumeId: data.runpod_volume_id,
                    dataCenterId: data.data_center_id,
                },
            };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },

    async releaseVolumeAttachment(args: {
        runpodVolumeId: string;
        ownerId: string;
    }): Promise<ServiceResult<void>> {
        try {
            const supabase = await createServiceClient();
            const { data: volume, error: findError } = await supabase
                .from("gpu_network_volumes")
                .select("id, status")
                .eq("runpod_volume_id", args.runpodVolumeId)
                .eq("owner_id", args.ownerId)
                .maybeSingle();
            if (findError) throw new Error(findError.message);
            if (!volume) {
                return {
                    success: false,
                    error: "Volume record was not found",
                    errorCode: "NOT_FOUND",
                };
            }
            if (volume.status === "available") return { success: true };
            if (volume.status !== "attached") {
                return {
                    success: false,
                    error: `Volume cannot be released from status ${volume.status}`,
                    errorCode: "INVALID",
                };
            }

            const { data: released, error: releaseError } = await supabase
                .from("gpu_network_volumes")
                .update({ status: "available" })
                .eq("id", volume.id)
                .eq("status", "attached")
                .select("id")
                .maybeSingle();
            if (releaseError) throw new Error(releaseError.message);
            if (!released) {
                return {
                    success: false,
                    error: "Volume attachment changed while it was being released",
                    errorCode: "CAPACITY",
                };
            }
            return { success: true };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },

    /** List the caller's non-deleted network volumes, newest first. */
    async listUserVolumes(
        ownerId: string
    ): Promise<ServiceResult<NetworkVolumeSummary[]>> {
        try {
            const supabase = await createServiceClient();
            const { data, error } = await supabase
                .from("gpu_network_volumes")
                .select(
                    "id, owner_id, runpod_volume_id, name, size_gb, data_center_id, status, monthly_cost_usd, billing_service_id, created_at"
                )
                .eq("owner_id", ownerId)
                .neq("status", "deleted")
                .order("created_at", { ascending: false });
            if (error) throw new Error(error.message);
            return {
                success: true,
                data: ((data || []) as VolumeRowDb[]).map(rowToSummary),
            };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },

    /**
     * Create a network volume on RunPod + record it locally.
     * Reserves a DB row before the upstream call so we can roll back if it
     * fails — same pattern as createPod.
     */
    async createVolume(
        req: CreateNetworkVolumeRequest
    ): Promise<ServiceResult<NetworkVolumeSummary>> {
        let settled = false;
        let reservation: ProvisionReservation | undefined;
        try {
            // ── 1. Validate input ───────────────────────────────────────────
            if (!req.name || !/^[a-zA-Z0-9]([a-zA-Z0-9 _-]{0,62}[a-zA-Z0-9])?$/.test(req.name)) {
                return {
                    success: false,
                    error: "Volume name must be 1-64 chars (alphanumeric, space, hyphen, underscore)",
                    errorCode: "INVALID",
                };
            }
            if (req.sizeGb < 1 || req.sizeGb > 4000) {
                return {
                    success: false,
                    error: "Volume size must be 1–4000 GB",
                    errorCode: "INVALID",
                };
            }
            if (!req.dataCenterId || req.dataCenterId.length > 32) {
                return {
                    success: false,
                    error: "Data center is required",
                    errorCode: "INVALID",
                };
            }

            const { runpod: runpodCost, resale: monthlyCost } =
                computeMonthlyVolumeCost(req.sizeGb);
            const hourlyCost = Math.round((monthlyCost / 730) * 1_000_000) / 1_000_000;
            const reservationResult = await reserveProvision({
                userId: req.ownerId,
                initialCost: 0,
                hourlyRate: hourlyCost,
            });
            reservation = reservationResult.reservation;
            if (!reservationResult.ok) {
                return {
                    success: false,
                    error: `Insufficient credits. You need at least $${hourlyCost.toFixed(6)}.`,
                    errorCode: "INVALID",
                };
            }

            const supabase = await createServiceClient();

            // ── 2. Reserve DB row ───────────────────────────────────────────
            const { data: inserted, error: insErr } = await supabase
                .from("gpu_network_volumes")
                .insert({
                    owner_id: req.ownerId,
                    owner_email: req.ownerEmail || null,
                    name: req.name,
                    size_gb: req.sizeGb,
                    data_center_id: req.dataCenterId,
                    status: "creating",
                    monthly_cost_usd: monthlyCost,
                    runpod_cost_per_month_usd: runpodCost,
                })
                .select(
                    "id, owner_id, runpod_volume_id, name, size_gb, data_center_id, status, monthly_cost_usd, billing_service_id, created_at"
                )
                .single();
            if (insErr) {
                return {
                    success: false,
                    error: `Failed to reserve volume record: ${insErr.message}`,
                    errorCode: "SERVER",
                };
            }
            const rowId = (inserted as VolumeRowDb).id;

            // ── 3. Call RunPod ──────────────────────────────────────────────
            let runpodVol: RunPodNetworkVolume | undefined;
            try {
                runpodVol = await RunPodClient.rest<RunPodNetworkVolume>(
                    "POST",
                    "/networkvolumes",
                    {
                        name: buildRunPodVolumeName(rowId, req.name),
                        size: req.sizeGb,
                        dataCenterId: req.dataCenterId,
                    }
                );
            } catch (e) {
                if (isRunPodError(e) && e.code === "TIMEOUT") {
                    try {
                        const volumes =
                            await RunPodClient.rest<RunPodNetworkVolume[]>(
                                "GET",
                                "/networkvolumes"
                            );
                        runpodVol = volumes.find(
                            (volume) =>
                                volume.name ===
                                buildRunPodVolumeName(rowId, req.name)
                        );
                    } catch (recoveryError) {
                        console.warn(
                            `[GPU:createVolume] timeout recovery lookup failed for volume ${rowId}:`,
                            recoveryError
                        );
                    }
                }
                if (!runpodVol) {
                    const msg = isRunPodError(e)
                        ? e.message
                        : "Volume creation failed";
                    const code = isRunPodError(e) ? e.code : "SERVER";
                    const outcomeUnknown = code === "TIMEOUT";
                    await supabase
                        .from("gpu_network_volumes")
                        .update({
                            status: outcomeUnknown ? "creating" : "error",
                            details: {
                                error: msg,
                                provider_name: buildRunPodVolumeName(
                                    rowId,
                                    req.name
                                ),
                                cleanup_pending: outcomeUnknown,
                            },
                        })
                        .eq("id", rowId);
                    return { success: false, error: msg, errorCode: code };
                }
            }

            if (!runpodVol) {
                return {
                    success: false,
                    error: "Provider volume outcome could not be determined",
                    errorCode: "TIMEOUT",
                };
            }

            // ── 4. Persist RunPod data ──────────────────────────────────────
            const { data: updated, error: updateErr } = await supabase
                .from("gpu_network_volumes")
                .update({
                    runpod_volume_id: runpodVol.id,
                    status: "available",
                })
                .eq("id", rowId)
                .select(
                    "id, owner_id, runpod_volume_id, name, size_gb, data_center_id, status, monthly_cost_usd, billing_service_id, created_at"
                )
                .single();
            if (updateErr || !updated) {
                let cleanupPending = false;
                try {
                    await RunPodClient.rest(
                        "DELETE",
                        `/networkvolumes/${runpodVol.id}`
                    );
                } catch (rollbackErr) {
                    cleanupPending = true;
                    console.error(
                        `[GPU:createVolume] CRITICAL: volume ${runpodVol.id} exists but persistence and rollback both failed`,
                        rollbackErr
                    );
                }
                await supabase
                    .from("gpu_network_volumes")
                    .update({
                        status: "error",
                        details: {
                            error: `Provider volume persistence failed: ${
                                updateErr?.message || "missing updated row"
                            }`,
                            provider_volume_id: runpodVol.id,
                            cleanup_pending: cleanupPending,
                        },
                    })
                    .eq("id", rowId);
                return {
                    success: false,
                    error: "Failed to persist provisioned network volume",
                    errorCode: "SERVER",
                };
            }

            try {
                await settleProvision({
                    reservation: reservationResult.reservation,
                    initialCost: 0,
                    hourlyRate: hourlyCost,
                    serviceId: (updated as VolumeRowDb).billing_service_id,
                    serviceType: "gpu_volume",
                    addActive: ({ userId, serviceId, hourlyRate }) =>
                        BillingCredits.addActiveGpuVolume({
                            userId,
                            serviceId,
                            hourlyRate,
                        }),
                });
                settled = true;
            } catch (billingErr) {
                let cleanupPending = false;
                try {
                    await RunPodClient.rest(
                        "DELETE",
                        `/networkvolumes/${runpodVol.id}`
                    );
                } catch (rollbackErr) {
                    cleanupPending = true;
                    console.error(
                        `[GPU:createVolume] CRITICAL: billing activation and provider rollback failed for ${runpodVol.id}`,
                        rollbackErr
                    );
                }
                await supabase
                    .from("gpu_network_volumes")
                    .update({
                        status: "error",
                        details: {
                            error:
                                billingErr instanceof Error
                                    ? billingErr.message
                                    : "Billing activation failed",
                            provider_volume_id: runpodVol.id,
                            cleanup_pending: cleanupPending,
                        },
                    })
                    .eq("id", rowId);
                return {
                    success: false,
                    error: cleanupPending
                        ? "Billing activation failed and volume cleanup is pending"
                        : "Billing activation failed",
                    errorCode: "SERVER",
                };
            }

            return {
                success: true,
                data: rowToSummary(updated as VolumeRowDb),
            };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        } finally {
            if (!settled) {
                await releaseProvision(reservation);
            }
        }
    },

    /** Destroy a volume on RunPod + soft-delete locally. */
    async deleteVolume(args: {
        volumeId: number;
        ownerId: string;
        waiveFinalCharge?: boolean;
    }): Promise<ServiceResult<{ volumeId: number }>> {
        try {
            const supabase = await createServiceClient();
            const { data: row, error: getErr } = await supabase
                .from("gpu_network_volumes")
                .select("id, owner_id, runpod_volume_id, status, billing_service_id")
                .eq("id", args.volumeId)
                .maybeSingle();
            if (getErr) throw new Error(getErr.message);
            const vol = row as
                | (Pick<
                      VolumeRowDb,
                      "id" | "owner_id" | "runpod_volume_id" | "status" | "billing_service_id"
                  >)
                | null;
            if (!vol) {
                return { success: false, error: "Volume not found", errorCode: "NOT_FOUND" };
            }
            if (vol.owner_id !== args.ownerId) {
                return { success: false, error: "Not authorized", errorCode: "AUTH" };
            }
            if (vol.status === "deleted") {
                return { success: false, error: "Already deleted", errorCode: "INVALID" };
            }
            if (vol.status === "attached") {
                return {
                    success: false,
                    error: "Volume is attached to a running pod. Destroy the pod first.",
                    errorCode: "CAPACITY",
                };
            }

            if (vol.runpod_volume_id) {
                try {
                    await RunPodClient.rest(
                        "DELETE",
                        `/networkvolumes/${vol.runpod_volume_id}`
                    );
                } catch (e) {
                    if (!(isRunPodError(e) && e.code === "NOT_FOUND")) {
                        return {
                            success: false,
                            error: isRunPodError(e)
                                ? e.message
                                : "Failed to delete provider volume",
                            errorCode: isRunPodError(e) ? e.code : "SERVER",
                        };
                    }
                }
            }

            try {
                await closeActiveBilling({
                    userId: args.ownerId,
                    serviceId: vol.billing_service_id,
                    serviceType: "gpu_volume",
                    closeActive: () =>
                        BillingCredits.closeActiveGpuVolume({
                            serviceId: vol.billing_service_id,
                            waiveCharge: args.waiveFinalCharge,
                        }),
                });
            } catch (billingErr) {
                return {
                    success: false,
                    error: `Provider volume was deleted but billing closure failed: ${
                        billingErr instanceof Error
                            ? billingErr.message
                            : String(billingErr)
                    }`,
                    errorCode: "SERVER",
                };
            }

            const { error: deleteErr } = await supabase
                .from("gpu_network_volumes")
                .update({
                    status: "deleted",
                    deleted_at: new Date().toISOString(),
                })
                .eq("id", args.volumeId);
            if (deleteErr) {
                return {
                    success: false,
                    error: `Provider volume was deleted but local state update failed: ${deleteErr.message}`,
                    errorCode: "SERVER",
                };
            }

            return { success: true, data: { volumeId: args.volumeId } };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },

    async reconcileVolumes(): Promise<ServiceResult<ReconcileVolumeResult>> {
        const counter: ReconcileVolumeResult = {
            checked: 0,
            updated: 0,
            deleted: 0,
            cleanupCompleted: 0,
        };
        try {
            const supabase = await createServiceClient();
            const providerVolumes =
                await RunPodClient.rest<RunPodNetworkVolume[]>(
                    "GET",
                    "/networkvolumes"
                );
            const providerIds = new Set(
                providerVolumes.map((volume) => volume.id)
            );
            const { data: rows, error } = await supabase
                .from("gpu_network_volumes")
                .select(
                    "id, owner_id, runpod_volume_id, status, billing_service_id, details, created_at"
                )
                .neq("status", "deleted");
            if (error) throw new Error(error.message);

            for (const row of rows || []) {
                counter.checked += 1;
                const details =
                    row.details && typeof row.details === "object"
                        ? (row.details as Record<string, unknown>)
                        : {};
                const cleanupProviderId =
                    typeof details.provider_volume_id === "string"
                        ? details.provider_volume_id
                        : providerVolumes.find(
                              (volume) =>
                                  volume.name === details.provider_name
                          )?.id || null;

                if (
                    (row.status === "error" || row.status === "creating") &&
                    details.cleanup_pending === true &&
                    !cleanupProviderId
                ) {
                    const ageMs =
                        Date.now() - new Date(row.created_at).getTime();
                    if (ageMs < 10 * 60_000) continue;
                    const { error: resolvedErr } = await supabase
                        .from("gpu_network_volumes")
                        .update({
                            status: "error",
                            details: {
                                ...details,
                                cleanup_pending: false,
                                outcome_resolved_at: new Date().toISOString(),
                            },
                        })
                        .eq("id", row.id);
                    if (!resolvedErr) counter.updated += 1;
                    continue;
                }

                if (
                    (row.status === "error" || row.status === "creating") &&
                    details.cleanup_pending === true &&
                    cleanupProviderId
                ) {
                    try {
                        await RunPodClient.rest(
                            "DELETE",
                            `/networkvolumes/${cleanupProviderId}`
                        );
                    } catch (e) {
                        if (!(isRunPodError(e) && e.code === "NOT_FOUND")) {
                            continue;
                        }
                    }
                    const { error: cleanupErr } = await supabase
                        .from("gpu_network_volumes")
                        .update({
                            status: "deleted",
                            deleted_at: new Date().toISOString(),
                            details: { ...details, cleanup_pending: false },
                        })
                        .eq("id", row.id);
                    if (!cleanupErr) {
                        counter.updated += 1;
                        counter.cleanupCompleted += 1;
                    }
                    continue;
                }

                if (
                    row.runpod_volume_id &&
                    !providerIds.has(row.runpod_volume_id)
                ) {
                    try {
                        await closeActiveBilling({
                            userId: row.owner_id,
                            serviceId: row.billing_service_id,
                            serviceType: "gpu_volume",
                            closeActive: () =>
                                BillingCredits.closeActiveGpuVolume({
                                    serviceId: row.billing_service_id,
                                    waiveCharge: true,
                                }),
                        });
                    } catch {
                        continue;
                    }
                    const { error: deleteErr } = await supabase
                        .from("gpu_network_volumes")
                        .update({
                            status: "deleted",
                            deleted_at: new Date().toISOString(),
                        })
                        .eq("id", row.id);
                    if (!deleteErr) {
                        counter.updated += 1;
                        counter.deleted += 1;
                    }
                }
            }
            return { success: true, data: counter };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },
};
