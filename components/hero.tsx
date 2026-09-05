// Marketing hero — AI-first, dark, restrained.

import HeroClient, {
    type GpuRow,
    type HeroAnnouncement,
    type HeroStats,
} from "./hero/hero-client";
import { HERO_GPU_ACCENTS } from "@/lib/catalog/gpu-editorial";
import { getPublicGpuCatalog } from "@/lib/catalog/gpu";
import { BARE_METAL_SKUS } from "@/lib/catalog/bare-metal";
import {
    HERO_ANNOUNCEMENTS,
    HERO_FEATURED_MODEL_ID,
    HERO_OFFER,
    HERO_REGIONS,
} from "@/lib/marketing/hero-announcements";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Everything with a number on it is read from the same source the product
 * pages read, on every render (the page revalidates every 300 s):
 *
 * - the GPU rail and the B300 announcement price: the shared GPU catalog,
 *   the same resale function a pod is billed by
 * - the dedicated-server floor: lib/catalog/bare-metal, the lineup's source
 * - "N models": inference.models where is_active
 *
 * A figure that cannot be read is left OUT, never invented: the rail renders
 * without the missing card, an announcement that asked for a live price is
 * dropped and logged, a stat that could not be counted is not shown. The
 * rail used to be a hardcoded array (B300 at $6.99 while the GPU page said
 * $7.00 and a pod was charged $9.24); two marketing pages disagreeing about a
 * price is the bug this file exists to prevent.
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

    // Live model count, and whether the featured model is actually live.
    let modelsLive: number | null = null;
    let featuredModelId = HERO_FEATURED_MODEL_ID;
    try {
        const supabase = await createServiceClient();
        const { count, error } = await supabase
            .schema("inference")
            .from("models")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true);
        if (error) throw error;
        modelsLive = count ?? null;

        // inference.models.model_id is the public id customers put on the
        // wire (e.g. zhipu/glm-5.3); `id` is the row's uuid.
        const { data: featured, error: featuredErr } = await supabase
            .schema("inference")
            .from("models")
            .select("model_id, is_active")
            .eq("model_id", HERO_FEATURED_MODEL_ID)
            .maybeSingle();
        if (featuredErr) throw featuredErr;
        if (!featured?.is_active) {
            // The configured model is not live. Show a model that is rather
            // than a request that would fail; say so in the log.
            const { data: first, error: firstErr } = await supabase
                .schema("inference")
                .from("models")
                .select("model_id")
                .eq("is_active", true)
                .eq("modality", "chat")
                .order("sort_order", { ascending: true })
                .limit(1)
                .maybeSingle();
            if (firstErr) throw firstErr;
            console.error(
                `[hero] featured model ${HERO_FEATURED_MODEL_ID} is not live; ` +
                (first ? `showing ${first.model_id} instead` : "no live chat model to show")
            );
            if (first) featuredModelId = first.model_id as string;
        }
    } catch (error) {
        console.error("[hero] inference.models read failed:", error);
        // modelsLive stays null: the "N models live" line is not rendered.
    }

    // Announcements: resolve the live figures, drop what cannot be resolved.
    const bareMetalFloor = BARE_METAL_SKUS.length
        ? Math.min(...BARE_METAL_SKUS.map((s) => s.priceMonthly))
        : null;

    const announcements: HeroAnnouncement[] = HERO_ANNOUNCEMENTS.flatMap((spec) => {
        if (!spec.live) return [{ label: spec.label, href: spec.href, tone: spec.tone }];
        if (spec.live.kind === "gpu") {
            const price = gpuPriceById.get(spec.live.id);
            if (price === undefined) {
                console.error(`[hero] announcement "${spec.label}" dropped: no live price for ${spec.live.id}`);
                return [];
            }
            return [{ label: `${spec.label} from $${price.toFixed(2)}/hr`, href: spec.href, tone: spec.tone }];
        }
        if (bareMetalFloor === null) {
            console.error(`[hero] announcement "${spec.label}" dropped: bare-metal catalog is empty`);
            return [];
        }
        return [{ label: `${spec.label} from $${bareMetalFloor}/mo`, href: spec.href, tone: spec.tone }];
    });

    const stats: HeroStats = { models: modelsLive, gpus: gpuCount, regions: HERO_REGIONS };

    return (
        <HeroClient
            gpus={gpus}
            announcements={announcements}
            offer={HERO_OFFER}
            stats={stats}
            featuredModelId={featuredModelId}
            modelsLive={modelsLive}
        />
    );
}
