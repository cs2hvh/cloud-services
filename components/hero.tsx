// Marketing hero — GPU-forward, dark, restrained.
//
// Server component: reads a small live inventory snippet from Supabase at
// request time so the homepage shows actual current pricing and stock
// (gpu_inventory_snapshots is public-readable via RLS). Falls back to a
// static snippet if the DB is unreachable so the page never breaks.
//
// We construct the Supabase client inline rather than reusing
// `@/lib/supabase/server` — that module imports `next/headers` at top level,
// which trips Next's static-analysis on marketing pages even though we'd
// only call the cookieless export. Anon key only; RLS handles privacy.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import HeroClient, { type HeroInventoryItem } from "./hero/hero-client";

const FALLBACK_INVENTORY: HeroInventoryItem[] = [
    { gpuCatalogId: "h100-sxm-80",  displayName: "H100 SXM",  memoryGb: 80,  onDemandPerHr: 2.99, stockStatus: "low" },
    { gpuCatalogId: "h100-nvl-94",  displayName: "H100 NVL",  memoryGb: 94,  onDemandPerHr: 2.59, stockStatus: "low" },
    { gpuCatalogId: "h200-141",     displayName: "H200 SXM",  memoryGb: 141, onDemandPerHr: 3.99, stockStatus: "low" },
    { gpuCatalogId: "b200-180",     displayName: "B200",      memoryGb: 180, onDemandPerHr: 5.49, stockStatus: "low" },
];

type LatestRow = {
    gpu_catalog_id: string;
    cloud_type: string;
    stock_status: "high" | "medium" | "low" | "none";
    on_demand_per_hr: number | null;
    available_counts: number[] | null;
};

type CatalogRow = {
    id: string;
    display_name: string;
    memory_gb: number;
    sort_order: number;
};

function getAnonSupabase() {
    const url =
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    if (!url || !anon) return null;
    return createSupabaseClient(url, anon, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
}

async function loadInventorySnippet(): Promise<HeroInventoryItem[]> {
    try {
        const supabase = getAnonSupabase();
        if (!supabase) return FALLBACK_INVENTORY;

        const [latestRes, catRes] = await Promise.all([
            supabase
                .from("gpu_inventory_latest")
                .select(
                    "gpu_catalog_id, cloud_type, stock_status, on_demand_per_hr, available_counts"
                )
                .eq("cloud_type", "SECURE"),
            supabase
                .from("gpu_catalog")
                .select("id, display_name, memory_gb, sort_order")
                .eq("is_active", true)
                .order("sort_order", { ascending: true }),
        ]);

        if (latestRes.error || catRes.error) return FALLBACK_INVENTORY;

        const latest = (latestRes.data || []) as LatestRow[];
        const catalog = (catRes.data || []) as CatalogRow[];
        const byCatalogId = new Map(catalog.map((c) => [c.id, c]));
        const latestById = new Map(latest.map((l) => [l.gpu_catalog_id, l]));

        const items: HeroInventoryItem[] = [];
        for (const c of catalog) {
            const l = latestById.get(c.id);
            if (!l) continue;
            items.push({
                gpuCatalogId: c.id,
                displayName: c.display_name,
                memoryGb: c.memory_gb,
                onDemandPerHr: l.on_demand_per_hr,
                stockStatus: l.stock_status,
                maxCount:
                    l.available_counts && l.available_counts.length > 0
                        ? Math.max(...l.available_counts)
                        : l.stock_status === "none"
                          ? 0
                          : 1,
            });
        }

        // Prefer in-stock GPUs first, then catalog sort_order, then top 5.
        items.sort((a, b) => {
            const aIn = a.stockStatus !== "none" ? 0 : 1;
            const bIn = b.stockStatus !== "none" ? 0 : 1;
            if (aIn !== bIn) return aIn - bIn;
            const aSort = byCatalogId.get(a.gpuCatalogId)?.sort_order ?? 9999;
            const bSort = byCatalogId.get(b.gpuCatalogId)?.sort_order ?? 9999;
            return aSort - bSort;
        });

        const trimmed = items.slice(0, 5);
        return trimmed.length > 0 ? trimmed : FALLBACK_INVENTORY;
    } catch {
        return FALLBACK_INVENTORY;
    }
}

export async function Hero() {
    const inventory = await loadInventorySnippet();
    return <HeroClient inventory={inventory} />;
}
