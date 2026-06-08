import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import { v1ExtractGpuId, v1GpuServiceError } from "@/lib/api/v1-gpu-helpers";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { RunPodService } from "@/lib/services/runpod-service";
import { gpuPowerActionSchema } from "@/lib/validation/gpu";

export const POST = withV1Auth("gpu:pods:power", async (req, auth, context) => {
  const { id, error } = await v1ExtractGpuId(context, "pod");
  if (error) return error;

  const parsed = gpuPowerActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return v1TransformValidationError(parsed.error);

  const result = await RunPodService.powerPod({
    podId: id,
    ownerId: auth.userId,
    action: parsed.data.action,
  });
  if (!result.success || !result.data) {
    return v1GpuServiceError(result, "UPDATE_FAILED", "Failed to update GPU pod power");
  }
  return v1Ok({
    data: {
      id,
      action: parsed.data.action,
      status: result.data.status,
    },
  });
});
