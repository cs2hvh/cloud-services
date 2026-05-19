// RunPod service typed interfaces.
// REST endpoint shapes mirror https://rest.runpod.io/v1 docs as of 2026-05.
// GraphQL types track the gpuTypes / lowestPrice schema used for inventory.

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

// ─── RunPod GraphQL — inventory ─────────────────────────────────────────────

export interface RunPodLowestPriceInput {
    gpuCount: number;
    secureCloud: boolean;
}

export interface RunPodGpuTypeLowestPrice {
    stockStatus: "High" | "Medium" | "Low" | null;
    availableGpuCounts: number[] | null;
    uninterruptablePrice: number | null;
    minimumBidPrice: number | null;
}

export interface RunPodGpuType {
    id: string;
    displayName: string;
    memoryInGb: number;
    secureCloud: boolean;
    communityCloud: boolean;
    lowestPrice: RunPodGpuTypeLowestPrice | null;
}

// ─── RunPod REST — pod resource ─────────────────────────────────────────────

export interface RunPodPodGpu {
    id?: string;
    count: number;
    displayName: string;
}

export interface RunPodPodMachine {
    gpuTypeId?: string;
    dataCenterId?: string;
    location?: string;
    cpuCount?: number;
    supportPublicIp?: boolean;
    secureCloud?: boolean;
}

export interface RunPodPodResource {
    id: string;
    name: string;
    image: string;
    desiredStatus: "RUNNING" | "STOPPED" | "TERMINATED" | string;
    computeType: "GPU" | "CPU";
    cloudType: CloudType;
    costPerHr: number;
    adjustedCostPerHr?: number;
    interruptible: boolean;
    locked: boolean;
    gpu?: RunPodPodGpu;
    vcpuCount?: number;
    memoryInGb?: number;
    containerDiskInGb?: number;
    volumeInGb?: number;
    volumeMountPath?: string;
    ports?: string[];
    portMappings?: Record<string, number>;
    publicIp?: string;
    machineId?: string;
    machine?: RunPodPodMachine;
    lastStartedAt?: string;
    lastStatusChange?: string;
    consumerUserId?: string;
    env?: Record<string, string>;
}

export interface RunPodCreatePodRequest {
    name: string;
    imageName: string;
    computeType?: "GPU" | "CPU";
    cloudType?: CloudType;
    interruptible?: boolean;
    gpuTypeIds?: string[];
    gpuTypePriority?: "availability" | "custom";
    gpuCount?: number;
    allowedCudaVersions?: string[];
    minVCPUPerGPU?: number;
    minRAMPerGPU?: number;
    containerDiskInGb?: number;
    volumeInGb?: number;
    volumeMountPath?: string;
    networkVolumeId?: string;
    containerRegistryAuthId?: string;
    ports?: string[];
    env?: Record<string, string>;
    dockerEntrypoint?: string[];
    dockerStartCmd?: string[];
    dataCenterIds?: string[];
    dataCenterPriority?: "availability" | "custom";
    countryCodes?: string[];
    globalNetworking?: boolean;
    supportPublicIp?: boolean;
    templateId?: string;
    locked?: boolean;
}

// ─── Service envelope (matches database/kubernetes services) ────────────────

export type RunPodErrorCode =
    | "AUTH"
    | "RATE_LIMIT"
    | "NOT_FOUND"
    | "CAPACITY"
    | "INVALID"
    | "SERVER"
    | "TIMEOUT"
    | "UNKNOWN";

export interface RunPodError {
    code: RunPodErrorCode;
    status?: number;
    message: string;
    retryable: boolean;
    raw?: unknown;
}

export interface ServiceResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    errorCode?: RunPodErrorCode;
}

// ─── Inventory operation outputs ────────────────────────────────────────────

export interface InventoryRow {
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

// ─── Network volumes ────────────────────────────────────────────────────────

export type VolumeStatus =
    | "creating"
    | "available"
    | "attached"
    | "error"
    | "deleted";

export interface RunPodNetworkVolume {
    id: string;
    name: string;
    size: number;
    dataCenterId: string;
}

export interface CreateNetworkVolumeRequest {
    ownerId: string;
    ownerEmail?: string | null;
    name: string;
    sizeGb: number;
    dataCenterId: string;
}

export interface NetworkVolumeSummary {
    id: number;
    runpodVolumeId: string | null;
    name: string;
    sizeGb: number;
    dataCenterId: string;
    status: VolumeStatus;
    monthlyCostUsd: number;
    createdAt: string;
}

export interface SyncInventoryResult {
    scanned: number;
    written: number;
    skipped: number;
    errors: number;
}
