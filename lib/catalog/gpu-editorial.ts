// Editorial copy for the GPU lineup — which SKUs the marketing page features,
// and the fixed silicon facts about each.
//
// Deliberately a plain module, not part of the "use client" page component: a
// value exported from a client module and imported by a server component
// becomes a client *reference*, not the object, so Object.entries() on it
// yields nothing and the lineup silently renders empty. That is exactly what
// happened when this lived in the component.
//
// Price and stock are NOT here — they come from lib/catalog/gpu, which runs
// the same resale function a pod is billed by.

export interface GpuEditorial {
  arch: string;
  archTier: "blackwell" | "hopper" | "ampere" | "ada";
  memoryType: string;
  perfFp8: string;
  bandwidth: string;
  featured?: boolean;
}

export const GPU_EDITORIAL: Record<
    string,
    GpuEditorial
> = {
    "b300-sxm6-ac-288": { arch: "Blackwell Ultra", archTier: "blackwell", memoryType: "HBM3e", perfFp8: "14 PFLOPS", bandwidth: "8 TB/s", featured: true },
    "b200-180": { arch: "Blackwell", archTier: "blackwell", memoryType: "HBM3e", perfFp8: "10 PFLOPS", bandwidth: "8 TB/s" },
    "h200-141": { arch: "Hopper", archTier: "hopper", memoryType: "HBM3e", perfFp8: "3,958 TFLOPS", bandwidth: "4.8 TB/s" },
    "h100-sxm-80": { arch: "Hopper", archTier: "hopper", memoryType: "HBM3", perfFp8: "3,958 TFLOPS", bandwidth: "3.35 TB/s" },
    "h100-nvl-94": { arch: "Hopper", archTier: "hopper", memoryType: "HBM3", perfFp8: "3,958 TFLOPS", bandwidth: "3.9 TB/s" },
    "a100-sxm4-80gb-80": { arch: "Ampere", archTier: "ampere", memoryType: "HBM2e", perfFp8: "312 TFLOPS bf16", bandwidth: "2 TB/s" },
    "l40s-48": { arch: "Ada Lovelace", archTier: "ada", memoryType: "GDDR6", perfFp8: "733 TFLOPS", bandwidth: "864 GB/s" },
};

// The four SKUs this rail features, and their accent colours. Price and stock
// are NOT here — they come from lib/catalog/gpu via the server component.
//
// This was a hardcoded array carrying both. It said B300 $6.99 while the GPU
// service page said $7.00 and a pod was actually charged $9.24, and its stock
// was a literal "high"/"low" that could never reflect reality. Two pages
// disagreeing with each other was the reported bug.
export const HERO_GPU_ACCENTS: Array<{ id: string; tone: string; tier: string; memoryType: string }> = [
    { id: "b300-sxm6-ac-288", memoryType: "HBM3e", tone: "#fbbf24", tier: "Blackwell" },
    { id: "b200-180", memoryType: "HBM3e", tone: "#a78bfa", tier: "Blackwell" },
    { id: "h200-141", memoryType: "HBM3e", tone: "#0095FF", tier: "Hopper" },
    { id: "h100-sxm-80", memoryType: "HBM3", tone: "#4ade80", tier: "Hopper" },
];
