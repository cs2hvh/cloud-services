import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { serializeGpuInventoryForV1 } from "@/lib/api/v1-gpu-helpers";
import { RunPodService } from "@/lib/services/runpod-service";

export const GET = withV1Auth("gpu:inventory:list", async () => {
  const result = await RunPodService.listLatestForPublic();
  if (!result.success) {
    return v1Error("INTERNAL_ERROR", 500, result.error || "Failed to load GPU inventory");
  }

  const inventory = (result.data ?? [])
    .filter((row) => row.cloudType === "SECURE")
    .map(serializeGpuInventoryForV1);
  return v1Ok({ data: inventory, meta: { total: inventory.length } });
});
