// Canonical compute catalog — the one place plan specs, tiers and prices are
// derived, for BOTH the marketing pages and the dashboard.
//
// Why this exists: the marketing pricing page carried a hand-written table of
// plans and prices while the dashboard computed them from linode_types ×
// linode_pricing. Every shared-tier plan disagreed — $6 vs $5.40, $12 vs
// $12.96, $24 vs $25.92, $48 vs $51.84 — and the page advertised two tiers
// ("Compute Optimized", "Storage Optimized") that are not Linode classes at
// all, so nothing behind them could ever be bought.
//
// The rule here is that a price shown to a customer is the price they will be
// charged, because both come from resolveLinodePlanPrice(). To move a price,
// change linode_pricing.markup_pct or floor_per_hour_usd — not a number in a
// component.

import type { SupabaseClient } from "@supabase/supabase-js";

import { COMPUTE_TIERS } from "@/lib/catalog/compute-tiers";
import {
  getLinodeCatalog,
  resolveLinodePlanPrice,
  type LinodeCatalogPlan,
} from "@/lib/pricing/linode-catalog";


export interface PublicComputePlan {
  id: string;
  label: string;
  vcpus: number;
  memoryGB: number;
  diskGB: number;
  transferTB: number;
  /** What the customer pays — the same figure the deploy wizard quotes. */
  monthlyUSD: number;
  hourlyUSD: number;
}

export interface PublicComputeTier {
  key: string;
  label: string;
  blurb: string;
  features: string[];
  /** Cheapest plan in the tier; null when the tier has no sellable plan. */
  fromMonthlyUSD: number | null;
  plans: PublicComputePlan[];
}

export interface PublicComputeCatalog {
  tiers: PublicComputeTier[];
  regionCount: number;
  /** Region the quoted prices are for — the cheapest, so "from $X" is true. */
  priceRegionId: string | null;
}

/**
 * Prices vary by region. Marketing quotes a "from" price, so use the cheapest
 * region a plan is actually offered in — anything higher would advertise a
 * price no customer can get, and anything lower would under-quote.
 */
function cheapestMonthly(
  plan: LinodeCatalogPlan,
  regionIds: string[]
): { monthlyUSD: number; hourlyUSD: number; regionId: string | null } {
  let best: { monthlyUSD: number; hourlyUSD: number; regionId: string | null } = {
    monthlyUSD: Number.POSITIVE_INFINITY,
    hourlyUSD: Number.POSITIVE_INFINITY,
    regionId: null,
  };
  // No regions is not an error — fall back to the plan's list price so the page
  // still renders something true rather than an empty tier.
  const candidates = regionIds.length > 0 ? regionIds : [""];
  for (const regionId of candidates) {
    const p = resolveLinodePlanPrice(plan, regionId);
    if (p.monthlyUSD < best.monthlyUSD) {
      best = { monthlyUSD: p.monthlyUSD, hourlyUSD: p.hourlyUSD, regionId: regionId || null };
    }
  }
  return best;
}

/**
 * Build the public view of the compute catalog.
 *
 * Reads the same tables and runs the same price resolver as the deploy wizard,
 * so a number on the marketing page is a number the customer will be charged.
 */
export async function getPublicComputeCatalog(
  supabase: SupabaseClient
): Promise<PublicComputeCatalog> {
  const catalog = await getLinodeCatalog(supabase);
  const regionIds = catalog.regions.map((r) => r.id);

  let priceRegionId: string | null = null;
  const tiers: PublicComputeTier[] = COMPUTE_TIERS.map((tier) => {
    const plans = catalog.plans
      .filter((p) => tier.classes.includes(p.class))
      .map((p) => {
        const price = cheapestMonthly(p, regionIds);
        if (priceRegionId === null) priceRegionId = price.regionId;
        return {
          id: p.id,
          label: p.label,
          vcpus: p.vcpus,
          memoryGB: Math.round(p.memoryMB / 1024),
          diskGB: p.diskGB,
          transferTB: Math.round((p.transferGB / 1024) * 10) / 10,
          monthlyUSD: price.monthlyUSD,
          hourlyUSD: price.hourlyUSD,
        };
      })
      .sort((a, b) => a.monthlyUSD - b.monthlyUSD || a.vcpus - b.vcpus);

    return {
      key: tier.key,
      label: tier.label,
      blurb: tier.blurb,
      features: [...tier.features],
      fromMonthlyUSD: plans.length > 0 ? plans[0].monthlyUSD : null,
      plans,
    };
  })
    // A tier with nothing sellable must not be advertised — that is how
    // "Compute Optimized" and "Storage Optimized" ended up on the page with
    // no product behind them.
    .filter((t) => t.plans.length > 0);

  return { tiers, regionCount: catalog.regions.length, priceRegionId };
}
