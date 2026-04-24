import type { Metadata } from "next";

import { GpuServicePage } from "@/components/services/gpu-service-page";
import { Products } from "@/lib/supabase/queries/products";

export const metadata: Metadata = {
  title: "GPU Cloud for AI and ML",
  description:
    "Deploy GPU instances for model training, fine-tuning, and low-latency inference with premium NVIDIA and AMD capacity, fast NVMe, and production-ready networking.",
};

export const revalidate = 300;

export default async function GpuHome() {
  const featuredProducts = await Products.get_featured_by_service_type("gpu");

  return <GpuServicePage featuredProducts={featuredProducts} />;
}
