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
}

export const BASE_MODEL_INFO: Record<string, FtBaseModelInfo> = {
  "meta-llama/llama-4-scout":          { hf_id: "meta-llama/Llama-4-Scout-17B-16E-Instruct",    gated: true,  size: "17B-MoE" },
  "meta-llama/llama-4-maverick":       { hf_id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct",gated: true,  size: "17B-MoE" },
  "meta-llama/llama-3.3-70b-instruct": { hf_id: "meta-llama/Llama-3.3-70B-Instruct",            gated: true,  size: "70B" },
  "meta-llama/llama-3.3-8b-instruct":  { hf_id: "meta-llama/Llama-3.1-8B-Instruct",             gated: true,  size: "8B" },
  "deepseek/deepseek-v3.2":            { hf_id: "deepseek-ai/DeepSeek-V3.2-Exp",                gated: false, size: "671B-MoE" },
  "qwen/qwen-3-235b-instruct":         { hf_id: "Qwen/Qwen3-235B-A22B",                         gated: false, size: "235B-MoE" },
  "qwen/qwen-3-32b-instruct":          { hf_id: "Qwen/Qwen3-32B",                               gated: false, size: "32B" },
  "qwen/qwen-3-14b-instruct":          { hf_id: "Qwen/Qwen3-14B",                               gated: false, size: "14B" },
  "qwen/qwen-3-8b-instruct":           { hf_id: "Qwen/Qwen3-8B",                                gated: false, size: "8B" },
  "mistralai/mistral-large-3":         { hf_id: "mistralai/Mistral-Large-Instruct-2411",        gated: false, size: "123B" },
  "mistralai/mistral-nemo":            { hf_id: "mistralai/Mistral-Nemo-Instruct-2407",         gated: false, size: "12B" },
  "microsoft/phi-4":                   { hf_id: "microsoft/phi-4",                              gated: false, size: "14B" },
  "google/gemma-4-27b-it":             { hf_id: "google/gemma-3-27b-it",                        gated: true,  size: "27B" },
};

export function resolveHuggingFaceId(internalId: string): string {
  return BASE_MODEL_INFO[internalId]?.hf_id ?? internalId;
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
