// GET /api/v1/compute/regions — list regions available for compute instances
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { createWorkerClient } from "@/lib/supabase/server";
import { getLinodeCatalog } from "@/lib/pricing/linode-catalog";

export const GET = withV1Auth("compute:regions:list", async () => {
  try {
    const supabase = await createWorkerClient();
    const catalog = await getLinodeCatalog(supabase);

    const regions = catalog.regions.map((r) => ({
      id: r.id,
      label: r.label,
      country: r.country,
      status: r.status,
    }));

    return v1Ok({
      data: regions,
      meta: {
        total: regions.length,
      },
    });
  } catch (e) {
    console.error("[v1/compute:regions] failed:", e instanceof Error ? e.message : e);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch compute regions");
  }
});
