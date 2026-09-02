import { createServiceClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { HOURS_IN_MONTH } from "@admin/lib/pricing";

/**
 * Plan catalog for the panel's service pages, sourced from what actually
 * exists since the 2026-08-31 pricing rebuild: public.service_plans (specs,
 * spec-only by design) joined to billing.service_pricing (the live price
 * book). The dropped public.products table is no longer read anywhere.
 *
 * Output is shaped like the old Tables<"products"> rows because the vendored
 * section components (plans tabs, assign flows) consume that shape: id/name/
 * sub/slug/price/resources. plan_key preserves the old products.id for
 * database/kubernetes, so ids stay stable across the rebuild.
 */

interface PlanRow {
  plan_key: string;
  display_name: string;
  description: string | null;
  tier: string | null;
  vcpu: number | null;
  memory_mb: number | null;
  disk_gb: number | null;
  provider_size: string | null;
  sort_order: number | null;
  metadata: {
    engine?: string;
    specs?: string[];
    resources?: { cpu?: number; ram?: number; storage?: number };
    cpu_type?: string;
  } | null;
}

interface LivePrice {
  plan_key: string;
  rate_model: string;
  unit: string;
  amount: number;
}

export function monthlyUsd(p: LivePrice | undefined): number {
  if (!p) return 0;
  const amount = Number(p.amount);
  switch (p.unit) {
    case "usd_per_month":
    case "usd_per_gb_month":
      return amount;
    case "usd_per_hour":
    case "usd_per_gb_hour":
      return amount * HOURS_IN_MONTH;
    default:
      return 0; // markup has no absolute monthly figure
  }
}

export async function loadCatalogPlans(
  serviceType: string,
): Promise<{ plans: Tables<"products">[]; error: string | null }> {
  try {
    const supabase = await createServiceClient();
    const [plansRes, pricesRes] = await Promise.all([
      supabase
        .from("service_plans")
        .select(
          "plan_key, display_name, description, tier, vcpu, memory_mb, disk_gb, provider_size, sort_order, metadata",
        )
        .eq("service_type", serviceType)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .schema("billing")
        .from("service_pricing")
        .select("plan_key, rate_model, unit, amount")
        .eq("service_type", serviceType)
        .is("effective_to", null),
    ]);

    if (plansRes.error) return { plans: [], error: plansRes.error.message };
    if (pricesRes.error) return { plans: [], error: pricesRes.error.message };

    const prices = (pricesRes.data ?? []) as LivePrice[];
    const priceOf = new Map(prices.map((p) => [p.plan_key, p]));
    const flatPrice = priceOf.get("*");

    const plans = ((plansRes.data ?? []) as PlanRow[]).map((row) => {
      const meta = row.metadata ?? {};
      const resources = meta.resources ?? {
        cpu: row.vcpu ?? 0,
        ram: row.memory_mb ? Math.round(row.memory_mb / 1024) : 0,
        storage: row.disk_gb ?? 0,
      };
      return {
        id: row.plan_key,
        name: row.display_name,
        description: row.description,
        type: serviceType,
        sub: meta.engine ?? row.tier ?? null,
        slug: row.provider_size ?? row.plan_key,
        price: monthlyUsd(priceOf.get(row.plan_key) ?? flatPrice),
        specs: meta.specs ?? [],
        resources,
        cpu_type: meta.cpu_type,
        is_active: true,
        created_at: new Date(0).toISOString(),
      } as unknown as Tables<"products">;
    });

    return { plans, error: null };
  } catch (err) {
    return { plans: [], error: (err as Error).message };
  }
}
