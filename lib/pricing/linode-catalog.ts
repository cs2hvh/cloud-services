// Runtime Linode catalog — queries the synced linode_* tables and caches the
// snapshot for ~60 seconds (same idiom as plan-catalog.ts). The DB is the
// source of truth; lib/services/linode/catalog-sync.ts keeps it fresh.
//
// Resale pricing (mirrors the GPU resell formula, frozen at create time):
//   resaleHourly  = max(regionalHourly * markup_pct, floor_per_hour_usd)
//   resaleMonthly = resaleHourly * 720   // platform-wide hourly = monthly/720
//
// GPU/accelerated classes are excluded at READ time (policy: GPUs are sold via
// the RunPod-backed GPU service) — the sync still stores them, so flipping the
// policy later is a one-line change here.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LinodeRegionPrice, LinodeTypeClass } from "@/lib/services/linode/types";

const CACHE_TTL_MS = 60_000;
export const HOURS_PER_MONTH = 720;

/** Plan classes the compute service does NOT resell. */
export const EXCLUDED_LINODE_CLASSES: ReadonlySet<string> = new Set(["gpu", "accelerated"]);

export interface LinodeCatalogRegion {
    id: string;
    label: string;
    country: string;
    capabilities: string[];
    status: string;
}

export interface LinodeCatalogPlan {
    id: string;
    label: string;
    class: LinodeTypeClass;
    vcpus: number;
    memoryMB: number;
    diskGB: number;
    transferGB: number;
    networkOutMbps: number;
    /** Linode list prices (base; region_prices may override per region). */
    listHourlyUSD: number;
    listMonthlyUSD: number;
    regionPrices: LinodeRegionPrice[];
    backupsHourlyUSD: number | null;
    backupsRegionPrices: LinodeRegionPrice[];
    /** Admin-managed resale controls (linode_pricing). */
    markupPct: number;
    floorPerHourUSD: number;
    pricingActive: boolean;
}

export interface LinodeCatalogImage {
    id: string;
    label: string;
    vendor: string | null;
    sizeMB: number;
    deprecated: boolean;
}

export interface LinodeCatalog {
    regions: LinodeCatalogRegion[];
    plans: LinodeCatalogPlan[];
    images: LinodeCatalogImage[];
    /** `${regionId}:${typeId}` → available */
    availability: Map<string, boolean>;
    /** Regions that have at least one availability row — no data ≠ sold out. */
    regionsWithAvailabilityData: Set<string>;
    syncedAt: string | null;
}

type CacheEntry = { value: LinodeCatalog; fetchedAt: number };
let cache: CacheEntry | null = null;

/** Drop the cached snapshot — call after any admin write or sync. */
export function invalidateLinodeCatalogCache(): void {
    cache = null;
}

interface AvailabilityRow {
    region_id: string;
    type_id: string;
    available: boolean;
}

/**
 * Read the ENTIRE availability table in pages. PostgREST caps a single select
 * at ~1000 rows (db-max-rows) and the table holds regions × types (~2.5k) —
 * an uncapped read silently truncates, which made whole regions look sold out.
 */
export async function selectAllAvailabilityRows(
    supabase: SupabaseClient
): Promise<{ rows: AvailabilityRow[]; error: { message: string } | null }> {
    const PAGE = 1000;
    const rows: AvailabilityRow[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from("linode_region_availability")
            .select("region_id, type_id, available")
            .order("region_id")
            .order("type_id")
            .range(from, from + PAGE - 1);
        if (error) return { rows, error };
        rows.push(...((data ?? []) as AvailabilityRow[]));
        if ((data?.length ?? 0) < PAGE) break;
    }
    return { rows, error: null };
}

export async function getLinodeCatalog(supabase: SupabaseClient): Promise<LinodeCatalog> {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.value;

    const [regionsRes, typesRes, imagesRes, availRes, pricingRes] = await Promise.all([
        supabase
            .from("linode_regions")
            .select("id, label, country, capabilities, status, synced_at")
            .eq("is_active", true)
            .order("label"),
        supabase
            .from("linode_types")
            .select(
                "id, label, class, vcpus, memory_mb, disk_mb, transfer_gb, network_out_mbps, hourly_usd, monthly_usd, region_prices, backups_hourly_usd, is_active"
            )
            .eq("is_active", true),
        supabase
            .from("linode_images")
            .select("id, label, vendor, size_mb, deprecated")
            .eq("is_active", true)
            .order("vendor"),
        selectAllAvailabilityRows(supabase),
        supabase.from("linode_pricing").select("type_id, markup_pct, floor_per_hour_usd, is_active"),
    ]);

    const firstError =
        regionsRes.error || typesRes.error || imagesRes.error || availRes.error || pricingRes.error;
    if (firstError) {
        // Serve the stale snapshot on transient failure rather than blanking the
        // deploy page; with no snapshot (e.g. migrations not applied yet) fail
        // soft with an empty catalog — the deploy page shows "no regions" and
        // create validation rejects cleanly.
        if (cache) return cache.value;
        console.warn(`[linode-catalog] query failed, serving empty catalog: ${firstError.message}`);
        return {
            regions: [],
            plans: [],
            images: [],
            availability: new Map(),
            regionsWithAvailabilityData: new Set(),
            syncedAt: null,
        };
    }

    const pricingByType = new Map(
        (pricingRes.data ?? []).map((p) => [
            p.type_id as string,
            {
                markupPct: Number(p.markup_pct ?? 1),
                floorPerHourUSD: Number(p.floor_per_hour_usd ?? 0),
                isActive: Boolean(p.is_active),
            },
        ])
    );

    const regions: LinodeCatalogRegion[] = (regionsRes.data ?? [])
        .filter((r) => (r.capabilities as string[] | null)?.includes("Linodes"))
        .map((r) => ({
            id: r.id,
            label: r.label,
            country: r.country,
            capabilities: (r.capabilities as string[]) ?? [],
            status: r.status,
        }));

    const plans: LinodeCatalogPlan[] = (typesRes.data ?? [])
        .filter((t) => !EXCLUDED_LINODE_CLASSES.has(t.class))
        .map((t) => {
            const pricing = pricingByType.get(t.id);
            const backupsRegionPrices: LinodeRegionPrice[] = [];
            return {
                id: t.id,
                label: t.label,
                class: t.class as LinodeTypeClass,
                vcpus: t.vcpus,
                memoryMB: t.memory_mb,
                diskGB: Math.round(t.disk_mb / 1024),
                transferGB: t.transfer_gb,
                networkOutMbps: t.network_out_mbps,
                listHourlyUSD: Number(t.hourly_usd),
                listMonthlyUSD: Number(t.monthly_usd),
                regionPrices: (t.region_prices as LinodeRegionPrice[]) ?? [],
                backupsHourlyUSD:
                    t.backups_hourly_usd === null ? null : Number(t.backups_hourly_usd),
                backupsRegionPrices,
                markupPct: pricing?.markupPct ?? 1,
                floorPerHourUSD: pricing?.floorPerHourUSD ?? 0,
                pricingActive: pricing?.isActive ?? true,
            };
        })
        .filter((p) => p.pricingActive);

    const images: LinodeCatalogImage[] = (imagesRes.data ?? []).map((i) => ({
        id: i.id,
        label: i.label,
        vendor: i.vendor,
        sizeMB: i.size_mb,
        deprecated: i.deprecated,
    }));

    const availability = new Map<string, boolean>();
    const regionsWithAvailabilityData = new Set<string>();
    for (const a of availRes.rows) {
        availability.set(`${a.region_id}:${a.type_id}`, Boolean(a.available));
        regionsWithAvailabilityData.add(a.region_id);
    }

    const catalog: LinodeCatalog = {
        regions,
        plans,
        images,
        availability,
        regionsWithAvailabilityData,
        syncedAt: (regionsRes.data?.[0]?.synced_at as string | undefined) ?? null,
    };
    cache = { value: catalog, fetchedAt: now };
    return catalog;
}

// ─── Pricing resolution ──────────────────────────────────────────────────────

export interface ResolvedLinodePrice {
    /** What the customer pays (markup + floor applied). */
    hourlyUSD: number;
    monthlyUSD: number;
    /** Add-on resale price; null when the type has no backups addon. */
    backupsHourlyUSD: number | null;
    backupsMonthlyUSD: number | null;
    /** Linode list prices actually used (after region override) — margin math. */
    listHourlyUSD: number;
}

function round(value: number, dp: number): number {
    const f = Math.pow(10, dp);
    return Math.round(value * f) / f;
}

/**
 * Resolve the customer price for a plan in a region: apply the region_prices
 * override when present, then markup, then the per-hour floor. Monthly figures
 * derive from the resale hourly via the platform-wide 720 h/month convention.
 */
export function resolveLinodePlanPrice(
    plan: LinodeCatalogPlan,
    regionId: string
): ResolvedLinodePrice {
    const override = plan.regionPrices.find((rp) => rp.id === regionId);
    const listHourly = override?.hourly ?? plan.listHourlyUSD;

    const hourly = round(Math.max(listHourly * plan.markupPct, plan.floorPerHourUSD), 5);
    const monthly = round(hourly * HOURS_PER_MONTH, 2);

    let backupsHourly: number | null = null;
    if (plan.backupsHourlyUSD !== null) {
        backupsHourly = round(plan.backupsHourlyUSD * plan.markupPct, 5);
    }

    return {
        hourlyUSD: hourly,
        monthlyUSD: monthly,
        backupsHourlyUSD: backupsHourly,
        backupsMonthlyUSD: backupsHourly === null ? null : round(backupsHourly * HOURS_PER_MONTH, 2),
        listHourlyUSD: listHourly,
    };
}

export function isTypeAvailableInRegion(
    catalog: LinodeCatalog,
    typeId: string,
    regionId: string
): boolean {
    // No availability data for the whole region means UNKNOWN, not sold out —
    // fail open (Linode itself still rejects a truly unavailable deploy, which
    // the create path maps to a clean 409). An explicit false stays closed.
    if (!catalog.regionsWithAvailabilityData.has(regionId)) return true;
    const flag = catalog.availability.get(`${regionId}:${typeId}`);
    return flag !== false;
}

export function findLinodePlan(catalog: LinodeCatalog, typeId: string): LinodeCatalogPlan | null {
    return catalog.plans.find((p) => p.id === typeId) ?? null;
}

export function findLinodeRegion(
    catalog: LinodeCatalog,
    regionId: string
): LinodeCatalogRegion | null {
    return catalog.regions.find((r) => r.id === regionId) ?? null;
}

export function findLinodeImage(catalog: LinodeCatalog, imageId: string): LinodeCatalogImage | null {
    return catalog.images.find((i) => i.id === imageId) ?? null;
}
