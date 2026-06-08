import { NextResponse } from "next/server";

import type {
  GpuPodDetail,
  GpuPodSummary,
  GpuTemplate,
  InventoryRow,
  NetworkVolumeSummary,
  RunPodErrorCode,
  ServiceResult,
} from "@/lib/services/runpod-service";
import { v1Error } from "@/lib/api/v1-middleware";
import type { RouteContext } from "@/lib/api/v1-helpers";

export async function v1ExtractGpuId(
  context: RouteContext | undefined,
  resource: "pod" | "volume"
): Promise<{ id: number; error: null } | { id: null; error: NextResponse }> {
  if (!context?.params) {
    return { id: null, error: v1Error("INTERNAL_ERROR", 500, "Missing route context") };
  }

  const params = await context.params;
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = Number(raw);
  if (!raw || !Number.isSafeInteger(id) || id < 1) {
    return {
      id: null,
      error: v1Error("INVALID_ID", 400, `Invalid ${resource} ID format`, {
        field: "id",
      }),
    };
  }

  return { id, error: null };
}

export function v1GpuServiceError(
  failure: Pick<ServiceResult<unknown>, "error" | "errorCode">,
  fallbackCode: string,
  fallbackMessage: string
): NextResponse {
  const message = failure.error || fallbackMessage;
  const code: RunPodErrorCode | undefined = failure.errorCode;

  if (message.toLowerCase().includes("insufficient credits")) {
    return v1Error("INSUFFICIENT_BALANCE", 402, message);
  }

  switch (code) {
    case "AUTH":
      return v1Error("FORBIDDEN", 403, message);
    case "NOT_FOUND":
      return v1Error("NOT_FOUND", 404, message);
    case "CAPACITY":
      return v1Error("CAPACITY_UNAVAILABLE", 409, message);
    case "INVALID":
      return v1Error("VALIDATION_ERROR", 400, message);
    case "RATE_LIMIT":
      return v1Error("RATE_LIMIT_EXCEEDED", 429, message);
    case "TIMEOUT":
      return v1Error("GATEWAY_TIMEOUT", 504, message);
    case "SERVER":
    case "UNKNOWN":
    default:
      return v1Error(fallbackCode, 500, message);
  }
}

export function serializeGpuInventoryForV1(
  row: InventoryRow & {
    resaleOnDemandPerHr: number | null;
    resaleSpotPerHr: number | null;
  }
) {
  return {
    gpu_catalog_id: row.gpuCatalogId,
    display_name: row.displayName,
    memory_gb: row.memoryGb,
    cloud_type: row.cloudType,
    stock_status: row.stockStatus,
    available_counts: row.availableCounts.filter((count) => count >= 1 && count <= 8),
    on_demand_price_per_gpu_hour: row.resaleOnDemandPerHr,
    spot_price_per_gpu_hour: row.resaleSpotPerHr,
    observed_at: row.observedAt,
  };
}

export function serializeGpuTemplateForV1(template: GpuTemplate) {
  return {
    id: template.id,
    name: template.name,
    image_name: template.imageName,
    description: template.description,
    category: template.category,
    ports: template.ports,
    default_container_disk_gb: template.defaultContainerDiskGb,
    env_hints: template.envHints,
    sort_order: template.sortOrder,
  };
}

export function serializeGpuPodSummaryForV1(pod: GpuPodSummary) {
  return {
    id: pod.id,
    name: pod.name,
    status: pod.status,
    gpu_catalog_id: pod.gpuCatalogId,
    gpu_count: pod.gpuCount,
    cloud_type: pod.cloudType,
    interruptible: pod.interruptible,
    public_ip: pod.publicIp,
    port_mappings: pod.portMappings,
    hourly_cost_usd: pod.hourlyCostUsd,
    created_at: pod.createdAt,
  };
}

export function serializeGpuVolumeForV1(volume: NetworkVolumeSummary) {
  return {
    id: volume.id,
    name: volume.name,
    size_gb: volume.sizeGb,
    data_center_id: volume.dataCenterId,
    status: volume.status,
    monthly_cost_usd: volume.monthlyCostUsd,
    created_at: volume.createdAt,
  };
}

export function serializeGpuPodDetailForV1(pod: GpuPodDetail) {
  return {
    ...serializeGpuPodSummaryForV1(pod),
    image_name: pod.imageName,
    template_id: pod.templateId,
    container_disk_gb: pod.containerDiskGb,
    volume_gb: pod.volumeGb,
    ports: pod.ports,
    env_keys: pod.envKeys,
    ssh_command: pod.sshCommand,
    billing_start: pod.billingStart,
    billing_end: pod.billingEnd,
  };
}
