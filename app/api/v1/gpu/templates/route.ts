import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { serializeGpuTemplateForV1 } from "@/lib/api/v1-gpu-helpers";
import { RunPodService } from "@/lib/services/runpod-service";

export const GET = withV1Auth("gpu:templates:list", async () => {
  const result = await RunPodService.listTemplates();
  if (!result.success) {
    return v1Error("INTERNAL_ERROR", 500, result.error || "Failed to load GPU templates");
  }

  const templates = (result.data ?? []).map(serializeGpuTemplateForV1);
  return v1Ok({ data: templates, meta: { total: templates.length } });
});
