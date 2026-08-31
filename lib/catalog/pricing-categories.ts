// Catalog-backed categories for the /pricing page.
//
// /pricing had its own answer for compute and GPU: a FALLBACK_PRICING_DATA
// constant in the page (compute "Balanced" at $79/mo for 8 vCPU / 32GB), plus
// an explicit branch that replaced whatever the database returned for GPU with
// that same static block. So the site carried three compute prices — the
// wizard's, the services page's, and this one — and three GPU prices.
//
// These build the page's own ServiceCategory shape from the shared catalog, so
// /pricing quotes what the customer will actually be charged.

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicComputeCatalog } from "@/lib/catalog/compute";
import { HOURS_PER_MONTH } from "@/lib/pricing/linode-catalog";
import { getPublicGpuCatalog } from "@/lib/catalog/gpu";
import { GPU_EDITORIAL } from "@/lib/catalog/gpu-editorial";
import type { ServiceCategory, PricingTier } from "@/lib/supabase/queries/pricing";

/** Plan names, cheapest first — the page expects a human label per tier. */
const PLAN_NAMES = ["Starter", "Basic", "Growth", "Scale", "Power", "Max"];

/**
 * Compute, priced from linode_types x linode_pricing via the same resolver the
 * deploy wizard uses. Returns null when the catalog cannot be read, so the
 * caller omits the category rather than showing a stale number.
 */
export async function buildComputePricingCategory(
  supabase: SupabaseClient
): Promise<ServiceCategory | null> {
  const catalog = await getPublicComputeCatalog(supabase);
  if (catalog.tiers.length === 0) return null;

  // Three per tier. Four tiers x six was up to 24 cards in one category — a
  // very different page from the five the layout was built for. The wizard
  // lists every plan.
  const PER_TIER = 3;
  const tiers: PricingTier[] = catalog.tiers.flatMap((tier) =>
    tier.plans.slice(0, PER_TIER).map((plan, i) => ({
      id: plan.id,
      name: `${tier.label} · ${PLAN_NAMES[i] ?? `Plan ${i + 1}`}`,
      shortDescription: tier.blurb,
      subType: tier.key,
      price: {
        monthly: plan.monthlyUSD,
        // No yearly contract exists for compute — it bills hourly. Quoting
        // twelve months is the honest annual figure rather than a discount we
        // do not offer.
        yearly: Math.round(plan.monthlyUSD * 12 * 100) / 100,
      },
      billingPeriod: "per month, billed by the second",
      specs: [
        `${plan.vcpus} vCPU`,
        `${plan.memoryGB} GB RAM`,
        `${plan.diskGB} GB NVMe`,
        `${plan.transferTB} TB transfer`,
      ],
      features: tier.features,
      ctaText: "Deploy",
      ctaLink: "/dashboard/services/compute/vps/deploy",
    }))
  );

  // The page sorts by isFeatured and renders that card larger with a ribbon.
  // Every block this replaced had exactly one; with none set the grid goes
  // flat. Feature the cheapest dedicated plan — the usual "right default for
  // production" recommendation.
  const featured =
    tiers.find((t) => t.subType === "dedicated") ?? tiers[0];
  if (featured) featured.isFeatured = true;

  return {
    id: "compute",
    label: "Compute",
    description:
      "General-purpose instances for web apps, APIs, workers, and backend services.",
    // Cheapest across every tier. tiers[0] is merely the first that survived
    // filtering, so if shared ever has no sellable plan it would quote a
    // dedicated price as the entry point.
    startingPriceLabel: (() => {
      const lows = catalog.tiers
        .map((t) => t.fromMonthlyUSD)
        .filter((v): v is number => v !== null);
      return lows.length > 0 ? `From $${Math.min(...lows).toFixed(2)}/mo` : undefined;
    })(),
    tiers,
  };
}

/**
 * GPU, priced from the live inventory snapshot via computeResalePerHour — the
 * same function that sets what a pod is billed.
 *
 * GPUs with no current price reading are omitted: a GPU card with no number is
 * less use than no card, and inventing one is what this replaced.
 */
export async function buildGpuPricingCategory(
  supabase: SupabaseClient
): Promise<ServiceCategory | null> {
  const catalog = await getPublicGpuCatalog(supabase);

  const priced = catalog.gpus.filter(
    (g) => g.hourlyUSD !== null && GPU_EDITORIAL[g.id] !== undefined
  );
  if (priced.length === 0) return null;

  const tiers: PricingTier[] = priced.map((g) => {
    const hourly = g.hourlyUSD as number;
    const editorial = GPU_EDITORIAL[g.id];
    return {
      id: g.id,
      name: g.name,
      shortDescription: `${editorial.arch} · ${g.memoryGB} GB ${editorial.memoryType}`,
      subType: "gpu",
      price: {
        // GPUs bill per second; the monthly figure is what a full month of
        // uptime costs, not a subscription.
        monthly: Math.round(hourly * HOURS_PER_MONTH * 100) / 100,
        yearly: Math.round(hourly * HOURS_PER_MONTH * 12 * 100) / 100,
      },
      billingPeriod: `$${hourly.toFixed(2)} per GPU-hour, billed by the second`,
      // bandwidth and perfFp8 are optional in GPU_EDITORIAL — a SKU whose
      // figure has not been verified against a vendor sheet omits the spec
      // rather than printing "undefined bandwidth".
      specs: [
        `${g.memoryGB} GB ${editorial.memoryType}`,
        editorial.perfFp8,
        editorial.bandwidth ? `${editorial.bandwidth} bandwidth` : null,
        // Stock is only asserted when the reading is fresh; see lib/catalog/gpu.
        g.stock === "available"
          ? "In stock"
          : g.stock === "limited"
            ? "Limited stock"
            : g.stock === "unavailable"
              ? "Out of stock"
              : "Check availability",
      ].filter((spec): spec is string => Boolean(spec)),
      features: [
        "NVLink-capable nodes",
        "NVMe-backed local storage",
        "Per-second billing",
        "Deploy in under 90 seconds",
      ],
      ctaText: "Deploy",
      ctaLink: `/dashboard/services/gpu/deploy?gpu=${encodeURIComponent(g.id)}`,
    };
  });

  const featuredGpu =
    tiers.find((t) => GPU_EDITORIAL[t.id ?? ""]?.featured) ?? tiers[0];
  if (featuredGpu) featuredGpu.isFeatured = true;

  return {
    id: "gpu-instance",
    label: "GPU Instances",
    description:
      "On-demand NVIDIA and AMD capacity for training, fine-tuning, and inference.",
    startingPriceLabel: `From $${Math.min(...priced.map((g) => g.hourlyUSD as number)).toFixed(2)}/GPU-hr`,
    tiers,
  };
}
