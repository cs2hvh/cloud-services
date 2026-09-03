// Runtime instance-plan catalog.
//
// SPECS come from public.service_plans, PRICES from billing.service_pricing —
// the two tables that exist precisely so a catalogue can say what a plan IS
// without also deciding what it costs. The admin panel writes the price book;
// this is the read side of that.
//
// It used to query public.instance_plans, which was dropped on 2026-08-31, and
// the catch below quietly returned DEFAULT_PLANS — hardcoded constants in
// instance-plans.ts. So the plan picker kept working, looked correct, and
// ignored the admin panel entirely. Nobody saw a broken page; they just saw
// prices that never changed. That is the failure this rewrite removes.
//
// The fallback is gone with it. A plan list that cannot be priced now throws:
// serving a stale constant as if it were a price is how a customer is quoted
// one number and billed another.
//
// Admin edits surface within CACHE_TTL_MS; call invalidatePlanCache() for
// instant invalidation after a write.

import type { SupabaseClient } from "@supabase/supabase-js";

// DEFAULT_PLANS is deliberately NOT imported. It remains in instance-plans.ts
// as the seed the original migration used, and importing it here is what let a
// dropped table masquerade as a working catalogue.
import { type InstancePlan } from "./instance-plans";

export type CatalogPlan = InstancePlan & {
    isActive: boolean;
    sortOrder: number;
};

type CacheEntry = { value: CatalogPlan[]; fetchedAt: number };
const CACHE_TTL_MS = 60_000;
let cache: CacheEntry | null = null;

type PlanRow = {
    plan_key: string;
    display_name: string;
    tier: string | null;
    vcpu: number | null;
    memory_mb: number | null;
    disk_gb: number | null;
    is_active: boolean;
    sort_order: number;
    allowed_regions: string[] | null;
    metadata: Record<string, unknown> | null;
};

type PriceRow = {
    plan_key: string;
    amount: number | string;
    unit: string;
    floor_usd_per_hour: number | string | null;
};

const HOURS_PER_MONTH = 24 * 30;

/**
 * Every compute plan, specs joined to its live price.
 *
 * Two queries rather than a join because they live in different schemas and
 * PostgREST cannot cross that boundary in one call. Both are small.
 *
 * A plan with NO live price is dropped from the catalogue, not shown at zero.
 * A picker offering a plan nobody priced is how a customer deploys something
 * free, and it is the exact shape of the bug this rewrite exists to close.
 */
export async function getAllPlans(supabase: SupabaseClient): Promise<CatalogPlan[]> {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.value;

    const [plansRes, pricesRes] = await Promise.all([
        supabase
            .from("service_plans")
            .select("plan_key, display_name, tier, vcpu, memory_mb, disk_gb, is_active, sort_order, allowed_regions, metadata")
            .eq("service_type", "compute")
            // '*' is not a plan. It is the resolution target that lets resold
            // VMs bill the rate frozen on the server row, and it carries no
            // specs — left in, it would render as a selectable 0 vCPU / 0 GB
            // plan in the customer's picker.
            .neq("plan_key", "*")
            .order("sort_order", { ascending: true })
            .order("plan_key", { ascending: true }),
        supabase
            .schema("billing")
            .from("service_pricing")
            .select("plan_key, amount, unit, floor_usd_per_hour")
            .eq("service_type", "compute")
            .is("effective_to", null),
    ]);

    // No silent fallback. The previous version caught this and returned
    // DEFAULT_PLANS, which is why a dropped table went unnoticed for two days.
    if (plansRes.error) {
        throw new Error(`compute plan catalog unavailable: ${plansRes.error.message}`);
    }
    if (pricesRes.error) {
        throw new Error(`compute price book unavailable: ${pricesRes.error.message}`);
    }

    const priceByPlan = new Map<string, PriceRow>();
    for (const row of (pricesRes.data ?? []) as PriceRow[]) {
        priceByPlan.set(row.plan_key, row);
    }

    const plans: CatalogPlan[] = [];
    for (const row of (plansRes.data ?? []) as PlanRow[]) {
        const price = priceByPlan.get(row.plan_key);
        if (!price) continue;
        plans.push(rowToPlan(row, price));
    }

    cache = { value: plans, fetchedAt: now };
    return plans;
}

/** Active plans only — what the customer plan picker should show. */
export async function getActivePlans(supabase: SupabaseClient): Promise<CatalogPlan[]> {
    const all = await getAllPlans(supabase);
    return all.filter((p) => p.isActive);
}

export async function findPlanBySlug(
    supabase: SupabaseClient,
    slug: string
): Promise<CatalogPlan | null> {
    const all = await getAllPlans(supabase);
    return all.find((p) => p.slug === slug) ?? null;
}

/** Drop the cached snapshot — call this after any admin write. */
export function invalidatePlanCache(): void {
    cache = null;
}

function rowToPlan(row: PlanRow, price: PriceRow): CatalogPlan {
    // Same conversion the database does in billing.resolve_hourly_rate. The
    // quote and the charge only agree if they do identical arithmetic, so this
    // mirrors it rather than approximating it.
    const amount = Number(price.amount);
    const floor = Number(price.floor_usd_per_hour ?? 0);
    const hourly = Math.max(
        price.unit === "usd_per_hour" ? amount : amount / HOURS_PER_MONTH,
        floor,
    );

    // allowed_host_ids has no column on service_plans; it rode along on
    // instance_plans and is carried in metadata now.
    const hostIds = Array.isArray(row.metadata?.allowed_host_ids)
        ? (row.metadata.allowed_host_ids as string[])
        : undefined;
    const tagline =
        typeof row.metadata?.tagline === "string" ? (row.metadata.tagline as string) : undefined;

    return {
        slug: row.plan_key,
        name: row.display_name,
        tier: (row.tier === "dedicated" ? "dedicated" : "shared") as CatalogPlan["tier"],
        vcpu: row.vcpu ?? 0,
        memoryMB: row.memory_mb ?? 0,
        diskGB: row.disk_gb ?? 0,
        defaultHourlyUSD: Math.round(hourly * 1_000_000) / 1_000_000,
        defaultMonthlyUSD: Math.round(hourly * HOURS_PER_MONTH * 100) / 100,
        tagline,
        isActive: row.is_active,
        sortOrder: row.sort_order,
        allowedRegions: row.allowed_regions ?? undefined,
        allowedHostIds: hostIds,
    };
}
