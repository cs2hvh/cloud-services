/**
 * Pure, JSX-free helpers used by the fine-tuning UI. Extracted from
 * the monolithic fine-tuning.tsx so the main file is easier to navigate
 * and these can be unit-tested in isolation.
 *
 * Nothing here imports React or has side effects — safe to import from
 * both the client component and a future test runner.
 */

/**
 * Internal SKU → upstream catalog display name. Kept in sync with
 * lib/inference/finetune-runpod.ts GPU_SKU_TO_RUNPOD_TYPE; used by the
 * create-FT dialog to cross-reference live inventory rows.
 */
export const SKU_TO_RUNPOD_DISPLAY_NAME: Record<string, string> = {
  "A40": "NVIDIA A40",
  "L40S": "NVIDIA L40S",
  "RTX-6000-Ada": "NVIDIA RTX 6000 Ada Generation",
  "A100-40GB": "NVIDIA A100-PCIE-40GB",
  "A100-80GB": "NVIDIA A100 80GB PCIe",
  "H100-80GB": "NVIDIA H100 80GB HBM3",
};

/** Short workload hint shown next to each SKU in the picker. */
export const SKU_BLURB: Record<string, string> = {
  "A40": "budget tier",
  "L40S": "small qLoRA",
  "RTX-6000-Ada": "small jobs",
  "A100-40GB": "small LoRA, qLoRA",
  "A100-80GB": "large LoRA workhorse",
  "H100-80GB": "fastest, premium",
};

/** Where to request access for gated base models. We don't display the
 *  upstream brand name; just provide the link. */
export function approvalUrlFor(internalId: string): string | null {
  if (internalId.startsWith("meta-llama/")) {
    return `https://huggingface.co/meta-llama`;
  }
  if (internalId === "google/gemma-4-27b-it") {
    return `https://huggingface.co/google/gemma-3-27b-it`;
  }
  return null;
}

/** "Xs" / "Xm" / "Xh Ym" — compact runtime for a finished FT. */
export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/** "$X.XX" / "$X" / "—". Sub-dollar amounts keep 2 decimals for clarity. */
export function formatCents(c: number | null): string {
  if (c === null) return "—";
  if (c === 0) return "$0";
  if (c < 100) return `$${(c / 100).toFixed(2)}`;
  return `$${(c / 100).toFixed(0)}`;
}
