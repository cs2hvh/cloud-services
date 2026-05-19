// Shared types used across the GPU dashboard client components.
// These mirror the API response shapes returned by /api/services/gpu/*.

export type CloudType = "SECURE" | "COMMUNITY";

export type StockStatus = "high" | "medium" | "low" | "none";

export type PodStatus =
    | "provisioning"
    | "running"
    | "stopped"
    | "restarting"
    | "terminated"
    | "failed"
    | "interrupted";

export interface InventoryRowClient {
    gpuCatalogId: string;
    runpodGpuId: string;
    displayName: string;
    memoryGb: number;
    cloudType: CloudType;
    stockStatus: StockStatus;
    availableCounts: number[];
    onDemandPerHr: number | null;
    spotPerHr: number | null;
    observedAt: string;
}

export interface GpuPodSummaryClient {
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
