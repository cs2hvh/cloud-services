// Runtime instance-plan catalog — queries the `instance_plans` table
// and caches the result for ~60 seconds. The DB is the source of
// truth; the code constants in instance-plans.ts are only used as
// a seed for the very first migration.
//
// Admin edits surface within `CACHE_TTL_MS` of the change without a
// manual flush; for instant invalidation after a write, call
// invalidatePlanCache().

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_PLANS, type InstancePlan } from "./instance-plans";

export type CatalogPlan = InstancePlan & {
    isActive: boolean;
    sortOrder: number;
};

type CacheEntry = { value: CatalogPlan[]; fetchedAt: number };
const CACHE_TTL_MS = 60_000;
let cache: CacheEntry | null = null;

type Row = {
    slug: string;
    name: string;
    tier: "shared" | "dedicated";
    vcpu: number;
    memory_mb: number;
    disk_gb: number;
    hourly_usd: number | string;
    monthly_usd: number | string;
    tagline: string | null;
    is_active: boolean;
    sort_order: number;
    allowed_regions: string[] | null;
    allowed_host_ids: string[] | null;
};

/**
 * Fetch every plan from the DB, sorted by `sort_order` then by slug.
 * Returns the code defaults as a fallback if the DB query fails
 * (so the customer dashboard never goes blank on a transient error).
 *
 * Pass a Supabase client that has read access to `instance_plans`.
 * Anyone authenticated can SELECT, so the customer-facing API can
 * use the user-context client.
 */
export async function getAllPlans(supabase: SupabaseClient): Promise<CatalogPlan[]> {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.value;

    try {
        const { data, error } = await supabase
            .from("instance_plans")
            .select("slug, name, tier, vcpu, memory_mb, disk_gb, hourly_usd, monthly_usd, tagline, is_active, sort_order, allowed_regions, allowed_host_ids")
            .order("sort_order", { ascending: true })
            .order("slug", { ascending: true });
        if (error) throw error;
        const plans = (data ?? []).map(rowToPlan);
        cache = { value: plans, fetchedAt: now };
        return plans;
    } catch (e) {
        console.warn("[plan-catalog] DB query failed, using code defaults:", e);
        const fallback = DEFAULT_PLANS.map<CatalogPlan>((p) => ({
            ...p,
            isActive: true,
            sortOrder: 0,
        }));
        return fallback;
    }
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

function rowToPlan(row: Row): CatalogPlan {
    return {
        slug: row.slug,
        name: row.name,
        tier: row.tier,
        vcpu: row.vcpu,
        memoryMB: row.memory_mb,
        diskGB: row.disk_gb,
        defaultHourlyUSD: Number(row.hourly_usd),
        defaultMonthlyUSD: Number(row.monthly_usd),
        tagline: row.tagline ?? undefined,
        isActive: row.is_active,
        sortOrder: row.sort_order,
        allowedRegions: row.allowed_regions ?? undefined,
        allowedHostIds: row.allowed_host_ids ?? undefined,
    };
}
