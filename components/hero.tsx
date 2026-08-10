// Marketing hero — GPU-forward, dark, restrained.

import HeroClient, { type GpuRow } from "./hero/hero-client";
import { HERO_GPU_ACCENTS } from "@/lib/catalog/gpu-editorial";
import { getPublicGpuCatalog } from "@/lib/catalog/gpu";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The hero's GPU rail is priced and stocked from the shared catalog, the same
 * source as /services/gpu, /pricing and the deploy wizard.
 *
 * It used to be a hardcoded array in hero-client: B300 at $6.99 while the GPU
 * service page said $7.00 and a pod was charged $9.24, with stock as a literal
 * "high"/"low". Two marketing pages disagreeing with each other about GPU
 * availability and price is the reported bug this closes.
 */
export async function Hero() {
    let gpus: GpuRow[] = [];

    try {
        const supabase = await createServiceClient();
        const catalog = await getPublicGpuCatalog(supabase);
        const byId = new Map(catalog.gpus.map((g) => [g.id, g]));

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

    return <HeroClient gpus={gpus} />;
}
