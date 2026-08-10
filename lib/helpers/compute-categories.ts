import { getPublicComputeCatalog } from "@/lib/catalog/compute";
import { createServiceClient } from "@/lib/supabase/server";

interface VirtualPlan {
  vcpu: number;
  ram: string;
  storage: string;
  bandwidth: string;
  price: number;
}

interface BareMetalPlan {
  processor: string;
  cores: string;
  ram: string;
  storage: string;
  bandwidth: string;
  network: string;
  price: number;
}

export interface ComputeCategory {
  key: string;
  label: string;
  tagline: string;
  description: string;
  features: string[];
  isBareMetalCategory?: boolean;
  plans: (VirtualPlan | BareMetalPlan)[];
}

/**
 * The compute tiers and prices shown on the marketing pricing page.
 *
 * This used to query featured products by service type "kubernetes" — the
 * wrong table for a compute page — and then return null unconditionally, so
 * the page always fell through to a hand-written table in the component. That
 * table disagreed with the deploy wizard on every single plan ($6 vs $5.40,
 * $12 vs $12.96, $24 vs $25.92, $48 vs $51.84) and advertised two tiers,
 * "Compute Optimized" and "Storage Optimized", that are not Linode classes at
 * all — so nothing behind them could ever be bought.
 *
 * It now reads the same catalog and runs the same price resolver as the deploy
 * wizard, so the page and the checkout cannot disagree. To change a price,
 * change linode_pricing.markup_pct or floor_per_hour_usd.
 *
 * Note there is no icon field: this crosses a server -> client boundary, and
 * React cannot serialize a component function across it. The section renders
 * its own icons.
 *
 * Returns null when the catalog cannot be read. The caller must render a
 * "pricing unavailable" state rather than substituting numbers — stale prices
 * on a public page are what this whole change exists to stop.
 */
export async function getComputeCategories(): Promise<ComputeCategory[] | null> {
  try {
    const supabase = await createServiceClient();
    const catalog = await getPublicComputeCatalog(supabase);
    if (catalog.tiers.length === 0) return null;

    return catalog.tiers.map((tier) => ({
      key: tier.key,
      label: tier.label,
      tagline:
        tier.fromMonthlyUSD === null
          ? "Contact us"
          : `From $${tier.fromMonthlyUSD.toFixed(2).replace(/\.00$/, "")}/mo`,
      description: tier.blurb,
      features: tier.features,
      plans: tier.plans.map((p) => ({
        vcpu: p.vcpus,
        ram: `${p.memoryGB} GB`,
        storage: `${p.diskGB} GB`,
        bandwidth: `${p.transferTB} TB`,
        price: p.monthlyUSD,
      })),
    }));
  } catch (error) {
    console.error("[compute-categories] catalog read failed:", error);
    return null;
  }
}
