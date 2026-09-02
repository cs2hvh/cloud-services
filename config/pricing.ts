// Service rates — resolved from the price book the admin panel writes.
//
// WHAT CHANGED, AND WHY IT MATTERS
//
// Every function here used to read public.products, which was dropped on
// 2026-08-31 when pricing moved to billing.service_pricing. Nothing broke
// loudly: `products` returning nothing became `ratesFromProduct(null)` became
// { initialCost: 0, hourlyRate: 0 }. A service whose price could not be found
// was quoted, and billed, as FREE.
//
// That is the same defect this whole billing rebuild exists to remove — an
// empty result read as a good result — and it sat directly on the provisioning
// path. So the new implementation THROWS when a price is missing. A deploy that
// cannot be priced must fail, not succeed at zero.
//
// The exported signatures are unchanged, so all sixteen callers are untouched.
// Only the source of the numbers moved.

import {
  findPrice,
  getRates,
  getRatesForService,
  HOURS_IN_MONTH,
} from "@/lib/pricing/price-book";

type Rates = { initialCost: number; hourlyRate: number };

export { HOURS_IN_MONTH };

// ── Compute-adjacent services ─────────────────────────────────────────────

export async function getRatesForDatabase(planId: string): Promise<Rates> {
  return getRates("database", planId);
}

export async function getRatesForDatabaseBySlug(sizeSlug: string): Promise<Rates> {
  return getRates("database", sizeSlug);
}

/**
 * A cluster is priced per node.
 *
 * `totalNodes` multiplies the recurring rate only. The setup fee is charged
 * once for the cluster, not once per node — which is how it behaved when the
 * multiplier was applied to `price` and not to `fixed_price`.
 */
export async function getRatesForKubernetes(plan_id: string, totalNodes = 1): Promise<Rates> {
  return getRates("kubernetes", plan_id, { units: totalNodes });
}

export const getRatesForKubernetesExisting = getRatesForKubernetes;

export async function getRatesForObjectStorage(): Promise<Rates> {
  return getRates("objectspace");
}

export async function getRatesForSpectrum(): Promise<Rates> {
  return getRates("spectrum");
}

export async function getRatesForPlatformApp(
  size: "small" | "medium" | "large" | "xlarge" | "xxlarge",
): Promise<Rates> {
  return getRates("platform_apps", size);
}

export async function getRatesForInferenceVector(): Promise<Rates> {
  return getRates("inference_vector");
}

/**
 * $/GB/month for custom OS image storage.
 *
 * Callers multiply by the image size themselves, because the GB count is only
 * known at provision time. Returned in the book's own unit rather than
 * converted, so the caller's arithmetic is unchanged.
 */
export async function getRatePerGbForCustomImage(): Promise<number> {
  // Read the row rather than going through getRates: custom_image is priced
  // per_gb_hour, and an hourly figure is meaningless until the GB count is
  // known. The caller supplies that.
  const row = await findPrice("custom_image");
  if (!row) {
    throw new Error(
      "No live price for custom_image. Set one in the admin panel before creating images.",
    );
  }
  // Stored either way; callers expect per GB per month.
  return row.unit === "usd_per_gb_hour" ? row.amount * HOURS_IN_MONTH : row.amount;
}

/**
 * Every platform-app size, for the size picker.
 *
 * `price` is the monthly figure the UI shows. A size with no live price is
 * OMITTED rather than defaulted to zero — a picker showing "$0/mo" for a size
 * nobody priced is how a customer ends up deploying something free.
 */
export async function getAllPlatformAppRates(): Promise<Record<string, Rates & { price: number }>> {
  const byPlan = await getRatesForService("platform_apps");
  const rates: Record<string, Rates & { price: number }> = {};

  for (const size of ["small", "medium", "large", "xlarge", "xxlarge"]) {
    const r = byPlan[size];
    if (!r) continue;
    rates[size] = {
      initialCost: r.initialCost,
      hourlyRate: r.hourlyRate,
      price: r.monthly,
    };
  }

  return rates;
}
