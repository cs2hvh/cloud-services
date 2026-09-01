// Pod read + reconcile operations.
// - list/get serve the dashboard
// - reconcileActivePods is called by the cron worker to keep DB status in sync
//   with RunPod (catches spot interruptions, manual deletions, etc.)

import { closeActiveBilling } from "@/config/billing-flow";
import { GENERIC_SERVICE_ERROR } from "@/lib/inference/error-messages";
import { BillingCredits } from "@/lib/billing/credits";
import { limitByUser } from "@/lib/cooldown/userbased";
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

// SSH is password/key auth as `root` against the pod's public IP + the public
// port that maps to container port 22. Null until RunPod assigns a public IP.
function deriveSshCommand(pod: RunPodPodResource): string | null {
    const sshPort = pod.portMappings?.["22"];
    if (pod.publicIp && sshPort) return `ssh root@${pod.publicIp} -p ${sshPort}`;
    return null;
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
            console.error("[GPU:podRead] failed:", e);
            return {
                success: false,
                error: GENERIC_SERVICE_ERROR,
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
            console.error("[GPU:podRead] failed:", e);
            return {
                success: false,
                error: GENERIC_SERVICE_ERROR,
                errorCode: "SERVER",
            };
        }
    },

    /**
     * Self-healing single-pod sync. The detail page calls this on load. If the
     * pod is still provisioning, or running without complete connection info
     * (public IP + SSH command), we fetch the live RunPod resource ONCE and
     * persist status + connection fields — so SSH details appear within seconds
     * of the pod booting, independent of the background reconcile cron. Upstream
     * calls are cooled down per-pod so rapid re-fetches don't hammer RunPod, and
     * once the info is captured it stops calling upstream entirely.
     */
    async syncUserPod(
        podId: number,
        ownerId: string
    ): Promise<ServiceResult<GpuPodDetail>> {
        const base = await this.getUserPod(podId, ownerId);
        if (!base.success || !base.data) return base;
        const pod = base.data;

        // No upstream once the pod is gone or already fully wired up.
        const terminal: string[] = ["terminated", "stopped", "interrupted", "failed"];
        if (!pod.runpodPodId || terminal.includes(pod.status)) return base;
        if (pod.status === "running" && pod.publicIp && pod.sshCommand) return base;

        // Bound upstream calls — the detail page can re-fetch quickly.
        const cd = await limitByUser(`pod-${podId}`, {
            prefix: "rl:gpu-podsync",
            limit: 1,
            windowMs: 8_000,
        });
        if (!cd.allowed) return base;

        let upstream: RunPodPodResource | null = null;
        try {
            upstream = await RunPodClient.rest<RunPodPodResource>(
                "GET",
                `/pods/${pod.runpodPodId}`
            );
        } catch {
            // Disappearance / transient errors are left to the reconcile sweep.
            return base;
        }
        if (!upstream) return base;

        const newStatus = podStatusFromRunPod(upstream);
        const patch: Record<string, unknown> = {};
        if (newStatus !== pod.status) patch.status = newStatus;

        const upIp = upstream.publicIp || null;
        if (upIp && upIp !== pod.publicIp) patch.public_ip = upIp;

        const upPorts = upstream.portMappings || null;
        if (
            upPorts &&
            Object.keys(upPorts).length > 0 &&
            JSON.stringify(upPorts) !== JSON.stringify(pod.portMappings)
        ) {
            patch.port_mappings = upPorts;
        }

        const upSsh = deriveSshCommand(upstream);
        if (upSsh && upSsh !== pod.sshCommand) patch.ssh_command = upSsh;

        if (
            Array.isArray(upstream.ports) &&
            upstream.ports.length > 0 &&
            JSON.stringify(upstream.ports) !== JSON.stringify(pod.ports)
        ) {
            patch.ports = upstream.ports;
        }

        if (Object.keys(patch).length === 0) return base;

        const supabase = await createServiceClient();
        await supabase.from("gpu_pods").update(patch).eq("id", podId);

        // Return fresh data so the caller sees it without a second round-trip.
        return {
            success: true,
            data: {
                ...pod,
                status: (patch.status as PodStatus) ?? pod.status,
                publicIp: (patch.public_ip as string) ?? pod.publicIp,
                portMappings:
                    (patch.port_mappings as Record<string, number>) ??
                    pod.portMappings,
                sshCommand: (patch.ssh_command as string) ?? pod.sshCommand,
                ports: (patch.ports as string[]) ?? pod.ports,
            },
        };
    },

    /**
     * Walk every pod whose DB status implies "should be present on RunPod"
     * and reconcile against the upstream resource. Detects:
     *   - status drift (provisioning → running, running → stopped, etc.)
     *   - spot interruptions (404 from RunPod after a running pod)
     *   - manually-deleted pods (also 404)
     *
     * Side-effects:
     *   - updates gpu_pods.status + connection info (public_ip, port_mappings,
     *     ssh_command, ports) — refreshed every pass so SSH details land once
     *     RunPod assigns the public IP (which lags the RUNNING transition)
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
                    "id, owner_id, runpod_pod_id, status, interruptible, name, billing_service_id, public_ip, port_mappings, ssh_command, ports"
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
                billing_service_id: string;
                public_ip: string | null;
                port_mappings: Record<string, number> | null;
                ssh_command: string | null;
                ports: string[] | null;
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
                                serviceId: r.billing_service_id,
                                serviceType: "gpu_pod",
                                closeActive: () =>
                                    BillingCredits.closeActiveGpuPod({
                                        serviceId: r.billing_service_id,
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

                // Build an incremental patch. Connection details (public IP, port
                // mappings, SSH command, ports) are refreshed on EVERY pass while
                // the pod is alive — RunPod assigns them a little AFTER it first
                // reports RUNNING, so capturing them only on the status transition
                // misses them permanently (the pod then sits 'running' forever with
                // null connection info). We never blank a known-good value if the
                // upstream momentarily returns nothing.
                const patch: Record<string, unknown> = {};
                if (newStatus !== r.status) patch.status = newStatus;

                const upIp = upstream.publicIp || null;
                if (upIp && upIp !== r.public_ip) patch.public_ip = upIp;

                const upPorts = upstream.portMappings || null;
                if (
                    upPorts &&
                    Object.keys(upPorts).length > 0 &&
                    JSON.stringify(upPorts) !== JSON.stringify(r.port_mappings)
                ) {
                    patch.port_mappings = upPorts;
                }

                const upSsh = deriveSshCommand(upstream);
                if (upSsh && upSsh !== r.ssh_command) patch.ssh_command = upSsh;

                if (
                    Array.isArray(upstream.ports) &&
                    upstream.ports.length > 0 &&
                    JSON.stringify(upstream.ports) !== JSON.stringify(r.ports)
                ) {
                    patch.ports = upstream.ports;
                }

                if (Object.keys(patch).length === 0) continue;

                await supabase.from("gpu_pods").update(patch).eq("id", r.id);
                if (patch.status) {
                    await supabase.from("gpu_pod_events").insert({
                        pod_id: r.id,
                        event_type: "status_change",
                        message: `Status: ${r.status} → ${newStatus}`,
                    });
                }
                counter.updated += 1;
            }
            return { success: true, data: counter };
        } catch (e) {
            console.error("[GPU:reconcile] failed:", e);
            return {
                success: false,
                error: GENERIC_SERVICE_ERROR,
                errorCode: "SERVER",
            };
        }
    },
};
