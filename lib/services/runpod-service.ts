/**
 * RunPod Service — Centralized Business Logic
 *
 * Public composer for GPU pod operations backed by RunPod. Mirrors the
 * lib/services/database-service.ts / kubernetes-service.ts pattern so existing
 * API routes and the billing flow can consume it uniformly.
 */

import { inventoryOperations } from "./runpod/operations/inventory-operations";
import { podLifecycleOperations } from "./runpod/operations/pod-lifecycle-operations";
import { podReadOperations } from "./runpod/operations/pod-read-operations";
import { templateOperations } from "./runpod/operations/template-operations";
import { volumeOperations } from "./runpod/operations/volume-operations";

export const RunPodService = {
    ...inventoryOperations,
    ...podLifecycleOperations,
    ...podReadOperations,
    ...templateOperations,
    ...volumeOperations,
};

export type {
    CreatePodRequest,
    CreatePodResult,
    DestroyPodRequest,
    PowerPodRequest,
} from "./runpod/operations/pod-lifecycle-operations";

export type {
    GpuPodDetail,
    GpuPodSummary,
    ReconcileResult,
} from "./runpod/operations/pod-read-operations";

export type {
    CloudType,
    CreateNetworkVolumeRequest,
    GpuTemplate,
    TemplateCategory,
    InventoryRow,
    NetworkVolumeSummary,
    PodStatus,
    RunPodCreatePodRequest,
    RunPodError,
    RunPodErrorCode,
    RunPodNetworkVolume,
    RunPodPodResource,
    ServiceResult,
    StockStatus,
    SyncInventoryResult,
    VolumeStatus,
} from "./runpod/types";
