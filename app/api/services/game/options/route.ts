import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getGameCatalog, getActiveGamePlans } from "@/lib/pricing/game-plan-catalog";
import { listRegionHeadrooms } from "@/lib/services/game/host-selection";
import { getGameDeployEnabled } from "@/lib/admin/platform-settings";

export const dynamic = "force-dynamic";

// GET /api/services/game/options — catalog + plans + region availability for
// the deploy wizard. Region availability is computed against best-host
// headroom so the picker can grey out combinations that cannot fit.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const [catalog, plans, regions, deployEnabled] = await Promise.all([
    getGameCatalog(supabase),
    getActiveGamePlans(supabase),
    listRegionHeadrooms().catch(() => []),
    getGameDeployEnabled(),
  ]);

  const games = catalog
    .filter((g) => g.isActive)
    .map((g) => ({
      id: g.id,
      displayName: g.displayName,
      description: g.description ?? null,
      available: g.eggId > 0,
      requiresEula: g.requiresEula,
      credentialField: g.credentialField ?? null,
      envSchema: g.envSchema.filter((f) => f.customer_editable),
      minMemoryMB: g.minMemoryMB,
    }));

  const planAvailability: Record<string, Record<string, boolean>> = {};
  for (const region of regions) {
    planAvailability[region.region] = {};
    for (const plan of plans) {
      const gameOk = region.games === null || region.games.includes(plan.gameType);
      const regionOk = !plan.allowedRegions || plan.allowedRegions.length === 0 || plan.allowedRegions.includes(region.region);
      planAvailability[region.region][plan.slug] =
        gameOk &&
        regionOk &&
        region.maxFreeMemoryMB >= plan.memoryMB &&
        region.maxFreeDiskGB >= plan.diskGB &&
        region.maxFreeCpuPct >= plan.cpuPct;
    }
  }

  return NextResponse.json({
    ok: true,
    deployEnabled,
    games,
    plans: plans.map((p) => ({
      slug: p.slug,
      gameType: p.gameType,
      name: p.name,
      tagline: p.tagline ?? null,
      cpuPct: p.cpuPct,
      memoryMB: p.memoryMB,
      diskGB: p.diskGB,
      backups: p.backups,
      monthlyPrice: p.monthlyPrice,
    })),
    regions: regions.map((r) => ({
      region: r.region,
      displayRegion: r.displayRegion,
      hosts: r.hosts,
    })),
    planAvailability,
  });
}
