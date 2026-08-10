import type { Metadata } from "next";

import { GpuServicePage } from "@/components/services/gpu-service-page";
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
 * The lineup is curated (GPU_EDITORIAL picks which SKUs to feature and carries
 * the silicon copy) but priced and stocked from the live catalog, which runs
 * the same resale function a pod is billed by.
 *
 * It used to be a hardcoded array in the component. Its prices had drifted far
 * from what customers were actually charged — H100 SXM advertised at $2.99
 * against $4.11, B200 at $5.49 against $8.49 — and its stock strings were
 * fixed literals that could never reflect reality.
 */
export default async function GpuHome() {
  let gpus: React.ComponentProps<typeof GpuServicePage>["gpus"] = [];

  try {
    const supabase = await createServiceClient();
    const catalog = await getPublicGpuCatalog(supabase);
    const byId = new Map(catalog.gpus.map((g) => [g.id, g]));

    // Editorial order decides what is shown; a curated SKU missing from the
    // catalog is skipped rather than rendered without a price.
    gpus = Object.entries(GPU_EDITORIAL).flatMap(([id, editorial]) => {
      const live = byId.get(id);
      if (!live) return [];
      return [{
        id: live.id,
        name: live.name,
        memory: `${live.memoryGB} GB`,
        pricePerHour: live.hourlyUSD,
        stock: live.stock,
        href: live.href,
        ...editorial,
      }];
    });
  } catch (error) {
    console.error("[services/gpu] catalog read failed:", error);
    // Leave the lineup empty rather than substituting numbers — a wrong price
    // on a public page is the failure this replaced.
  }

  return <GpuServicePage gpus={gpus} />;
}
