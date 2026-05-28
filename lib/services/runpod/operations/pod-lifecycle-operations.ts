// Pod lifecycle operations: create, power (start/stop/restart), destroy.
// Mirrors the lib/services/database/operations/cluster-lifecycle-operations.ts shape:
// validate → ensureBalance → reserve DB row → call upstream → wire billing → audit.

import { ensureBalance, postProvisionBilling, closeActiveBilling } from "@/config/billing-flow";
import { Encryption } from "@/config/functions";
import { BillingCredits } from "@/lib/billing/credits";
import { createServiceClient } from "@/lib/supabase/server";

import { RunPodClient } from "../client";
import { computeResalePerHour } from "../helpers";
import { templateOperations } from "./template-operations";
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

function nameToHostname(podId: number, name: string): string {
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

// ─── Operations ─────────────────────────────────────────────────────────────
export const podLifecycleOperations = {
    async createPod(req: CreatePodRequest): Promise<ServiceResult<CreatePodResult>> {
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

            // 2. Per-user active pod limit
            const { count: activeCount, error: countErr } = await supabase
                .from("gpu_pods")
                .select("id", { count: "exact", head: true })
                .eq("owner_id", req.ownerId)
                .in("status", [
                    "provisioning",
                    "running",
                    "stopped",
                    "restarting",
                    "interrupted",
                ]);
            if (countErr) throw new Error(`gpu_pods count failed: ${countErr.message}`);
            if ((activeCount || 0) >= MAX_PODS_PER_USER) {
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

            const hourlyCostUsd = computeResalePerHour({
                observedPerHr,
                markupPct: Number(pricing.markup_pct),
                floorPerHour: Number(pricing.floor_per_hour_usd),
                gpuCount: req.gpuCount,
            });
            if (hourlyCostUsd > MAX_HOURLY_RATE_PER_POD_USD) {
                return {
                    success: false,
                    error: `Hourly rate $${hourlyCostUsd.toFixed(
                        4
                    )} exceeds the per-pod ceiling $${MAX_HOURLY_RATE_PER_POD_USD}.`,
                    errorCode: "INVALID",
                };
            }

            // 4. Balance gate (1 hour of credit required to start)
            const minRequired = hourlyCostUsd * MIN_HOURS_BALANCE_FOR_CREATE;
            const balCheck = await ensureBalance(req.ownerId, minRequired);
            if (!balCheck.ok) {
                return {
                    success: false,
                    error: `Insufficient credits. You need at least $${minRequired.toFixed(4)}.`,
                    errorCode: "INVALID",
                };
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
            const { data: inserted, error: insErr } = await supabase
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
                    network_volume_id: req.networkVolumeId || null,
                    ports:
                        req.ports && req.ports.length > 0 ? req.ports : ["22/tcp"],
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
                })
                .select("id")
                .single();
            if (insErr) {
                return {
                    success: false,
                    error: `Failed to reserve pod record: ${insErr.message}`,
                    errorCode: "SERVER",
                };
            }
            const podId = (inserted as { id: number }).id;

            // 7. Call RunPod (with full rollback on failure)
            //
            // NOTE: `req.templateId` refers to our LOCAL preset id (e.g.
            // "pytorch-cuda-12") used only for our analytics. It is NOT a
            // RunPod-side template UUID, so we must NEVER forward it to the
            // RunPod create-pod call — RunPod would return "template not
            // found". The image is conveyed via `imageName` only.
            let runpodPod: RunPodPodResource;
            try {
                const runpodReq: RunPodCreatePodRequest = {
                    name: nameToHostname(podId, req.name),
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
                    networkVolumeId: req.networkVolumeId,
                    ports:
                        req.ports && req.ports.length > 0 ? req.ports : ["22/tcp"],
                    env: userEnv,
                    dataCenterIds: req.dataCenterIds,
                    dataCenterPriority:
                        req.dataCenterIds && req.dataCenterIds.length > 0
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
                const errMsg = isRunPodError(e) ? e.message : "RunPod request failed";
                const errCode = isRunPodError(e) ? e.code : "SERVER";
                await supabase
                    .from("gpu_pods")
                    .update({
                        status: "failed",
                        details: {
                            provisioning: {
                                stage: "failed",
                                progress: 0,
                                message: errMsg,
                                started_at: billingStart.toISOString(),
                                failed_at: new Date().toISOString(),
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

            // 8. Persist RunPod data on the pod row
            const sshCommand = deriveSshCommand(runpodPod);
            const status = podStatusFromRunPod(runpodPod);
            const { error: updateErr } = await supabase
                .from("gpu_pods")
                .update({
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
                })
                .eq("id", podId);
            if (updateErr) {
                console.error(
                    `[GPU:createPod] Failed to update pod ${podId} after RunPod success:`,
                    updateErr.message
                );
            }

            // 9. Wire billing — no upfront deduct; cron handles hourly. If active-row insert fails,
            //    we cannot leave a billed-but-unbilled pod, so we tear down RunPod + mark failed.
            try {
                await postProvisionBilling({
                    userId: req.ownerId,
                    initialCost: 0,
                    hourlyRate: hourlyCostUsd,
                    serviceId: String(podId),
                    serviceType: "gpu_pod",
                    addActive: async ({ userId, serviceId, hourlyRate }) => {
                        await BillingCredits.addActiveGpuPod({
                            userId,
                            serviceId: Number(serviceId),
                            hourlyRate,
                        });
                    },
                });
            } catch (billingErr) {
                console.error("[GPU:createPod] Billing wire-up failed:", billingErr);
                try {
                    await RunPodClient.rest("DELETE", `/pods/${runpodPod.id}`);
                } catch (destroyErr) {
                    console.error(
                        "[GPU:createPod] Rollback DELETE failed:",
                        destroyErr
                    );
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
        }
    },

    async powerPod(
        req: PowerPodRequest
    ): Promise<ServiceResult<{ status: PodStatus }>> {
        try {
            const supabase = await createServiceClient();
            const { data: row, error: getErr } = await supabase
                .from("gpu_pods")
                .select("id, owner_id, runpod_pod_id, status")
                .eq("id", req.podId)
                .maybeSingle();
            if (getErr) throw new Error(getErr.message);
            const pod = row as PodRowDb | null;
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
            await supabase
                .from("gpu_pods")
                .update({ status: newStatus })
                .eq("id", req.podId);
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
                .select("id, owner_id, runpod_pod_id, status")
                .eq("id", req.podId)
                .maybeSingle();
            if (getErr) throw new Error(getErr.message);
            const pod = row as PodRowDb | null;
            if (!pod) {
                return { success: false, error: "Pod not found", errorCode: "NOT_FOUND" };
            }
            if (pod.owner_id !== req.ownerId) {
                return { success: false, error: "Not authorized", errorCode: "AUTH" };
            }
            if (pod.status === "terminated") {
                return { success: false, error: "Already terminated", errorCode: "INVALID" };
            }

            // 1. Destroy on RunPod (best-effort — DB cleanup must still happen)
            if (pod.runpod_pod_id) {
                try {
                    await RunPodClient.rest("DELETE", `/pods/${pod.runpod_pod_id}`);
                } catch (e) {
                    console.warn(
                        `[GPU:destroyPod] RunPod delete failed for ${pod.runpod_pod_id}:`,
                        isRunPodError(e) ? e.message : e
                    );
                }
            }

            // 2. Close billing (prorate final partial hour + remove active row)
            let finalCharge = 0;
            try {
                await closeActiveBilling({
                    userId: req.ownerId,
                    serviceId: String(req.podId),
                    serviceType: "gpu_pod",
                    closeActive: async () => {
                        const result = await BillingCredits.closeActiveGpuPod({
                            serviceId: req.podId,
                        });
                        finalCharge = result.finalCharge;
                        return result;
                    },
                });
            } catch (billingErr) {
                console.warn("[GPU:destroyPod] Billing close failed:", billingErr);
            }

            // 3. Update pod row to terminal state
            await supabase
                .from("gpu_pods")
                .update({
                    status: "terminated",
                    billing_end: new Date().toISOString(),
                })
                .eq("id", req.podId);

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
