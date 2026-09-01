// Inventory operations: poll RunPod for stock + pricing, persist snapshots,
// and read the latest snapshot for the public inventory API.

import { createServiceClient } from "@/lib/supabase/server";
import { GENERIC_SERVICE_ERROR } from "@/lib/inference/error-messages";

import { RunPodClient } from "../client";
import {
    PROBED_GPU_COUNTS,
    buildGpuTypesQuery,
    inferGpuTier,
    inferSortOrder,
    mergeAvailableCounts,
    normalizeStockStatus,
    slugifyGpuId,
} from "../helpers";
import type {
    CloudType,
    InventoryRow,
    RunPodGpuType,
    RunPodGpuTypeLowestPrice,
    ServiceResult,
    StockStatus,
    SyncInventoryResult,
} from "../types";

/**
 * How long a snapshot is kept.
 *
 * This sweep runs every minute and writes ~94 rows each time — one per
 * (gpu, cloud, datacentre) — regardless of whether anything moved. That is
 * ~135,000 rows a day. Nothing reaped them, so the table reached 1,022,889
 * rows and 258 MB, and /dashboard/services/gpu/deploy started failing
 * intermittently with a statement timeout as the read grew slower each day.
 *
 * A day is generous. The deepest reader is lib/catalog/gpu.ts, which takes the
 * newest 4,000 rows — about 42 minutes at this write rate. Everything else
 * reads gpu_inventory_latest, which is the newest row per key. 24h leaves
 * ~34x headroom over the deepest need, so recent stock movement is still
 * inspectable without the table becoming a liability again.
 *
 * Prices are re-fetched from RunPod every minute, so nothing here is a source
 * of truth worth preserving — it is a cache with a log's shape.
 */
const SNAPSHOT_RETENTION_MS = 24 * 60 * 60 * 1000;

// Best stock signal across probes: the most-available probe wins, since the
// `none` probes just mean RunPod can't satisfy that particular pod size.
function bestStockStatus(statuses: StockStatus[]): StockStatus {
    const order: StockStatus[] = ["high", "medium", "low", "none"];
    return statuses.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? "none";
}

// Per-GPU price: derive from the smallest probe (typically p1). If p1 is null
// fall back to the next-smallest non-null price divided by its gpuCount.
function perGpuPrice(
    probes: Array<{ gpuCount: number; price: number | null }>
): number | null {
    const valid = probes
        .filter((p) => p.price !== null && p.price > 0)
        .sort((a, b) => a.gpuCount - b.gpuCount);
    if (valid.length === 0) return null;
    const first = valid[0];
    return (first.price as number) / first.gpuCount;
}

interface CatalogRow {
    id: string;
    runpod_gpu_id: string;
    display_name: string;
    memory_gb: number;
}

interface LatestSnapshotRow {
    gpu_catalog_id: string;
    cloud_type: CloudType;
    data_center_id: string | null;
    stock_status: StockStatus;
    available_counts: number[] | null;
    on_demand_per_hr: number | null;
    spot_per_hr: number | null;
    observed_at: string;
}

/**
 * Every catalog row, active or not.
 *
 * This deliberately does NOT filter on is_active. The result feeds the
 * "do we already know this GPU?" lookup in syncSnapshots, and filtering it
 * made deactivated rows invisible to that check — so auto-discover treated
 * each one as new and upserted it straight back with is_active: true.
 *
 * The effect was that an admin could not deactivate a GPU at all: it returned
 * within one sync cycle, which is 60 seconds. That silently undid the
 * deactivation of three RTX PRO Blackwell SKUs the provider lists in its
 * inventory but refuses to deploy, so customers kept being offered GPUs whose
 * create call always fails.
 *
 * is_active still governs what customers see; it just no longer governs
 * whether the sync believes the row exists.
 */
async function getKnownCatalog(): Promise<CatalogRow[]> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
        .from("gpu_catalog")
        .select("id, runpod_gpu_id, display_name, memory_gb");
    if (error) throw new Error(`gpu_catalog query failed: ${error.message}`);
    return (data || []) as CatalogRow[];
}

export const inventoryOperations = {
    /**
     * Sync GPU availability + pricing from RunPod into gpu_inventory_snapshots.
     * Two GraphQL queries per call (SECURE + COMMUNITY). Idempotent — caller
     * decides the cadence. The sync worker single-flights via a Redis NX lock.
     */
    async syncSnapshots(): Promise<ServiceResult<SyncInventoryResult>> {
        const counter: SyncInventoryResult = {
            scanned: 0,
            written: 0,
            skipped: 0,
            errors: 0,
        };
        try {
            const supabase = await createServiceClient();
            const catalog = await getKnownCatalog();
            const runpodIdToCatalog = new Map(
                catalog.map((c) => [c.runpod_gpu_id, c])
            );

            const cloudTypes: CloudType[] = ["SECURE", "COMMUNITY"];

            // Track unknown GPU types we discover during this run so we only
            // upsert each new catalog row once even if it appears in both
            // cloud-type passes. We persist them after the first GraphQL pass.
            const newCatalogRows = new Map<
                string,
                {
                    id: string;
                    runpod_gpu_id: string;
                    display_name: string;
                    memory_gb: number;
                    tier: "flagship" | "prosumer" | "workstation";
                    sort_order: number;
                    is_active: boolean;
                    marketing_blurb: string | null;
                }
            >();

            // Buffer for snapshot rows that reference an as-yet-unknown gpu_catalog_id.
            // We hold them until after the upsert lands so the FK is satisfied.
            type SnapshotRow = {
                gpu_catalog_id: string;
                cloud_type: CloudType;
                data_center_id: string | null;
                stock_status: StockStatus;
                available_counts: number[];
                on_demand_per_hr: number | null;
                spot_per_hr: number | null;
            };
            const deferredSnapshots: SnapshotRow[] = [];
            const readySnapshots: SnapshotRow[] = [];

            for (const cloudType of cloudTypes) {
                const { query, variables } = buildGpuTypesQuery(
                    cloudType === "SECURE"
                );
                let response: { gpuTypes: RunPodGpuType[] };
                try {
                    response = await RunPodClient.graphql<{ gpuTypes: RunPodGpuType[] }>(
                        query,
                        variables
                    );
                } catch (e) {
                    counter.errors += 1;
                    console.error(
                        `[GPU:inventory] graphql error (${cloudType}):`,
                        e instanceof Error ? e.message : e
                    );
                    continue;
                }

                for (const gpu of response.gpuTypes || []) {
                    counter.scanned += 1;
                    let catalogRow = runpodIdToCatalog.get(gpu.id);

                    // Auto-discover: if this RunPod GPU type isn't yet in our
                    // catalog AND RunPod actually offers it in at least one
                    // cloud, materialize a catalog row.
                    if (!catalogRow && (gpu.secureCloud || gpu.communityCloud)) {
                        const id = slugifyGpuId(gpu.id, gpu.memoryInGb);
                        if (!newCatalogRows.has(id)) {
                            newCatalogRows.set(id, {
                                id,
                                runpod_gpu_id: gpu.id,
                                display_name: gpu.displayName || gpu.id,
                                memory_gb: gpu.memoryInGb,
                                tier: inferGpuTier(gpu.id, gpu.displayName || ""),
                                sort_order: inferSortOrder(gpu.id, gpu.memoryInGb),
                                is_active: true,
                                marketing_blurb: null,
                            });
                        }
                        catalogRow = {
                            id,
                            runpod_gpu_id: gpu.id,
                            display_name: gpu.displayName || gpu.id,
                            memory_gb: gpu.memoryInGb,
                        };
                        runpodIdToCatalog.set(gpu.id, catalogRow);
                    }

                    if (!catalogRow) {
                        counter.skipped += 1;
                        continue;
                    }

                    const supportedHere =
                        cloudType === "SECURE" ? gpu.secureCloud : gpu.communityCloud;

                    // Collect per-probe data. Each probe is `pN` keyed off the
                    // PROBED_GPU_COUNTS array. A null probe = RunPod can't serve
                    // a pod of that size right now (so that count is "none").
                    const probes = PROBED_GPU_COUNTS.map((n) => {
                        const lp = (gpu as unknown as Record<string, RunPodGpuTypeLowestPrice | null | undefined>)[
                            `p${n}`
                        ];
                        const stockStatus: StockStatus = supportedHere
                            ? normalizeStockStatus(lp?.stockStatus ?? null)
                            : "none";
                        return {
                            gpuCount: n,
                            stockStatus,
                            availableGpuCounts: lp?.availableGpuCounts ?? null,
                            onDemand: lp?.uninterruptablePrice ?? null,
                            spot: lp?.minimumBidPrice ?? null,
                        };
                    });

                    const availableCounts = supportedHere
                        ? mergeAvailableCounts(probes)
                        : [];

                    const overallStock = bestStockStatus(probes.map((p) => p.stockStatus));

                    // Per-GPU price (smallest probe wins, scaled down by its gpuCount).
                    const onDemandPerGpu = supportedHere
                        ? perGpuPrice(probes.map((p) => ({ gpuCount: p.gpuCount, price: p.onDemand })))
                        : null;
                    const spotPerGpu = supportedHere
                        ? perGpuPrice(probes.map((p) => ({ gpuCount: p.gpuCount, price: p.spot })))
                        : null;

                    const row: SnapshotRow = {
                        gpu_catalog_id: catalogRow.id,
                        cloud_type: cloudType,
                        data_center_id: null,
                        stock_status: overallStock,
                        available_counts: availableCounts,
                        on_demand_per_hr: onDemandPerGpu,
                        spot_per_hr: spotPerGpu,
                    };

                    // Defer rows whose catalog row was just created — they need
                    // the FK to exist first.
                    if (newCatalogRows.has(catalogRow.id)) {
                        deferredSnapshots.push(row);
                    } else {
                        readySnapshots.push(row);
                    }
                }
            }

            // 1. Upsert any newly-discovered catalog rows (so their pricing/snapshot FKs are valid).
            if (newCatalogRows.size > 0) {
                const newCatalogArr = Array.from(newCatalogRows.values());
                const { error: catalogErr } = await supabase
                    .from("gpu_catalog")
                    .upsert(newCatalogArr, { onConflict: "id" });
                if (catalogErr) {
                    counter.errors += newCatalogArr.length;
                    console.error(
                        `[GPU:inventory] auto-discover catalog upsert failed:`,
                        catalogErr.message
                    );
                } else {
                    // 2. Seed default pricing (25 % markup, no floor) for every
                    //    (cloud, interruptible) combo for each new GPU.
                    const newPricingRows = newCatalogArr.flatMap((c) =>
                        (["SECURE", "COMMUNITY"] as CloudType[]).flatMap((ct) =>
                            [false, true].map((interruptible) => ({
                                gpu_catalog_id: c.id,
                                cloud_type: ct,
                                interruptible,
                                markup_pct: 1.25,
                                floor_per_hour_usd: 0,
                            }))
                        )
                    );
                    const { error: pricingErr } = await supabase
                        .from("gpu_pricing")
                        .upsert(newPricingRows, {
                            onConflict: "gpu_catalog_id,cloud_type,interruptible",
                            ignoreDuplicates: true,
                        });
                    if (pricingErr) {
                        console.error(
                            `[GPU:inventory] auto-discover pricing upsert failed:`,
                            pricingErr.message
                        );
                    }
                    console.log(
                        `[GPU:inventory] auto-discovered ${newCatalogArr.length} GPU type(s): ${newCatalogArr
                            .map((c) => c.id)
                            .join(", ")}`
                    );
                }
            }

            // 3. Write all snapshot rows.
            const allRows = [...readySnapshots, ...deferredSnapshots];
            if (allRows.length > 0) {
                const { error } = await supabase
                    .from("gpu_inventory_snapshots")
                    .insert(allRows);
                if (error) {
                    counter.errors += allRows.length;
                    console.error(
                        `[GPU:inventory] insert error:`,
                        error.message
                    );
                } else {
                    counter.written += allRows.length;
                }
            }

            // 4. Prune. This sweep runs EVERY MINUTE and writes one row per
            // (gpu, cloud, dc) — ~94 rows a minute, ~135,000 a day — whether or
            // not anything changed. Nothing was reaping them, so the table
            // reached 1,022,889 rows and 258 MB, and the deploy page began
            // timing out intermittently as the read got slower every day.
            //
            // Nothing needs deep history. The deepest reader is
            // lib/catalog/gpu.ts, which takes the newest 4,000 rows (~42
            // minutes at this write rate); everything else reads
            // gpu_inventory_latest, which is the newest row per key. A day is
            // ~34x the deepest need, which leaves room to look at recent stock
            // movement without the table becoming a liability again.
            //
            // Deliberately runs after the insert and never fails the sync: a
            // prune that could not run is a housekeeping problem, not a reason
            // to lose this minute's prices.
            try {
                const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_MS).toISOString();
                const { error: pruneErr } = await supabase
                    .from("gpu_inventory_snapshots")
                    .delete()
                    .lt("observed_at", cutoff);
                if (pruneErr) {
                    console.warn(`[GPU:inventory] prune failed (non-fatal):`, pruneErr.message);
                }
            } catch (pruneErr) {
                console.warn(`[GPU:inventory] prune threw (non-fatal):`, pruneErr);
            }

            return { success: true, data: counter };
        } catch (e) {
            console.error(`[GPU:inventory] syncSnapshots failed:`, e);
            return {
                success: false,
                error: GENERIC_SERVICE_ERROR,
                errorCode: "SERVER",
            };
        }
    },

    /**
     * Read the latest snapshot per (gpu, cloud) from gpu_inventory_latest, joined
     * with gpu_catalog for display fields. Used by the public inventory API.
     */
    async listLatest(): Promise<ServiceResult<InventoryRow[]>> {
        try {
            const supabase = await createServiceClient();

            const { data: latest, error: latestErr } = await supabase
                .from("gpu_inventory_latest")
                .select(
                    "gpu_catalog_id, cloud_type, data_center_id, stock_status, available_counts, on_demand_per_hr, spot_per_hr, observed_at"
                );
            if (latestErr) throw new Error(latestErr.message);

            const { data: catalog, error: catErr } = await supabase
                .from("gpu_catalog")
                .select("id, runpod_gpu_id, display_name, memory_gb, sort_order, is_active")
                .eq("is_active", true);
            if (catErr) throw new Error(catErr.message);

            const catalogById = new Map(
                (catalog || []).map((c) => [
                    c.id as string,
                    c as {
                        id: string;
                        runpod_gpu_id: string;
                        display_name: string;
                        memory_gb: number;
                        sort_order: number;
                    },
                ])
            );

            const rows: InventoryRow[] = ((latest || []) as LatestSnapshotRow[])
                .map((row) => {
                    const cat = catalogById.get(row.gpu_catalog_id);
                    if (!cat) return null;
                    return {
                        gpuCatalogId: row.gpu_catalog_id,
                        runpodGpuId: cat.runpod_gpu_id,
                        displayName: cat.display_name,
                        memoryGb: cat.memory_gb,
                        cloudType: row.cloud_type,
                        stockStatus: row.stock_status,
                        availableCounts: row.available_counts || [],
                        onDemandPerHr: row.on_demand_per_hr,
                        spotPerHr: row.spot_per_hr,
                        observedAt: row.observed_at,
                    } satisfies InventoryRow;
                })
                .filter((r): r is InventoryRow => r !== null)
                .sort((a, b) => {
                    const aSort = catalogById.get(a.gpuCatalogId)?.sort_order ?? 0;
                    const bSort = catalogById.get(b.gpuCatalogId)?.sort_order ?? 0;
                    if (aSort !== bSort) return aSort - bSort;
                    return a.cloudType.localeCompare(b.cloudType);
                });

            return { success: true, data: rows };
        } catch (e) {
            console.error("[GPU:inventory] failed:", e);
            return {
                success: false,
                error: GENERIC_SERVICE_ERROR,
                errorCode: "SERVER",
            };
        }
    },
};
