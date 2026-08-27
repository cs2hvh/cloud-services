// Editorial copy for the GPU lineup — the fixed silicon facts about each SKU
// we sell, keyed by catalog id.
//
// Deliberately a plain module, not part of the "use client" page component: a
// value exported from a client module and imported by a server component
// becomes a client *reference*, not the object, so Object.entries() on it
// yields nothing and the lineup silently renders empty. That is exactly what
// happened when this lived in the component.
//
// Price and stock are NOT here — they come from lib/catalog/gpu, which runs
// the same resale function a pod is billed by.
//
// `bandwidth` and `perfFp8` are optional on purpose. A blank cell in the
// lineup table is honest; a plausible-looking number nobody checked against a
// vendor sheet is the failure this file exists to avoid. Fill them in as they
// are verified rather than estimating.

export interface GpuEditorial {
  /** Marketing-facing architecture name, e.g. "Blackwell Ultra". */
  arch: string;
  /** Family the lineup groups and filters by. */
  archTier: "blackwell" | "hopper" | "ampere" | "ada" | "cdna";
  memoryType: string;
  /** Vendor peak memory bandwidth. Omit when unverified. */
  bandwidth?: string;
  /** Dense FP8 tensor throughput unless the string says otherwise. Omit when unverified. */
  perfFp8?: string;
  /** Workloads this SKU is a sensible pick for. Drives the "pick by job" filter. */
  bestFor: WorkloadKey[];
  featured?: boolean;
}

export type WorkloadKey =
  | "training"
  | "fine-tuning"
  | "inference"
  | "diffusion"
  | "dev";

/** The job-first entry point into the lineup, ordered heaviest to lightest. */
export const WORKLOADS: Array<{ key: WorkloadKey; label: string; hint: string }> = [
  { key: "training", label: "Training", hint: "Pretraining and full-parameter runs" },
  { key: "fine-tuning", label: "Fine-tuning", hint: "LoRA, QLoRA, RLHF" },
  { key: "inference", label: "Inference", hint: "Serving models at throughput" },
  { key: "diffusion", label: "Diffusion & vision", hint: "SDXL, FLUX, encoders" },
  { key: "dev", label: "Dev & prototyping", hint: "Notebooks and small jobs" },
];

export const GPU_EDITORIAL: Record<string, GpuEditorial> = {
  // ── Blackwell ────────────────────────────────────────────────
  "b300-sxm6-ac-288": { arch: "Blackwell Ultra", archTier: "blackwell", memoryType: "HBM3e", bandwidth: "8 TB/s", perfFp8: "14 PFLOPS", bestFor: ["training", "fine-tuning"], featured: true },
  "b200-180": { arch: "Blackwell", archTier: "blackwell", memoryType: "HBM3e", bandwidth: "8 TB/s", perfFp8: "10 PFLOPS", bestFor: ["training", "fine-tuning"] },
  "rtx-pro-6000-blackwell-server-edition-96": { arch: "Blackwell", archTier: "blackwell", memoryType: "GDDR7", bandwidth: "1.79 TB/s", bestFor: ["inference", "diffusion"] },
  "rtx-pro-6000-blackwell-server-edition-mig-2g-48gb-48": { arch: "Blackwell MIG", archTier: "blackwell", memoryType: "GDDR7", bestFor: ["inference", "diffusion"] },
  "rtx-pro-6000-blackwell-server-edition-mig-1g-24gb-24": { arch: "Blackwell MIG", archTier: "blackwell", memoryType: "GDDR7", bestFor: ["inference", "dev"] },
  "rtx-pro-4500-blackwell-server-edition-32": { arch: "Blackwell", archTier: "blackwell", memoryType: "GDDR7", bestFor: ["diffusion", "dev"] },
  "rtx-pro-4500-blackwell-32": { arch: "Blackwell", archTier: "blackwell", memoryType: "GDDR7", bestFor: ["diffusion", "dev"] },
  "rtx-pro-4000-blackwell-24": { arch: "Blackwell", archTier: "blackwell", memoryType: "GDDR7", bestFor: ["dev", "diffusion"] },
  "geforce-rtx-5090-32": { arch: "Blackwell", archTier: "blackwell", memoryType: "GDDR7", bandwidth: "1.79 TB/s", bestFor: ["diffusion", "inference", "dev"] },

  // ── Hopper ───────────────────────────────────────────────────
  "h200-141": { arch: "Hopper", archTier: "hopper", memoryType: "HBM3e", bandwidth: "4.8 TB/s", perfFp8: "3,958 TFLOPS", bestFor: ["training", "fine-tuning", "inference"] },
  "h100-sxm-80": { arch: "Hopper", archTier: "hopper", memoryType: "HBM3", bandwidth: "3.35 TB/s", perfFp8: "3,958 TFLOPS", bestFor: ["training", "fine-tuning", "inference"] },
  "h100-nvl-94": { arch: "Hopper", archTier: "hopper", memoryType: "HBM3", bandwidth: "3.9 TB/s", perfFp8: "3,958 TFLOPS", bestFor: ["fine-tuning", "inference"] },

  // ── Ada Lovelace ─────────────────────────────────────────────
  "l40s-48": { arch: "Ada Lovelace", archTier: "ada", memoryType: "GDDR6", bandwidth: "864 GB/s", perfFp8: "733 TFLOPS", bestFor: ["inference", "diffusion"] },
  "geforce-rtx-4090-24": { arch: "Ada Lovelace", archTier: "ada", memoryType: "GDDR6X", bandwidth: "1.01 TB/s", bestFor: ["diffusion", "dev"] },
  "l4-24": { arch: "Ada Lovelace", archTier: "ada", memoryType: "GDDR6", bandwidth: "300 GB/s", bestFor: ["inference", "dev"] },
  "rtx-2000-ada-generation-16": { arch: "Ada Lovelace", archTier: "ada", memoryType: "GDDR6", bandwidth: "224 GB/s", bestFor: ["dev"] },

  // ── Ampere ───────────────────────────────────────────────────
  "a100-sxm4-80gb-80": { arch: "Ampere", archTier: "ampere", memoryType: "HBM2e", bandwidth: "2 TB/s", perfFp8: "312 TFLOPS bf16", bestFor: ["training", "fine-tuning"] },
  "rtx-a6000-48": { arch: "Ampere", archTier: "ampere", memoryType: "GDDR6", bandwidth: "768 GB/s", bestFor: ["fine-tuning", "diffusion"] },
  "a40-48": { arch: "Ampere", archTier: "ampere", memoryType: "GDDR6", bandwidth: "696 GB/s", bestFor: ["inference", "diffusion"] },
  "geforce-rtx-3090-24": { arch: "Ampere", archTier: "ampere", memoryType: "GDDR6X", bandwidth: "936 GB/s", bestFor: ["dev", "diffusion"] },

  // ── CDNA (AMD) ───────────────────────────────────────────────
  // Note: gpu_catalog.vendor says "nvidia" for this row. That is a data bug in
  // the catalog, not a claim this page makes — the class is read from here.
  "amd-instinct-mi300x-oam-192": { arch: "CDNA 3", archTier: "cdna", memoryType: "HBM3", bandwidth: "5.3 TB/s", perfFp8: "1,307 TFLOPS", bestFor: ["inference", "fine-tuning"] },
};

/** Display order and label for each family in the lineup. */
export const ARCH_FAMILIES: Array<{
  key: GpuEditorial["archTier"];
  label: string;
  blurb: string;
  /** Drives the class chip and the memory bar so a family reads by colour. */
  tone: string;
}> = [
  { key: "blackwell", label: "Blackwell", tone: "#a78bfa", blurb: "Current generation. Frontier training and the highest inference throughput per node." },
  { key: "hopper", label: "Hopper", tone: "#0095FF", blurb: "The production workhorse for fine-tuning and large-model serving." },
  { key: "ada", label: "Ada Lovelace", tone: "#f5b324", blurb: "Cost-efficient inference, diffusion, and vision workloads." },
  { key: "ampere", label: "Ampere", tone: "#35d07f", blurb: "Proven capacity for training, batch jobs, and long-running experiments." },
  { key: "cdna", label: "AMD CDNA", tone: "#ff6b5a", blurb: "High-VRAM alternative for memory-bound inference on ROCm." },
];

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
