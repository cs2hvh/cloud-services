// Linode catalog sync: regions, types (plans), images, per-region availability.
//
// Pulls the live catalog from the Linode API and upserts it into the
// linode_* tables. Follows the RunPod inventory-sync philosophy:
//   - auto-discover: new type ids get a linode_pricing row at markup 1.0
//     (list price) so unknown SKUs never block a sync or a sale.
//   - never delete: ids gone from the API are flagged is_active=false
//     (servers may still reference them).
//   - admin-owned switches: sync NEVER sets is_active=true on existing rows,
//     so an admin disable survives every sync. New rows default to active.
//
// Concurrency: callers hold the Redis NX lock (see admin/internal sync routes).

import { createServiceClient } from "@/lib/supabase/server";
import { LinodeClient } from "./client";
import type {
    LinodeImage,
    LinodeRegion,
    LinodeRegionAvailability,
    LinodeType,
} from "./types";
import { invalidateLinodeCatalogCache } from "@/lib/pricing/linode-catalog";

const CHUNK = 500;

export interface LinodeCatalogSyncReport {
    regions: number;
    types: number;
    images: number;
    availabilityPairs: number;
    newPricingRows: number;
    deactivated: { regions: number; types: number; images: number };
    durationMs: number;
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

function chunk<T>(rows: T[]): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
    return out;
}

/**
 * Upsert catalog rows without touching the admin-owned is_active flag on
 * existing rows: the payload simply omits is_active, so updates leave it
 * alone while inserts pick up the column default (TRUE).
 */
async function upsertRows(
    supabase: ServiceClient,
    table: string,
    rows: Record<string, unknown>[],
    onConflict: string
): Promise<void> {
    for (const batch of chunk(rows)) {
        const { error } = await supabase.from(table).upsert(batch, { onConflict });
        if (error) throw new Error(`[linode-sync] upsert ${table} failed: ${error.message}`);
    }
}

/** Flag rows absent from the live API as inactive (never re-activate, never delete). */
async function deactivateMissing(
    supabase: ServiceClient,
    table: string,
    idColumn: string,
    presentIds: string[]
): Promise<number> {
    if (presentIds.length === 0) return 0;
    const { data, error } = await supabase
        .from(table)
        .update({ is_active: false })
        .not(idColumn, "in", `(${presentIds.map((id) => `"${id}"`).join(",")})`)
        .eq("is_active", true)
        .select(idColumn);
    if (error) throw new Error(`[linode-sync] deactivate ${table} failed: ${error.message}`);
    return data?.length ?? 0;
}

export async function syncLinodeCatalog(): Promise<LinodeCatalogSyncReport> {
    const startedAt = Date.now();
    const syncedAt = new Date().toISOString();
    const supabase = await createServiceClient();

    const [regions, types, images] = await Promise.all([
        LinodeClient.getAllPages<LinodeRegion>("/regions"),
        LinodeClient.getAllPages<LinodeType>("/linode/types"),
        LinodeClient.getAllPages<LinodeImage>("/images"),
    ]);

    // Availability is fetched PER REGION: the aggregate /regions/availability
    // endpoint has been observed returning only a partial region set, which
    // left whole regions with no rows (and the UI failing closed → everything
    // "out of stock"). Per-region calls are deterministic; a failed region is
    // skipped (its stale rows survive) rather than poisoning the sync.
    const availability: LinodeRegionAvailability[] = [];
    const CONCURRENCY = 5;
    const queue = [...regions];
    await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
            for (;;) {
                const region = queue.shift();
                if (!region) return;
                try {
                    const rows = await LinodeClient.getAllPages<LinodeRegionAvailability>(
                        `/regions/${encodeURIComponent(region.id)}/availability`
                    );
                    availability.push(...rows);
                } catch (e) {
                    console.warn(
                        `[linode-sync] availability fetch failed for ${region.id}:`,
                        e instanceof Error ? e.message : e
                    );
                }
            }
        })
    );

    // ── Regions ──────────────────────────────────────────────────────────────
    await upsertRows(
        supabase,
        "linode_regions",
        regions.map((r) => ({
            id: r.id,
            label: r.label,
            country: r.country,
            capabilities: r.capabilities ?? [],
            status: r.status ?? "ok",
            synced_at: syncedAt,
        })),
        "id"
    );

    // ── Types ────────────────────────────────────────────────────────────────
    await upsertRows(
        supabase,
        "linode_types",
        types.map((t) => ({
            id: t.id,
            label: t.label,
            class: t.class,
            vcpus: t.vcpus,
            memory_mb: t.memory,
            disk_mb: t.disk,
            transfer_gb: t.transfer ?? 0,
            network_out_mbps: t.network_out ?? 0,
            hourly_usd: t.price?.hourly ?? 0,
            monthly_usd: t.price?.monthly ?? 0,
            region_prices: t.region_prices ?? [],
            backups_hourly_usd: t.addons?.backups?.price?.hourly ?? null,
            backups_monthly_usd: t.addons?.backups?.price?.monthly ?? null,
            synced_at: syncedAt,
        })),
        "id"
    );

    // ── Images (public distros only; private/custom images are a later phase) ─
    const publicImages = images.filter((i) => i.is_public);
    await upsertRows(
        supabase,
        "linode_images",
        publicImages.map((i) => ({
            id: i.id,
            label: i.label,
            vendor: i.vendor,
            size_mb: i.size ?? 0,
            is_public: true,
            deprecated: i.deprecated ?? false,
            eol: i.eol,
            synced_at: syncedAt,
        })),
        "id"
    );

    // ── Availability (only pairs whose region+type we just upserted) ─────────
    const regionIds = new Set(regions.map((r) => r.id));
    const typeIds = new Set(types.map((t) => t.id));
    const availabilityRows = availability
        .filter((a) => regionIds.has(a.region) && typeIds.has(a.plan))
        .map((a) => ({
            region_id: a.region,
            type_id: a.plan,
            available: a.available,
            checked_at: syncedAt,
        }));
    await upsertRows(supabase, "linode_region_availability", availabilityRows, "region_id,type_id");

    // ── Auto-discover pricing rows (markup 1.0 = list price) ─────────────────
    let newPricingRows = 0;
    for (const batch of chunk(types.map((t) => ({ type_id: t.id })))) {
        const { data, error } = await supabase
            .from("linode_pricing")
            .upsert(batch, { onConflict: "type_id", ignoreDuplicates: true })
            .select("type_id");
        if (error) throw new Error(`[linode-sync] pricing seed failed: ${error.message}`);
        newPricingRows += data?.length ?? 0;
    }

    // ── Deactivate ids gone from the API ─────────────────────────────────────
    const deactivated = {
        regions: await deactivateMissing(supabase, "linode_regions", "id", [...regionIds]),
        types: await deactivateMissing(supabase, "linode_types", "id", [...typeIds]),
        images: await deactivateMissing(
            supabase,
            "linode_images",
            "id",
            publicImages.map((i) => i.id)
        ),
    };

    invalidateLinodeCatalogCache();

    return {
        regions: regions.length,
        types: types.length,
        images: publicImages.length,
        availabilityPairs: availabilityRows.length,
        newPricingRows,
        deactivated,
        durationMs: Date.now() - startedAt,
    };
}
