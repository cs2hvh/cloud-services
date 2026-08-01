// GET /api/v1/compute/types — list instance types with customer pricing
//
// Prices are the resale (customer) rates from resolveLinodePlanPrice —
// markup + floor applied to the base list price, with per-region overrides
// where the upstream catalog defines them. GPU/accelerated classes are
// excluded by the catalog module (sold via the GPU service instead).
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { createWorkerClient } from "@/lib/supabase/server";
import { getLinodeCatalog, resolveLinodePlanPrice } from "@/lib/pricing/linode-catalog";
import { formatPlanLabel } from "@/lib/pricing/plan-display";

export const GET = withV1Auth("compute:types:list", async () => {
  try {
    const supabase = await createWorkerClient();
    const catalog = await getLinodeCatalog(supabase);

    const types = catalog.plans
      .map((plan) => {
        const base = resolveLinodePlanPrice(plan, "");
        return {
          id: plan.id,
          // Upstream labels are the provider's product names ("Linode 2GB") —
          // same rewrite the dashboard applies, since this API is customer-facing.
          label: formatPlanLabel(plan.label),
          class: plan.class,
          vcpus: plan.vcpus,
          memory_mb: plan.memoryMB,
          disk_gb: plan.diskGB,
          transfer_gb: plan.transferGB,
          network_out_mbps: plan.networkOutMbps,
          pricing: {
            hourly: base.hourlyUSD,
            monthly: base.monthlyUSD,
            backups_hourly: base.backupsHourlyUSD,
            backups_monthly: base.backupsMonthlyUSD,
          },
          // Regions where the customer price differs from the base price.
          region_prices: plan.regionPrices.map((rp) => {
            const regional = resolveLinodePlanPrice(plan, rp.id);
            return {
              region: rp.id,
              hourly: regional.hourlyUSD,
              monthly: regional.monthlyUSD,
            };
          }),
        };
      })
      .sort((a, b) => a.vcpus - b.vcpus || a.memory_mb - b.memory_mb);

    return v1Ok({
      data: types,
      meta: {
        total: types.length,
      },
    });
  } catch (e) {
    console.error("[v1/compute:types] failed:", e instanceof Error ? e.message : e);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch compute types");
  }
});
