// GET /api/v1/compute/images — list OS images available for compute instances
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { createWorkerClient } from "@/lib/supabase/server";
import { getLinodeCatalog } from "@/lib/pricing/linode-catalog";

export const GET = withV1Auth("compute:images:list", async () => {
  try {
    const supabase = await createWorkerClient();
    const catalog = await getLinodeCatalog(supabase);

    const images = catalog.images.map((i) => ({
      id: i.id,
      label: i.label,
      vendor: i.vendor,
      size_mb: i.sizeMB,
      deprecated: i.deprecated,
    }));

    return v1Ok({
      data: images,
      meta: {
        total: images.length,
      },
    });
  } catch (e) {
    console.error("[v1/compute:images] failed:", e instanceof Error ? e.message : e);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch compute images");
  }
});
