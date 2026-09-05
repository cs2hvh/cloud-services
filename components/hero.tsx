// Marketing hero — AI-first, dark, restrained.

import HeroClient, {
    type GpuRow,
    type HeroAd,
    type HeroStats,
    type HeroTile,
} from "./hero/hero-client";
import { HERO_GPU_ACCENTS } from "@/lib/catalog/gpu-editorial";
import { getPublicGpuCatalog } from "@/lib/catalog/gpu";
import { BARE_METAL_SKUS } from "@/lib/catalog/bare-metal";
import {
    HERO_ADS,
    HERO_AD_SECONDS,
    HERO_OFFER,
    HERO_REGIONS,
    HERO_TILES,
    type HeroLive,
} from "@/lib/marketing/hero-announcements";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Everything with a number on it is read from the same source the product
 * pages read, on every render (the page revalidates every 300 s):
 *
 * - the GPU rail, the B300 plate and tile: the shared GPU catalog, the same
 *   resale function a pod is billed by
 * - the dedicated-server count and floor: lib/catalog/bare-metal
 * - "N models": inference.models where is_active, which is also what decides
 *   whether an announcement that names a model is shown at all
 *
 * A figure that cannot be read is left OUT, never invented: the rail renders
 * without the missing card, an item that asked for a live figure is dropped
 * and logged, a stat that could not be counted is not shown. The rail used
 * to be a hardcoded array (B300 at $6.99 while the GPU page said $7.00 and a
 * pod was charged $9.24); two marketing pages disagreeing about a price is
 * the bug this file exists to prevent.
 */
export async function Hero() {
    let gpus: GpuRow[] = [];
    let gpuCount: number | null = null;
    let gpuPriceById = new Map<string, number>();

    try {
        const supabase = await createServiceClient();
        const catalog = await getPublicGpuCatalog(supabase);
        const byId = new Map(catalog.gpus.map((g) => [g.id, g]));
        gpuCount = catalog.gpus.length;
        gpuPriceById = new Map(
            catalog.gpus.flatMap((g) => (g.hourlyUSD === null ? [] : [[g.id, g.hourlyUSD] as [string, number]]))
        );

        gpus = HERO_GPU_ACCENTS.flatMap((accent) => {
            const live = byId.get(accent.id);
            if (!live) return [];
            return [{
                id: live.id,
                name: live.name,
                memory: live.memoryGB,
                gen: accent.memoryType,
                price: live.hourlyUSD,
                stock: live.stock,
                href: live.href,
                tone: accent.tone,
                tier: accent.tier,
            }];
        });
    } catch (error) {
        console.error("[hero] GPU catalog read failed:", error);
        // Render the hero without the rail rather than with invented numbers.
    }

    // Live models: the count, and the set of public ids that are switched on.
    // inference.models.model_id is the id customers put on the wire.
    let modelsLive: number | null = null;
    let liveModelIds: Set<string> | null = null;
    try {
        const supabase = await createServiceClient();
        const { data, error } = await supabase
            .schema("inference")
            .from("models")
            .select("model_id")
            .eq("is_active", true);
        if (error) throw error;
        liveModelIds = new Set((data ?? []).map((m) => m.model_id as string));
        modelsLive = liveModelIds.size;
    } catch (error) {
        console.error("[hero] inference.models read failed:", error);
        // modelsLive stays null and items that require a model are dropped.
    }

    const bareMetalCount = BARE_METAL_SKUS.length;
    const bareMetalFloor = bareMetalCount ? Math.min(...BARE_METAL_SKUS.map((s) => s.priceMonthly)) : null;

    /** The live suffix for an item, or null when it cannot be resolved. */
    const resolveLive = (live: HeroLive, forBody: boolean): string | null => {
        if (live.kind === "gpu") {
            const price = gpuPriceById.get(live.id);
            if (price === undefined) return null;
            return forBody ? ` From $${price.toFixed(2)}/hr.` : ` from $${price.toFixed(2)}/hr`;
        }
        if (bareMetalFloor === null) return null;
        return forBody
            ? ` ${bareMetalCount} configurations from $${bareMetalFloor}/mo.`
            : `: ${bareMetalCount} configurations from $${bareMetalFloor}/mo`;
    };

    const ads: HeroAd[] = HERO_ADS.flatMap((spec) => {
        if (spec.requiresModel) {
            if (!liveModelIds?.has(spec.requiresModel)) {
                console.error(`[hero] plate item "${spec.eyebrow}" dropped: model ${spec.requiresModel} is not live`);
                return [];
            }
        }
        let body = spec.body;
        if (spec.live) {
            const suffix = resolveLive(spec.live, true);
            if (suffix === null) {
                console.error(`[hero] plate item "${spec.eyebrow}" dropped: live figure unavailable`);
                return [];
            }
            body = spec.body + suffix;
        }
        return [{
            eyebrow: spec.eyebrow,
            title: spec.title,
            body,
            primary: spec.primary,
            secondary: spec.secondary ?? null,
            tone: spec.tone,
        }];
    });

    const tiles: HeroTile[] = HERO_TILES.flatMap((spec) => {
        let value = spec.label;
        if (spec.live) {
            const suffix = resolveLive(spec.live, false);
            if (suffix === null) {
                console.error(`[hero] tile "${spec.eyebrow}" dropped: live figure unavailable`);
                return [];
            }
            value = spec.label + suffix;
        }
        return [{ eyebrow: spec.eyebrow, value, href: spec.href, tone: spec.tone }];
    });

    const stats: HeroStats = { models: modelsLive, gpus: gpuCount, regions: HERO_REGIONS };

    return (
        <HeroClient
            gpus={gpus}
            ads={ads}
            adSeconds={HERO_AD_SECONDS}
            tiles={tiles}
            offer={HERO_OFFER}
            stats={stats}
        />
    );
}
