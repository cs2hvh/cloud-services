// Pod lifecycle operations: create, power (start/stop/restart), destroy.
// Mirrors the lib/services/database/operations/cluster-lifecycle-operations.ts shape:
// validate → ensureBalance → reserve DB row → call upstream → wire billing → audit.

import {
  reserveProvision,
  settleProvision,
  releaseProvision,
  closeActiveBilling,
  type ProvisionReservation,
} from "@/config/billing-flow";
import { Encryption } from "@/config/functions";
import { BillingCredits } from "@/lib/billing/credits";
import { createServiceClient } from "@/lib/supabase/server";

import { RunPodClient } from "../client";
import { computeResalePerHour, storagePerHour } from "../helpers";
import { templateOperations } from "./template-operations";
import { volumeOperations } from "./volume-operations";
import type {
    CloudType,
    PodStatus,
    RunPodCreatePodRequest,
    RunPodError,
    RunPodPodResource,
    ServiceResult,
    StockStatus,
} from "../types";

// ─── Constants (mirror SECURITY_LIMITS in credit-system-cron) ───────────────
const MAX_PODS_PER_USER = 5;
const MAX_HOURLY_RATE_PER_POD_USD = 50;
const MIN_HOURS_BALANCE_FOR_CREATE = 1;
const DEFAULT_VOLUME_MOUNT = "/workspace";

// ─── Request / result types ─────────────────────────────────────────────────
export interface CreatePodRequest {
    ownerId: string;
    ownerEmail?: string | null;
    name: string;
    gpuCatalogId: string;
    gpuCount: number;
    cloudType: CloudType;
    interruptible: boolean;
    dataCenterIds?: string[];
    imageName: string;
    templateId?: string;
    containerDiskGb?: number;
    volumeGb?: number;
    networkVolumeId?: string;
    networkVolumeRecordId?: number;
    ports?: string[];
    env?: Record<string, string>;
    publicKey?: string;
    rootPassword?: string;
}

export interface CreatePodResult {
    podId: number;
    runpodPodId: string;
    name: string;
    status: PodStatus;
    publicIp: string | null;
    portMappings: Record<string, number>;
    hourlyCostUsd: number;
    sshCommand: string | null;
}

export interface PowerPodRequest {
    podId: number;
    ownerId: string;
    action: "start" | "stop" | "restart";
}

export interface DestroyPodRequest {
    podId: number;
    ownerId: string;
    waiveFinalCharge?: boolean;
}

// ─── DB row helpers (typed locally; supabase generated types lag the migration) ─
interface CatalogRowDb {
    id: string;
    runpod_gpu_id: string;
    display_name: string;
    is_active: boolean;
}

interface PricingRowDb {
    markup_pct: number;
    floor_per_hour_usd: number;
}

interface InventoryRowDb {
    stock_status: StockStatus;
    on_demand_per_hr: number | null;
    spot_per_hr: number | null;
}

interface PodRowDb {
    id: number;
    owner_id: string;
    runpod_pod_id: string | null;
    status: PodStatus;
    billing_service_id: string;
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

function isUniqueViolation(error: { code?: string } | null): boolean {
    return error?.code === "23505";
}

export function buildRunPodPodName(podId: number, name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
    const tag = `samatva-${podId}-${cleaned}`;
    return tag.length > 191 ? tag.slice(0, 191) : tag;
}

function deriveSshCommand(pod: RunPodPodResource): string | null {
    const ssh = pod.portMappings?.["22"];
    if (pod.publicIp && ssh) {
        return `ssh root@${pod.publicIp} -p ${ssh}`;
    }
    return null;
}

function podStatusFromRunPod(pod: RunPodPodResource): PodStatus {
    const ds = String(pod.desiredStatus || "").toUpperCase();
    if (ds === "RUNNING") return "running";
    if (ds === "STOPPED") return "stopped";
    if (ds === "TERMINATED") return "terminated";
    return "provisioning";
}

async function deleteRunPodPod(runpodPodId: string): Promise<void> {
    try {
        await RunPodClient.rest("DELETE", `/pods/${runpodPodId}`);
    } catch (e) {
        if (isRunPodError(e) && e.code === "NOT_FOUND") return;
        throw e;
    }
}

// ─── Operations ─────────────────────────────────────────────────────────────
export const podLifecycleOperations = {
    async createPod(req: CreatePodRequest): Promise<ServiceResult<CreatePodResult>> {
        let settled = false;
        let reservation: ProvisionReservation | undefined;
        let reservedNetworkVolumeId: string | undefined;
        let releaseReservedVolume = false;
        try {
            // 1. Input validation
            if (!req.name || !/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?$/.test(req.name)) {
                return {
                    success: false,
                    error: "Pod name must be 1-64 chars, alphanumeric + hyphens",
                    errorCode: "INVALID",
                };
            }
            if (req.gpuCount < 1 || req.gpuCount > 8) {
                return { success: false, error: "gpuCount must be 1–8", errorCode: "INVALID" };
            }
            // Resolve the image. Non-custom deploys MUST match an active
            // catalog template, and we trust the catalog's image — never the
            // client-supplied string — so a known template can't be used to
            // smuggle in an arbitrary image. A custom deploy (no templateId)
            // still accepts any caller-supplied public image.
            let imageName = req.imageName;
            if (req.templateId) {
                let template;
                try {
                    template = await templateOperations.getActiveTemplate(req.templateId);
                } catch (e) {
                    return {
                        success: false,
                        error: e instanceof Error ? e.message : "Could not validate template",
                        errorCode: "SERVER",
                    };
                }
                if (!template) {
                    return {
                        success: false,
                        error: "Unknown or inactive template",
                        errorCode: "INVALID",
                    };
                }
                imageName = template.imageName;
            }
            if (!imageName || imageName.length > 256) {
                return { success: false, error: "imageName is required", errorCode: "INVALID" };
            }
            const containerDiskGb = req.containerDiskGb ?? 50;
            if (containerDiskGb < 10 || containerDiskGb > 2000) {
                return { success: false, error: "containerDiskGb must be 10–2000", errorCode: "INVALID" };
            }
            const volumeGb = req.volumeGb ?? 0;
            if (volumeGb < 0 || volumeGb > 2000) {
                return { success: false, error: "volumeGb must be 0–2000", errorCode: "INVALID" };
            }

            const supabase = await createServiceClient();

            // 2. Read occupied slots. The partial unique DB index is the actual
            // concurrency gate; this query only picks likely free candidates.
            const { data: activeRows, error: countErr } = await supabase
                .from("gpu_pods")
                .select("active_slot")
                .eq("owner_id", req.ownerId)
                .in("status", [
                    "provisioning",
                    "running",
                    "stopped",
                    "restarting",
                    "interrupted",
                ]);
            if (countErr) throw new Error(`gpu_pods count failed: ${countErr.message}`);
            const occupiedSlots = new Set(
                (activeRows || [])
                    .map((row) => Number(row.active_slot))
                    .filter((slot) => Number.isInteger(slot) && slot > 0)
            );
            if (occupiedSlots.size >= MAX_PODS_PER_USER) {
                return {
                    success: false,
                    error: `Max ${MAX_PODS_PER_USER} active pods per user. Delete an existing pod first.`,
                    errorCode: "CAPACITY",
                };
            }

            // 3. Resolve catalog, pricing, latest inventory
            const { data: catalogRow, error: catErr } = await supabase
                .from("gpu_catalog")
                .select("id, runpod_gpu_id, display_name, is_active")
                .eq("id", req.gpuCatalogId)
                .maybeSingle();
            if (catErr) throw new Error(`gpu_catalog query failed: ${catErr.message}`);
            const catalog = catalogRow as CatalogRowDb | null;
            if (!catalog || !catalog.is_active) {
                return { success: false, error: "GPU type not available", errorCode: "NOT_FOUND" };
            }

            const { data: pricingRow, error: priceErr } = await supabase
                .from("gpu_pricing")
                .select("markup_pct, floor_per_hour_usd")
                .eq("gpu_catalog_id", req.gpuCatalogId)
                .eq("cloud_type", req.cloudType)
                .eq("interruptible", req.interruptible)
                .maybeSingle();
            if (priceErr) throw new Error(`gpu_pricing query failed: ${priceErr.message}`);
            const pricing = pricingRow as PricingRowDb | null;
            if (!pricing) {
                return {
                    success: false,
                    error: "Pricing not configured for this option",
                    errorCode: "INVALID",
                };
            }

            const { data: latestRow, error: invErr } = await supabase
                .from("gpu_inventory_latest")
                .select("stock_status, on_demand_per_hr, spot_per_hr")
                .eq("gpu_catalog_id", req.gpuCatalogId)
                .eq("cloud_type", req.cloudType)
                .is("data_center_id", null)
                .maybeSingle();
            if (invErr) throw new Error(`inventory query failed: ${invErr.message}`);
            const latest = latestRow as InventoryRowDb | null;
            if (!latest || latest.stock_status === "none") {
                return {
                    success: false,
                    error: "GPU is currently out of stock. Try a different option.",
                    errorCode: "CAPACITY",
                };
            }

            const observedPerHr = req.interruptible
                ? latest.spot_per_hr
                : latest.on_demand_per_hr;
            if (observedPerHr === null || observedPerHr <= 0) {
                return {
                    success: false,
                    error: "Pricing data unavailable for this GPU/cloud combination.",
                    errorCode: "CAPACITY",
                };
            }

            // GPU compute resale + local-disk storage (container disk + pod
            // volume). Network volumes bill via their own meter, so they're
            // excluded here. The deploy UI uses the same formula so the quoted
            // and billed rates match.
            const gpuCostUsd = computeResalePerHour({
                observedPerHr,
                markupPct: Number(pricing.markup_pct),
                floorPerHour: Number(pricing.floor_per_hour_usd),
                gpuCount: req.gpuCount,
            });
            const storageCostUsd = storagePerHour({ containerDiskGb, volumeGb });
            const hourlyCostUsd =
                Math.round((gpuCostUsd + storageCostUsd) * 10000) / 10000;
            if (hourlyCostUsd > MAX_HOURLY_RATE_PER_POD_USD) {
                return {
                    success: false,
                    error: `Hourly rate $${hourlyCostUsd.toFixed(
                        4
                    )} exceeds the per-pod ceiling $${MAX_HOURLY_RATE_PER_POD_USD}.`,
                    errorCode: "INVALID",
                };
            }

            // 4. Balance gate — atomically HOLD 1h of cost BEFORE provisioning so
            //    concurrent creates can't all pass a stale read and spawn a free
            //    fleet. The hold is refunded on success (settleProvision) — net
            //    upfront charge is $0, the cron meters hourly as before.
            const minRequired = hourlyCostUsd * MIN_HOURS_BALANCE_FOR_CREATE;
            const reservationResult = await reserveProvision({
                userId: req.ownerId,
                initialCost: 0,
                hourlyRate: hourlyCostUsd,
            });
            reservation = reservationResult.reservation;
            if (!reservationResult.ok) {
                return {
                    success: false,
                    error: `Insufficient credits. You need at least $${minRequired.toFixed(4)}.`,
                    errorCode: "INVALID",
                };
            }

            let networkVolumeId = req.networkVolumeId;
            let dataCenterIds = req.dataCenterIds;
            if (req.networkVolumeRecordId !== undefined) {
                if (
                    !Number.isSafeInteger(req.networkVolumeRecordId) ||
                    req.networkVolumeRecordId < 1
                ) {
                    return {
                        success: false,
                        error: "Invalid network volume ID",
                        errorCode: "INVALID",
                    };
                }
                const attachment = await volumeOperations.reserveVolumeAttachment({
                    volumeId: req.networkVolumeRecordId,
                    ownerId: req.ownerId,
                });
                if (!attachment.success || !attachment.data) {
                    return {
                        success: false,
                        error: attachment.error || "Unable to attach network volume",
                        errorCode: attachment.errorCode || "CAPACITY",
                    };
                }
                networkVolumeId = attachment.data.runpodVolumeId;
                dataCenterIds = [attachment.data.dataCenterId];
                reservedNetworkVolumeId = networkVolumeId;
                releaseReservedVolume = true;
            }

            // 5. Prepare env (inject SSH key + optional root password)
            const userEnv: Record<string, string> = { ...(req.env || {}) };
            if (req.publicKey) userEnv.PUBLIC_KEY = req.publicKey;
            if (req.rootPassword) userEnv.ROOT_PASSWORD = req.rootPassword;
            const envKeys = Object.keys(userEnv);

            const encryptionKey = process.env.ENCRYPTION_KEY;
            const envBlob =
                encryptionKey && envKeys.length > 0
                    ? JSON.stringify(Encryption.encrypt(JSON.stringify(userEnv), encryptionKey))
                    : null;

            // 6. Reserve pod row BEFORE calling RunPod (provides rollback anchor + idemp source-of-truth)
            const billingStart = new Date();
            let inserted: { id: number; billing_service_id: string } | null = null;
            let insertError: { code?: string; message: string } | null = null;
            for (let slot = 1; slot <= MAX_PODS_PER_USER; slot += 1) {
                if (occupiedSlots.has(slot)) continue;
                const { data, error } = await supabase
                    .from("gpu_pods")
                    .insert({
                        owner_id: req.ownerId,
                        owner_email: req.ownerEmail || null,
                        name: req.name,
                        gpu_catalog_id: req.gpuCatalogId,
                        gpu_count: req.gpuCount,
                        cloud_type: req.cloudType,
                        interruptible: req.interruptible,
                        image_name: imageName,
                        template_id: req.templateId || null,
                        container_disk_gb: containerDiskGb,
                        volume_gb: volumeGb,
                        network_volume_id: networkVolumeId || null,
                        ports:
                            req.ports && req.ports.length > 0
                                ? req.ports
                                : ["22/tcp"],
                        env_keys: envKeys,
                        env_blob: envBlob,
                        status: "provisioning",
                        details: {
                            provisioning: {
                                stage: "queuing",
                                progress: 10,
                                message: "Allocating GPU…",
                                started_at: billingStart.toISOString(),
                            },
                        },
                        hourly_cost_usd: hourlyCostUsd,
                        runpod_cost_per_hr: observedPerHr,
                        billing_start: billingStart.toISOString(),
                        active_slot: slot,
                    })
                    .select("id, billing_service_id")
                    .single();
                if (!error && data) {
                    inserted = data as {
                        id: number;
                        billing_service_id: string;
                    };
                    break;
                }
                insertError = error;
                if (!isUniqueViolation(error)) break;
            }
            if (!inserted) {
                const atCapacity = isUniqueViolation(insertError);
                return {
                    success: false,
                    error: atCapacity
                        ? `Max ${MAX_PODS_PER_USER} active pods per user. Delete an existing pod first.`
                        : `Failed to reserve pod record: ${
                              insertError?.message || "unknown database error"
                          }`,
                    errorCode: atCapacity ? "CAPACITY" : "SERVER",
                };
            }
            const podId = inserted.id;
            const billingServiceId = inserted.billing_service_id;

            // 7. Call RunPod (with full rollback on failure)
            //
            // NOTE: `req.templateId` refers to our LOCAL preset id (e.g.
            // "pytorch-cuda-12") used only for our analytics. It is NOT a
            // RunPod-side template UUID, so we must NEVER forward it to the
            // RunPod create-pod call — RunPod would return "template not
            // found". The image is conveyed via `imageName` only.
            let runpodPod: RunPodPodResource | undefined;
            try {
                const runpodReq: RunPodCreatePodRequest = {
                    name: buildRunPodPodName(podId, req.name),
                    imageName,
                    computeType: "GPU",
                    cloudType: req.cloudType,
                    interruptible: req.interruptible,
                    gpuTypeIds: [catalog.runpod_gpu_id],
                    gpuTypePriority: "custom",
                    gpuCount: req.gpuCount,
                    containerDiskInGb: containerDiskGb,
                    volumeInGb: volumeGb,
                    volumeMountPath: DEFAULT_VOLUME_MOUNT,
                    networkVolumeId,
                    ports:
                        req.ports && req.ports.length > 0 ? req.ports : ["22/tcp"],
                    env: userEnv,
                    dataCenterIds,
                    dataCenterPriority:
                        dataCenterIds && dataCenterIds.length > 0
                            ? "custom"
                            : "availability",
                    supportPublicIp: true,
                };
                runpodPod = await RunPodClient.rest<RunPodPodResource>(
                    "POST",
                    "/pods",
                    runpodReq
                );
            } catch (e) {
                if (isRunPodError(e) && e.code === "TIMEOUT") {
                    try {
                        const pods = await RunPodClient.rest<
                            RunPodPodResource[]
                        >("GET", "/pods");
                        runpodPod = pods.find(
                            (pod) =>
                                pod.name === buildRunPodPodName(podId, req.name)
                        );
                    } catch (recoveryError) {
                        console.warn(
                            `[GPU:createPod] timeout recovery lookup failed for pod ${podId}:`,
                            recoveryError
                        );
                    }
                }
                if (!runpodPod) {
                    const errMsg = isRunPodError(e)
                        ? e.message
                        : "RunPod request failed";
                    const errCode = isRunPodError(e) ? e.code : "SERVER";
                    const outcomeUnknown = errCode === "TIMEOUT";
                    if (outcomeUnknown) releaseReservedVolume = false;
                    await supabase
                        .from("gpu_pods")
                        .update({
                            status: outcomeUnknown ? "provisioning" : "failed",
                            details: {
                                provisioning: {
                                    stage: outcomeUnknown
                                        ? "provider_outcome_unknown"
                                        : "failed",
                                    progress: 0,
                                    message: errMsg,
                                    started_at: billingStart.toISOString(),
                                    failed_at: new Date().toISOString(),
                                    provider_name: buildRunPodPodName(
                                        podId,
                                        req.name
                                    ),
                                    cleanup_pending: outcomeUnknown,
                                },
                            },
                        })
                        .eq("id", podId);
                    await supabase.from("gpu_pod_events").insert({
                        pod_id: podId,
                        event_type: "failed",
                        message: errMsg,
                        metadata: isRunPodError(e)
                            ? { code: e.code, status: e.status }
                            : null,
                    });
                    return { success: false, error: errMsg, errorCode: errCode };
                }
            }

            if (!runpodPod) {
                return {
                    success: false,
                    error: "Provider pod outcome could not be determined",
                    errorCode: "TIMEOUT",
                };
            }

            // 8. Persist RunPod data on the pod row
            const sshCommand = deriveSshCommand(runpodPod);
            const status = podStatusFromRunPod(runpodPod);
            const providerPatch = {
                runpod_pod_id: runpodPod.id,
                status,
                public_ip: runpodPod.publicIp || null,
                port_mappings: runpodPod.portMappings || null,
                data_center_id: runpodPod.machine?.dataCenterId || null,
                ssh_command: sshCommand,
                details: {
                    provisioning: {
                        stage: "complete",
                        progress: 100,
                        message: "Pod ready",
                        started_at: billingStart.toISOString(),
                        completed_at: new Date().toISOString(),
                    },
                },
            };
            let { error: updateErr } = await supabase
                .from("gpu_pods")
                .update(providerPatch)
                .eq("id", podId);
            if (updateErr) {
                // Retry once before compensating. Provider writes are not retried,
                // so this cannot create a duplicate pod.
                ({ error: updateErr } = await supabase
                    .from("gpu_pods")
                    .update(providerPatch)
                    .eq("id", podId));
            }
            if (updateErr) {
                let rollbackFailed = false;
                try {
                    await deleteRunPodPod(runpodPod.id);
                } catch (rollbackErr) {
                    rollbackFailed = true;
                    releaseReservedVolume = false;
                    console.error(
                        `[GPU:createPod] CRITICAL: provider pod ${runpodPod.id} exists but DB persistence and rollback both failed`,
                        rollbackErr
                    );
                }
                await supabase
                    .from("gpu_pods")
                    .update({
                        status: "failed",
                        details: {
                            provisioning: {
                                stage: "failed",
                                message: `Provider pod persistence failed: ${updateErr.message}`,
                                provider_pod_id: runpodPod.id,
                                cleanup_pending: rollbackFailed,
                            },
                        },
                    })
                    .eq("id", podId);
                return {
                    success: false,
                    error: "Failed to persist provisioned GPU pod",
                    errorCode: "SERVER",
                };
            }

            // 9. Wire billing — no upfront deduct; cron handles hourly. If active-row insert fails,
            //    we cannot leave a billed-but-unbilled pod, so we tear down RunPod + mark failed.
            try {
                await settleProvision({
                    reservation: reservationResult.reservation,
                    initialCost: 0,
                    hourlyRate: hourlyCostUsd,
                    serviceId: billingServiceId,
                    serviceType: "gpu_pod",
                    addActive: async ({ userId, serviceId, hourlyRate }) => {
                        await BillingCredits.addActiveGpuPod({
                            userId,
                            serviceId, // gpu_pods.billing_service_id (UUID)
                            hourlyRate,
                        });
                    },
                });
                settled = true;
                releaseReservedVolume = false;
            } catch (billingErr) {
                console.error("[GPU:createPod] Billing wire-up failed:", billingErr);
                try {
                    await deleteRunPodPod(runpodPod.id);
                } catch (destroyErr) {
                    console.error(
                        "[GPU:createPod] Rollback DELETE failed:",
                        destroyErr
                    );
                    await supabase.from("gpu_pod_events").insert({
                        pod_id: podId,
                        event_type: "billing_rollback_failed",
                        message: "Billing activation failed and provider rollback did not complete",
                        metadata: { runpod_pod_id: runpodPod.id },
                    });
                    releaseReservedVolume = false;
                    return {
                        success: false,
                        error: "Billing activation failed and pod cleanup is pending",
                        errorCode: "SERVER",
                    };
                }
                await supabase
                    .from("gpu_pods")
                    .update({ status: "failed" })
                    .eq("id", podId);
                return {
                    success: false,
                    error:
                        billingErr instanceof Error
                            ? billingErr.message
                            : "Billing wire-up failed",
                    errorCode: "SERVER",
                };
            }

            // 10. Audit event
            await supabase.from("gpu_pod_events").insert({
                pod_id: podId,
                event_type: "created",
                message: `Pod ${req.name} created on RunPod`,
                metadata: {
                    runpod_pod_id: runpodPod.id,
                    cloud_type: req.cloudType,
                    interruptible: req.interruptible,
                    gpu_count: req.gpuCount,
                    hourly_cost_usd: hourlyCostUsd,
                    runpod_cost_per_hr: observedPerHr,
                    data_center_id: runpodPod.machine?.dataCenterId,
                },
            });

            return {
                success: true,
                data: {
                    podId,
                    runpodPodId: runpodPod.id,
                    name: req.name,
                    status,
                    publicIp: runpodPod.publicIp || null,
                    portMappings: runpodPod.portMappings || {},
                    hourlyCostUsd,
                    sshCommand,
                },
            };
        } catch (e) {
            console.error("[GPU:createPod] failed:", e);
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        } finally {
            // Any non-settle exit (validation/capacity/RunPod/billing failure or
            // throw) refunds the 1h hold exactly once. No-op once settled, and a
            // no-op before the reservation is taken (reservation is undefined).
            if (!settled) {
                await releaseProvision(reservation);
            }
            if (releaseReservedVolume && reservedNetworkVolumeId) {
                await volumeOperations.releaseVolumeAttachment({
                    runpodVolumeId: reservedNetworkVolumeId,
                    ownerId: req.ownerId,
                });
            }
        }
    },

    async powerPod(
        req: PowerPodRequest
    ): Promise<ServiceResult<{ status: PodStatus }>> {
        try {
            const supabase = await createServiceClient();
            const { data: row, error: getErr } = await supabase
                .from("gpu_pods")
                .select("id, owner_id, runpod_pod_id, status, billing_service_id, container_disk_gb, volume_gb, hourly_cost_usd")
                .eq("id", req.podId)
                .maybeSingle();
            if (getErr) throw new Error(getErr.message);
            const pod = row as PodRowDb | null;
            const podMeter = row as {
                container_disk_gb?: number | null;
                volume_gb?: number | null;
                hourly_cost_usd?: number | null;
            } | null;
            if (!pod) {
                return { success: false, error: "Pod not found", errorCode: "NOT_FOUND" };
            }
            if (pod.owner_id !== req.ownerId) {
                return { success: false, error: "Not authorized", errorCode: "AUTH" };
            }
            if (!pod.runpod_pod_id) {
                return {
                    success: false,
                    error: "Pod is still provisioning",
                    errorCode: "INVALID",
                };
            }
            if (pod.status === "terminated") {
                return {
                    success: false,
                    error: "Pod has been terminated",
                    errorCode: "INVALID",
                };
            }

            // A grace/paused meter means billing has explicitly suspended this
            // resource. Do not restart compute until the billing lifecycle has
            // restored the meter to active.
            if (req.action === "start") {
                const { data: meter, error: meterErr } = await supabase
                    .schema("billing")
                    .from("active_gpu_pods")
                    .select("status")
                    .eq("service_id", pod.billing_service_id)
                    .maybeSingle();
                if (meterErr) {
                    return {
                        success: false,
                        error: `Could not verify GPU pod billing status: ${meterErr.message}`,
                        errorCode: "SERVER",
                    };
                }
                if (meter?.status !== "active") {
                    return {
                        success: false,
                        error: "GPU pod billing is not active",
                        errorCode: "INVALID",
                    };
                }
            }

            try {
                await RunPodClient.rest(
                    "POST",
                    `/pods/${pod.runpod_pod_id}/${req.action}`
                );
            } catch (e) {
                return {
                    success: false,
                    error: isRunPodError(e) ? e.message : `Failed to ${req.action} pod`,
                    errorCode: isRunPodError(e) ? e.code : "SERVER",
                };
            }

            const newStatus: PodStatus =
                req.action === "start"
                    ? "running"
                    : req.action === "stop"
                      ? "stopped"
                      : "restarting";
            const { error: statusErr } = await supabase
                .from("gpu_pods")
                .update({ status: newStatus })
                .eq("id", req.podId);
            if (statusErr) {
                return {
                    success: false,
                    error: `Pod changed upstream but local state update failed: ${statusErr.message}`,
                    errorCode: "SERVER",
                };
            }

            // M3: re-rate the meter. A stopped pod releases the GPU upstream but
            // keeps its disk, so meter storage-only while stopped; restore the full
            // rate on start. (No change on restart — the pod stays running.)
            try {
                if (req.action === "stop") {
                    const storageOnly = storagePerHour({
                        containerDiskGb: Number(podMeter?.container_disk_gb ?? 0),
                        volumeGb: Number(podMeter?.volume_gb ?? 0),
                    });
                    await BillingCredits.updateActiveGpuPodRate({
                        serviceId: pod.billing_service_id,
                        hourlyRate: Math.round(storageOnly * 10000) / 10000,
                    });
                } else if (req.action === "start") {
                    await BillingCredits.updateActiveGpuPodRate({
                        serviceId: pod.billing_service_id,
                        hourlyRate: Number(podMeter?.hourly_cost_usd ?? 0),
                    });
                }
            } catch (rateErr) {
                return {
                    success: false,
                    error: `Pod changed upstream but billing rate update failed: ${
                        rateErr instanceof Error ? rateErr.message : String(rateErr)
                    }`,
                    errorCode: "SERVER",
                };
            }

            await supabase.from("gpu_pod_events").insert({
                pod_id: req.podId,
                event_type: req.action,
                message: `Pod ${req.action} requested by user`,
            });

            return { success: true, data: { status: newStatus } };
        } catch (e) {
            console.error(`[GPU:powerPod] failed:`, e);
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },

    async destroyPod(
        req: DestroyPodRequest
    ): Promise<ServiceResult<{ podId: number; finalCharge: number }>> {
        try {
            const supabase = await createServiceClient();
            const { data: row, error: getErr } = await supabase
                .from("gpu_pods")
                .select("id, owner_id, runpod_pod_id, status, billing_service_id, network_volume_id")
                .eq("id", req.podId)
                .maybeSingle();
            if (getErr) throw new Error(getErr.message);
            const pod = row as PodRowDb | null;
            const podNetworkVolumeId = (
                row as { network_volume_id?: string | null } | null
            )?.network_volume_id;
            if (!pod) {
                return { success: false, error: "Pod not found", errorCode: "NOT_FOUND" };
            }
            if (pod.owner_id !== req.ownerId) {
                return { success: false, error: "Not authorized", errorCode: "AUTH" };
            }
            if (pod.status === "terminated") {
                return { success: false, error: "Already terminated", errorCode: "INVALID" };
            }

            // 1. Destroy on RunPod. A transient provider failure must not be
            // reported as success or converted into a terminal local state.
            if (pod.runpod_pod_id) {
                try {
                    await deleteRunPodPod(pod.runpod_pod_id);
                } catch (e) {
                    return {
                        success: false,
                        error: isRunPodError(e) ? e.message : "Failed to delete provider pod",
                        errorCode: isRunPodError(e) ? e.code : "SERVER",
                    };
                }
            }

            // 2. Close billing (prorate final partial hour + remove active row)
            let finalCharge: number;
            try {
                finalCharge = await closeActiveBilling({
                    userId: req.ownerId,
                    serviceId: pod.billing_service_id,
                    serviceType: "gpu_pod",
                    closeActive: () =>
                        BillingCredits.closeActiveGpuPod({
                            serviceId: pod.billing_service_id,
                            waiveCharge: req.waiveFinalCharge,
                        }),
                });
            } catch (billingErr) {
                return {
                    success: false,
                    error: `Provider pod was deleted but billing closure failed: ${
                        billingErr instanceof Error
                            ? billingErr.message
                            : String(billingErr)
                    }`,
                    errorCode: "SERVER",
                };
            }

            if (podNetworkVolumeId) {
                const release = await volumeOperations.releaseVolumeAttachment({
                    runpodVolumeId: podNetworkVolumeId,
                    ownerId: req.ownerId,
                });
                if (!release.success) {
                    return {
                        success: false,
                        error:
                            release.error ||
                            "Failed to release attached network volume",
                        errorCode: release.errorCode || "SERVER",
                    };
                }
            }

            // 3. Update pod row to terminal state
            const { error: terminateErr } = await supabase
                .from("gpu_pods")
                .update({
                    status: "terminated",
                    billing_end: new Date().toISOString(),
                })
                .eq("id", req.podId);
            if (terminateErr) {
                return {
                    success: false,
                    error: `Provider and billing were closed but local terminal state failed: ${terminateErr.message}`,
                    errorCode: "SERVER",
                };
            }

            await supabase.from("gpu_pod_events").insert({
                pod_id: req.podId,
                event_type: "destroyed",
                message: "Pod terminated by user",
                metadata: { final_charge_usd: finalCharge },
            });

            return { success: true, data: { podId: req.podId, finalCharge } };
        } catch (e) {
            console.error(`[GPU:destroyPod] failed:`, e);
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },
};
