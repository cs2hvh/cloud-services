import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import { v1ExtractGpuId, v1GpuServiceError } from "@/lib/api/v1-gpu-helpers";
import { RunPodService } from "@/lib/services/runpod-service";

export const DELETE = withV1Auth("gpu:volumes:delete", async (_req, auth, context) => {
  const { id, error } = await v1ExtractGpuId(context, "volume");
  if (error) return error;

  const result = await RunPodService.deleteVolume({ volumeId: id, ownerId: auth.userId });
  if (!result.success) {
    return v1GpuServiceError(result, "DELETE_FAILED", "Failed to delete network volume");
  }
  return v1Ok({ data: { id, deleted: true } });
});
