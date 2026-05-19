// Pod read + reconcile operations.
// - list/get serve the dashboard
// - reconcileActivePods is called by the cron worker to keep DB status in sync
//   with RunPod (catches spot interruptions, manual deletions, etc.)

import { closeActiveBilling } from "@/config/billing-flow";
import { BillingCredits } from "@/lib/billing/credits";
import { createServiceClient } from "@/lib/supabase/server";

import { RunPodClient } from "../client";
import type {
    CloudType,
    PodStatus,
    RunPodError,
    RunPodPodResource,
    ServiceResult,
} from "../types";

export interface GpuPodSummary {
    id: number;
    name: string;
    status: PodStatus;
    gpuCatalogId: string;
    gpuCount: number;
    cloudType: CloudType;
    interruptible: boolean;
    publicIp: string | null;
    portMappings: Record<string, number> | null;
    hourlyCostUsd: number;
    createdAt: string;
    runpodPodId: string | null;
}

export interface GpuPodDetail extends GpuPodSummary {
    ownerId: string;
    imageName: string;
    templateId: string | null;
    containerDiskGb: number;
    volumeGb: number;
    networkVolumeId: string | null;
    dataCenterId: string | null;
    ports: string[];
    envKeys: string[];
    sshCommand: string | null;
    details: Record<string, unknown> | null;
    billingStart: string | null;
    billingEnd: string | null;
}

export interface ReconcileResult {
    checked: number;
    updated: number;
    terminated: number;
    interrupted: number;
}

interface PodRowDb {
    id: number;
    owner_id: string;
    runpod_pod_id: string | null;
    status: PodStatus;
    name: string;
    gpu_catalog_id: string;
    gpu_count: number;
    cloud_type: CloudType;
    interruptible: boolean;
    image_name: string;
    template_id: string | null;
    container_disk_gb: number;
    volume_gb: number;
    network_volume_id: string | null;
    data_center_id: string | null;
    ports: string[] | null;
    env_keys: string[] | null;
    public_ip: string | null;
    port_mappings: Record<string, number> | null;
    ssh_command: string | null;
    details: Record<string, unknown> | null;
    hourly_cost_usd: number;
    billing_start: string | null;
    billing_end: string | null;
    created_at: string;
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

function rowToSummary(r: PodRowDb): GpuPodSummary {
    return {
        id: r.id,
        name: r.name,
        status: r.status,
        gpuCatalogId: r.gpu_catalog_id,
        gpuCount: r.gpu_count,
        cloudType: r.cloud_type,
        interruptible: r.interruptible,
        publicIp: r.public_ip,
        portMappings: r.port_mappings,
        hourlyCostUsd: Number(r.hourly_cost_usd),
        createdAt: r.created_at,
        runpodPodId: r.runpod_pod_id,
    };
}

function rowToDetail(r: PodRowDb): GpuPodDetail {
    return {
        ...rowToSummary(r),
        ownerId: r.owner_id,
        imageName: r.image_name,
        templateId: r.template_id,
        containerDiskGb: r.container_disk_gb,
        volumeGb: r.volume_gb,
        networkVolumeId: r.network_volume_id,
        dataCenterId: r.data_center_id,
        ports: r.ports || [],
        envKeys: r.env_keys || [],
        sshCommand: r.ssh_command,
        details: r.details,
        billingStart: r.billing_start,
        billingEnd: r.billing_end,
    };
}

function podStatusFromRunPod(pod: RunPodPodResource): PodStatus {
    const ds = String(pod.desiredStatus || "").toUpperCase();
    if (ds === "RUNNING") return "running";
    if (ds === "STOPPED") return "stopped";
    if (ds === "TERMINATED") return "terminated";
    return "provisioning";
}

export const podReadOperations = {
    async listUserPods(
        ownerId: string
    ): Promise<ServiceResult<GpuPodSummary[]>> {
        try {
            const supabase = await createServiceClient();
            const { data, error } = await supabase
                .from("gpu_pods")
                .select(
                    "id, owner_id, runpod_pod_id, status, name, gpu_catalog_id, gpu_count, cloud_type, interruptible, image_name, template_id, container_disk_gb, volume_gb, network_volume_id, data_center_id, ports, env_keys, public_ip, port_mappings, ssh_command, details, hourly_cost_usd, billing_start, billing_end, created_at"
                )
                .eq("owner_id", ownerId)
                .neq("status", "terminated")
                .order("created_at", { ascending: false });
            if (error) throw new Error(error.message);
            return {
                success: true,
                data: ((data || []) as PodRowDb[]).map(rowToSummary),
            };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },

    async getUserPod(
        podId: number,
        ownerId: string
    ): Promise<ServiceResult<GpuPodDetail>> {
        try {
            const supabase = await createServiceClient();
            const { data, error } = await supabase
                .from("gpu_pods")
                .select(
                    "id, owner_id, runpod_pod_id, status, name, gpu_catalog_id, gpu_count, cloud_type, interruptible, image_name, template_id, container_disk_gb, volume_gb, network_volume_id, data_center_id, ports, env_keys, public_ip, port_mappings, ssh_command, details, hourly_cost_usd, billing_start, billing_end, created_at"
                )
                .eq("id", podId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            const row = data as PodRowDb | null;
            if (!row) {
                return {
                    success: false,
                    error: "Pod not found",
                    errorCode: "NOT_FOUND",
                };
            }
            if (row.owner_id !== ownerId) {
                return {
                    success: false,
                    error: "Not authorized",
                    errorCode: "AUTH",
                };
            }
            return { success: true, data: rowToDetail(row) };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },

    /**
     * Walk every pod whose DB status implies "should be present on RunPod"
     * and reconcile against the upstream resource. Detects:
     *   - status drift (provisioning → running, running → stopped, etc.)
     *   - spot interruptions (404 from RunPod after a running pod)
     *   - manually-deleted pods (also 404)
     *
     * Side-effects:
     *   - updates gpu_pods.status, public_ip, port_mappings
     *   - on disappearance: closes billing + marks 'interrupted' or 'terminated'
     *   - writes gpu_pod_events
     */
    async reconcileActivePods(): Promise<ServiceResult<ReconcileResult>> {
        const counter: ReconcileResult = {
            checked: 0,
            updated: 0,
            terminated: 0,
            interrupted: 0,
        };
        try {
            const supabase = await createServiceClient();
            const { data: rows, error } = await supabase
                .from("gpu_pods")
                .select(
                    "id, owner_id, runpod_pod_id, status, interruptible, name"
                )
                .in("status", ["provisioning", "running", "restarting", "stopped"])
                .not("runpod_pod_id", "is", null);
            if (error) throw new Error(error.message);

            for (const r of (rows || []) as Array<{
                id: number;
                owner_id: string;
                runpod_pod_id: string;
                status: PodStatus;
                interruptible: boolean;
                name: string;
            }>) {
                counter.checked += 1;
                let upstream: RunPodPodResource | null = null;
                try {
                    upstream = await RunPodClient.rest<RunPodPodResource>(
                        "GET",
                        `/pods/${r.runpod_pod_id}`
                    );
                } catch (e) {
                    if (isRunPodError(e) && e.code === "NOT_FOUND") {
                        // Pod disappeared upstream: spot interruption or manual destroy
                        const finalStatus: PodStatus = r.interruptible
                            ? "interrupted"
                            : "terminated";
                        try {
                            await closeActiveBilling({
                                userId: r.owner_id,
                                serviceId: String(r.id),
                                serviceType: "gpu_pod",
                                closeActive: () =>
                                    BillingCredits.closeActiveGpuPod({
                                        serviceId: r.id,
                                    }),
                            });
                        } catch (billErr) {
                            console.warn(
                                `[GPU:reconcile] billing close failed for pod ${r.id}:`,
                                billErr
                            );
                        }
                        await supabase
                            .from("gpu_pods")
                            .update({
                                status: finalStatus,
                                billing_end: new Date().toISOString(),
                            })
                            .eq("id", r.id);
                        await supabase.from("gpu_pod_events").insert({
                            pod_id: r.id,
                            event_type: finalStatus,
                            message:
                                finalStatus === "interrupted"
                                    ? "Spot pod was interrupted by RunPod"
                                    : "Pod no longer exists upstream",
                        });
                        if (finalStatus === "interrupted") counter.interrupted += 1;
                        else counter.terminated += 1;
                        counter.updated += 1;
                        continue;
                    }
                    console.warn(
                        `[GPU:reconcile] fetch failed for ${r.runpod_pod_id}:`,
                        isRunPodError(e) ? e.message : e
                    );
                    continue;
                }

                if (!upstream) continue;
                const newStatus = podStatusFromRunPod(upstream);
                if (newStatus !== r.status) {
                    await supabase
                        .from("gpu_pods")
                        .update({
                            status: newStatus,
                            public_ip: upstream.publicIp || null,
                            port_mappings: upstream.portMappings || null,
                        })
                        .eq("id", r.id);
                    await supabase.from("gpu_pod_events").insert({
                        pod_id: r.id,
                        event_type: "status_change",
                        message: `Status: ${r.status} → ${newStatus}`,
                    });
                    counter.updated += 1;
                }
            }
            return { success: true, data: counter };
        } catch (e) {
            console.error("[GPU:reconcile] failed:", e);
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },
};
