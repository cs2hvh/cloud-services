import type { Metadata } from "next";

import { GpuServicePage } from "@/components/services/gpu-service-page";
import type { LineupGpu } from "@/components/services/gpu-lineup";
import { GPU_EDITORIAL } from "@/lib/catalog/gpu-editorial";
import { getPublicGpuCatalog } from "@/lib/catalog/gpu";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "GPU Cloud for AI and ML",
  description:
    "Deploy GPU instances for model training, fine-tuning, and low-latency inference with premium NVIDIA and AMD capacity, fast NVMe, and production-ready networking.",
};

export const revalidate = 300;

/**
 * The lineup is priced and stocked from the live catalog, which runs the same
 * resale function a pod is billed by. GPU_EDITORIAL adds only the fixed
 * silicon facts (architecture, memory type, bandwidth, compute).
 *
 * It used to be a hardcoded array in the component. Its prices had drifted far
 * from what customers were actually charged — H100 SXM advertised at $2.99
 * against $4.11, B200 at $5.49 against $8.49 — and its stock strings were
 * fixed literals that could never reflect reality.
 *
 * Two rules decide what appears, both deliberate:
 *   - no live price, no row. Publishing a GPU we cannot quote sends someone
 *     into a deploy that has nothing to charge against.
 *   - no editorial entry, no row. A row with a blank architecture is worse
 *     than an absent one, and the gap is a prompt to add the specs.
 */
export default async function GpuHome() {
  let gpus: LineupGpu[] = [];
  let observedAt: string | null = null;
  let stockIsFresh = false;

  try {
    const supabase = await createServiceClient();
    const catalog = await getPublicGpuCatalog(supabase);
    observedAt = catalog.observedAt;
    stockIsFresh = catalog.stockIsFresh;

    gpus = catalog.gpus.flatMap((live) => {
      if (live.hourlyUSD === null) return [];
      const editorial = GPU_EDITORIAL[live.id];
      if (!editorial) return [];
      return [
        {
          ...editorial,
          id: live.id,
          name: live.name,
          memoryGB: live.memoryGB,
          pricePerHour: live.hourlyUSD,
          stock: live.stock,
          availableCounts: live.availableCounts,
          href: live.href,
        },
      ];
    });
  } catch (error) {
    console.error("[services/gpu] catalog read failed:", error);
    // Leave the lineup empty rather than substituting numbers — a wrong price
    // on a public page is the failure this replaced.
  }

  return (
    <GpuServicePage gpus={gpus} observedAt={observedAt} stockIsFresh={stockIsFresh} />
  );
}
