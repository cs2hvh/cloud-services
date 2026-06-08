import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import {
  serializeGpuPodDetailForV1,
  v1ExtractGpuId,
  v1GpuServiceError,
} from "@/lib/api/v1-gpu-helpers";
import { RunPodService } from "@/lib/services/runpod-service";

export const GET = withV1Auth("gpu:pods:get", async (_req, auth, context) => {
  const { id, error } = await v1ExtractGpuId(context, "pod");
  if (error) return error;

  const result = await RunPodService.syncUserPod(id, auth.userId);
  if (!result.success || !result.data) {
    return v1GpuServiceError(result, "INTERNAL_ERROR", "Failed to fetch GPU pod");
  }
  return v1Ok({
    data: serializeGpuPodDetailForV1(result.data),
  });
});

export const DELETE = withV1Auth("gpu:pods:delete", async (_req, auth, context) => {
  const { id, error } = await v1ExtractGpuId(context, "pod");
  if (error) return error;

  const result = await RunPodService.destroyPod({ podId: id, ownerId: auth.userId });
  if (!result.success || !result.data) {
    return v1GpuServiceError(result, "DELETE_FAILED", "Failed to terminate GPU pod");
  }
  return v1Ok({
    data: {
      id: result.data.podId,
      deleted: true,
      final_charge_usd: result.data.finalCharge,
    },
  });
});
