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
import { GENERIC_SERVICE_ERROR } from "@/lib/inference/error-messages";

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

// ─── Operations ─────────────────────────────────────────────────────────────
export const volumeOperations = {
    /** List the caller's non-deleted network volumes, newest first. */
    async listUserVolumes(
        ownerId: string
    ): Promise<ServiceResult<NetworkVolumeSummary[]>> {
        try {
            const supabase = await createServiceClient();
            const { data, error } = await supabase
                .from("gpu_network_volumes")
                .select(
                    "id, owner_id, runpod_volume_id, name, size_gb, data_center_id, status, monthly_cost_usd, created_at"
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
            console.error("[GPU:volume] failed:", e);
            return {
                success: false,
                error: GENERIC_SERVICE_ERROR,
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
                    "id, owner_id, runpod_volume_id, name, size_gb, data_center_id, status, monthly_cost_usd, created_at"
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
            let runpodVol: RunPodNetworkVolume;
            try {
                runpodVol = await RunPodClient.rest<RunPodNetworkVolume>(
                    "POST",
                    "/networkvolumes",
                    {
                        name: req.name,
                        size: req.sizeGb,
                        dataCenterId: req.dataCenterId,
                    }
                );
            } catch (e) {
                const msg = isRunPodError(e) ? e.message : "Volume creation failed";
                const code = isRunPodError(e) ? e.code : "SERVER";
                await supabase
                    .from("gpu_network_volumes")
                    .update({
                        status: "error",
                        details: { error: msg },
                    })
                    .eq("id", rowId);
                return { success: false, error: msg, errorCode: code };
            }

            // ── 4. Persist RunPod data ──────────────────────────────────────
            const { data: updated } = await supabase
                .from("gpu_network_volumes")
                .update({
                    runpod_volume_id: runpodVol.id,
                    status: "available",
                })
                .eq("id", rowId)
                .select(
                    "id, owner_id, runpod_volume_id, name, size_gb, data_center_id, status, monthly_cost_usd, created_at"
                )
                .single();

            return {
                success: true,
                data: rowToSummary(
                    (updated as VolumeRowDb) ?? (inserted as VolumeRowDb)
                ),
            };
        } catch (e) {
            console.error("[GPU:volume] failed:", e);
            return {
                success: false,
                error: GENERIC_SERVICE_ERROR,
                errorCode: "SERVER",
            };
        }
    },

    /** Destroy a volume on RunPod + soft-delete locally. */
    async deleteVolume(args: {
        volumeId: number;
        ownerId: string;
    }): Promise<ServiceResult<{ volumeId: number }>> {
        try {
            const supabase = await createServiceClient();
            const { data: row, error: getErr } = await supabase
                .from("gpu_network_volumes")
                .select("id, owner_id, runpod_volume_id, status")
                .eq("id", args.volumeId)
                .maybeSingle();
            if (getErr) throw new Error(getErr.message);
            const vol = row as
                | (Pick<VolumeRowDb, "id" | "owner_id" | "runpod_volume_id" | "status">)
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
                    console.warn(
                        `[GPU:deleteVolume] RunPod delete failed for ${vol.runpod_volume_id}:`,
                        isRunPodError(e) ? e.message : e
                    );
                }
            }

            await supabase
                .from("gpu_network_volumes")
                .update({
                    status: "deleted",
                    deleted_at: new Date().toISOString(),
                })
                .eq("id", args.volumeId);

            return { success: true, data: { volumeId: args.volumeId } };
        } catch (e) {
            console.error("[GPU:volume] failed:", e);
            return {
                success: false,
                error: GENERIC_SERVICE_ERROR,
                errorCode: "SERVER",
            };
        }
    },
};
