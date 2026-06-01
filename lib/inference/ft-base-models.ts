/**
 * Internal-id → HuggingFace-id mapping for FT base models, Next.js side.
 *
 * Mirrors workers/ft-runner/src/ft-base-models.ts (two copies because the
 * workspaces are separate: Next.js app vs k8s runner). Keep them in sync
 * by editing both files when bases change.
 *
 * Used by:
 * - the FT webhook handler when it provisions a serving endpoint
 *   (needs to pass BASE_MODEL=<hf-id> to the vLLM container)
 * - any future inference-side feature that needs to resolve internal IDs.
 */

export interface FtBaseModelInfo {
  hf_id: string;
  gated: boolean;
  size: string;
  /** False when the model can't be fine-tuned on a single GPU we offer
   *  (full weights — even for LoRA — exceed our largest card). */
  trainable: boolean;
  /** Minimum single-GPU VRAM (GB) to fine-tune this base, qLoRA being the
   *  lightest method. Conservative gate so a job can't OOM 8 min into a paid
   *  pod. Ignored when trainable === false. */
  minTrainGpuGb: number;
}

export const BASE_MODEL_INFO: Record<string, FtBaseModelInfo> = {
  "meta-llama/llama-4-scout":          { hf_id: "meta-llama/Llama-4-Scout-17B-16E-Instruct",    gated: true,  size: "17B-MoE",  trainable: true,  minTrainGpuGb: 80 },
  // ~400B total params across 128 experts — full weights exceed even a B200.
  "meta-llama/llama-4-maverick":       { hf_id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct",gated: true,  size: "17B-MoE",  trainable: false, minTrainGpuGb: 999 },
  "meta-llama/llama-3.3-70b-instruct": { hf_id: "meta-llama/Llama-3.3-70B-Instruct",            gated: true,  size: "70B",      trainable: true,  minTrainGpuGb: 80 },
  "meta-llama/llama-3.3-8b-instruct":  { hf_id: "meta-llama/Llama-3.1-8B-Instruct",             gated: true,  size: "8B",       trainable: true,  minTrainGpuGb: 24 },
  "deepseek/deepseek-v3.2":            { hf_id: "deepseek-ai/DeepSeek-V3.2-Exp",                gated: false, size: "671B-MoE", trainable: false, minTrainGpuGb: 999 },
  "qwen/qwen-3-235b-instruct":         { hf_id: "Qwen/Qwen3-235B-A22B",                         gated: false, size: "235B-MoE", trainable: false, minTrainGpuGb: 999 },
  "qwen/qwen-3-32b-instruct":          { hf_id: "Qwen/Qwen3-32B",                               gated: false, size: "32B",      trainable: true,  minTrainGpuGb: 48 },
  "qwen/qwen-3-14b-instruct":          { hf_id: "Qwen/Qwen3-14B",                               gated: false, size: "14B",      trainable: true,  minTrainGpuGb: 24 },
  "qwen/qwen-3-8b-instruct":           { hf_id: "Qwen/Qwen3-8B",                                gated: false, size: "8B",       trainable: true,  minTrainGpuGb: 24 },
  "mistralai/mistral-large-3":         { hf_id: "mistralai/Mistral-Large-Instruct-2411",        gated: false, size: "123B",     trainable: true,  minTrainGpuGb: 141 },
  "mistralai/mistral-nemo":            { hf_id: "mistralai/Mistral-Nemo-Instruct-2407",         gated: false, size: "12B",      trainable: true,  minTrainGpuGb: 24 },
  "microsoft/phi-4":                   { hf_id: "microsoft/phi-4",                              gated: false, size: "14B",      trainable: true,  minTrainGpuGb: 24 },
  "google/gemma-4-27b-it":             { hf_id: "google/gemma-3-27b-it",                        gated: true,  size: "27B",      trainable: true,  minTrainGpuGb: 48 },
};

export function resolveHuggingFaceId(internalId: string): string {
  return BASE_MODEL_INFO[internalId]?.hf_id ?? internalId;
}

export function ftBaseIsGated(internalId: string): boolean {
  return BASE_MODEL_INFO[internalId]?.gated ?? false;
}

/**
 * Verdict on whether a base model can be fine-tuned on a given GPU.
 *  - "ok": go ahead
 *  - "too-large": model can't fit any single GPU we offer (multi-GPU only)
 *  - "gpu-too-small": fits a bigger card, but not the one selected
 * `gpuMemoryGb` null (e.g. unknown legacy SKU) skips the per-GPU check.
 */
export function ftBaseGpuFit(
  internalId: string,
  gpuMemoryGb: number | null
): { ok: boolean; reason: "too-large" | "gpu-too-small" | null; minGpuGb: number; sizeLabel: string } {
  const info = BASE_MODEL_INFO[internalId];
  const minGpuGb = info?.minTrainGpuGb ?? 24;
  const sizeLabel = info?.size ?? "";
  if (info && !info.trainable) {
    return { ok: false, reason: "too-large", minGpuGb, sizeLabel };
  }
  if (gpuMemoryGb !== null && gpuMemoryGb < minGpuGb) {
    return { ok: false, reason: "gpu-too-small", minGpuGb, sizeLabel };
  }
  return { ok: true, reason: null, minGpuGb, sizeLabel };
}

/** Recommended serving GPU for this base size. Smaller models on cheaper
 *  GPUs to keep idle/cold cost low. */
export function recommendedServingGpu(internalId: string): "A40" | "A100-80GB" | "H100-80GB" {
  const size = BASE_MODEL_INFO[internalId]?.size ?? "";
  // MoE / 70B+ → needs big VRAM
  if (size.includes("MoE") || size.includes("70B") || size.includes("123B") || size.includes("235B") || size.includes("671B")) {
    return "H100-80GB";
  }
  // 27B-32B → A100-80GB
  if (size.includes("27B") || size.includes("32B")) {
    return "A100-80GB";
  }
  // 8B-14B → A40 (cheap, plenty for inference + 1 LoRA)
  return "A40";
}
