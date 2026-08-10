// Canonical GPU catalog — the one place GPU specs, prices and stock are
// derived for the public pages.
//
// Why this exists: the GPU service page carried a hand-written array of seven
// GPUs with fixed `pricePerHour` numbers and fixed `stock: "available"`
// strings, while the deploy wizard derived both from the provider. Those two
// can never agree by editing numbers, because the real price is RunPod's
// observed rate x gpu_pricing.markup_pct and the real stock changes hourly.
// The hardcoded ids did not even match the catalog ("h100-sxm" vs
// "h100-sxm-80").
//
// Prices here run computeResalePerHour() — the same function that sets what a
// pod actually charges — so the page and the checkout cannot disagree.

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeResalePerHour } from "@/lib/services/runpod/helpers";

/**
 * How old a stock reading may be before we stop asserting availability.
 *
 * The inventory sync runs every minute. An hour of slack absorbs a few missed
 * firings without ever letting the page claim "In stock" from data that is
 * days old — which is exactly what it would have done: snapshots were found
 * 2.5 days stale while nothing scheduled the sync at all.
 */
export const STOCK_FRESHNESS_MS = 60 * 60 * 1000;

/** Availability as a visitor should see it. `unknown` is an honest answer. */
export type PublicStock = "available" | "limited" | "unavailable" | "unknown";

export interface PublicGpu {
  id: string;
  name: string;
  memoryGB: number;
  /** Resale price per GPU-hour, or null when we have no live reading. */
  hourlyUSD: number | null;
  stock: PublicStock;
  /** When the stock/price reading was taken; null when there is none. */
  observedAt: string | null;
  /** Deep link into the deploy wizard for this exact catalog id. */
  href: string;
}

export interface PublicGpuCatalog {
  gpus: PublicGpu[];
  /** Newest reading across all GPUs — drives the "as of" line on the page. */
  observedAt: string | null;
  /** False when every reading is older than STOCK_FRESHNESS_MS. */
  stockIsFresh: boolean;
}

interface CatalogRow {
  id: string;
  display_name: string;
  memory_gb: number;
  sort_order: number | null;
  is_active: boolean | null;
}

interface SnapshotRow {
  gpu_catalog_id: string;
  cloud_type: string;
  stock_status: string | null;
  available_counts: number[] | null;
  on_demand_per_hr: number | null;
  observed_at: string;
}

interface PricingRow {
  gpu_catalog_id: string;
  cloud_type: string;
  interruptible: boolean;
  markup_pct: number | null;
  floor_per_hour_usd: number | null;
}

/**
 * Map the provider's stock word to what a visitor sees.
 *
 * A stale reading is reported as `unknown` rather than carried forward: an
 * out-of-date "In stock" sends someone into a deploy that will fail, which is
 * worse than admitting we do not currently know.
 */
function publicStock(row: SnapshotRow | undefined, now: number): PublicStock {
  if (!row) return "unknown";
  if (now - new Date(row.observed_at).getTime() > STOCK_FRESHNESS_MS) return "unknown";

  const counts = row.available_counts ?? [];
  const any = counts.some((c) => c > 0);
  switch ((row.stock_status ?? "").toLowerCase()) {
    case "high":
    case "medium":
      return any ? "available" : "unavailable";
    case "low":
      return any ? "limited" : "unavailable";
    case "none":
      return "unavailable";
    default:
      return any ? "limited" : "unknown";
  }
}

/**
 * Build the public view of the GPU catalog.
 *
 * Takes the newest snapshot per GPU across cloud types, prices it with the
 * same resale function a pod is billed by, and reports stock only when the
 * reading is fresh.
 */
export async function getPublicGpuCatalog(
  supabase: SupabaseClient,
  now: number = Date.now()
): Promise<PublicGpuCatalog> {
  const [{ data: catalog }, { data: pricing }, { data: snapshots }] = await Promise.all([
    supabase
      .from("gpu_catalog")
      .select("id, display_name, memory_gb, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("gpu_pricing")
      .select("gpu_catalog_id, cloud_type, interruptible, markup_pct, floor_per_hour_usd"),
    // One row per (gpu, cloud) is enough; the sync writes newest-last.
    supabase
      .from("gpu_inventory_snapshots")
      .select("gpu_catalog_id, cloud_type, stock_status, available_counts, on_demand_per_hr, observed_at")
      .order("observed_at", { ascending: false })
      .limit(4000),
  ]);

  // Newest snapshot per catalog id, preferring the cheapest live on-demand rate
  // when several cloud types report at the same freshness.
  const newest = new Map<string, SnapshotRow>();
  for (const row of (snapshots ?? []) as SnapshotRow[]) {
    const seen = newest.get(row.gpu_catalog_id);
    if (!seen) { newest.set(row.gpu_catalog_id, row); continue; }
    const newerFirst = new Date(row.observed_at) > new Date(seen.observed_at);
    const cheaper =
      row.observed_at === seen.observed_at &&
      (row.on_demand_per_hr ?? Infinity) < (seen.on_demand_per_hr ?? Infinity);
    if (newerFirst || cheaper) newest.set(row.gpu_catalog_id, row);
  }

  // On-demand, non-interruptible is what the public page quotes.
  const priceBy = new Map<string, PricingRow>();
  for (const p of (pricing ?? []) as PricingRow[]) {
    if (p.interruptible) continue;
    const key = `${p.gpu_catalog_id}:${p.cloud_type}`;
    priceBy.set(key, p);
  }

  let newestObserved: string | null = null;

  const gpus: PublicGpu[] = ((catalog ?? []) as CatalogRow[]).map((c) => {
    const snap = newest.get(c.id);
    if (snap && (!newestObserved || snap.observed_at > newestObserved)) {
      newestObserved = snap.observed_at;
    }

    let hourlyUSD: number | null = null;
    if (snap?.on_demand_per_hr != null && snap.on_demand_per_hr > 0) {
      const p = priceBy.get(`${c.id}:${snap.cloud_type}`);
      // markup_pct below 1 would price under cost and computeResalePerHour
      // rejects it; default to 1 rather than throwing on a bad row.
      const markupPct = Math.max(Number(p?.markup_pct ?? 1), 1);
      hourlyUSD = computeResalePerHour({
        observedPerHr: snap.on_demand_per_hr,
        markupPct,
        floorPerHour: Math.max(Number(p?.floor_per_hour_usd ?? 0), 0),
        gpuCount: 1,
      });
    }

    return {
      id: c.id,
      name: c.display_name,
      memoryGB: c.memory_gb,
      hourlyUSD,
      stock: publicStock(snap, now),
      observedAt: snap?.observed_at ?? null,
      href: `/dashboard/services/gpu/deploy?gpu=${encodeURIComponent(c.id)}`,
    };
  });

  const stockIsFresh =
    newestObserved !== null && now - new Date(newestObserved).getTime() <= STOCK_FRESHNESS_MS;

  return { gpus, observedAt: newestObserved, stockIsFresh };
}
