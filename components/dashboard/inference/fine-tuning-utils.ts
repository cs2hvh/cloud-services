/**
 * Pure, JSX-free helpers used by the fine-tuning UI. Extracted from
 * the monolithic fine-tuning.tsx so the main file is easier to navigate
 * and these can be unit-tested in isolation.
 *
 * Nothing here imports React or has side effects — safe to import from
 * both the client component and a future test runner.
 */

/**
 * Clean a GPU identifier for the customer. `gpu_sku` now carries the verbatim
 * RunPod gpuTypeId (e.g. "NVIDIA H100 80GB HBM3"); drop the vendor prefix so
 * the UI shows "H100 80GB HBM3". Legacy short SKUs ("A100-80GB") pass through.
 */
export function gpuLabel(gpu: string | null | undefined): string {
  if (!gpu) return "—";
  return gpu.replace(/^NVIDIA\s+/i, "").trim() || gpu;
}

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
