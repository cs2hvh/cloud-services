/**
 * Maps our internal model IDs (used in inference.models.model_id and on the
 * dashboard) to the actual HuggingFace model IDs that axolotl needs to
 * download.
 *
 * Our internal IDs follow the pattern `<vendor>/<lowercase-name>` (e.g.
 * `qwen/qwen-3-8b-instruct`). HF's actual repo names use mixed case and
 * different naming conventions (e.g. `Qwen/Qwen3-8B`).
 *
 * Keep this in sync with ALLOWED_FT_BASE_MODELS in
 * app/api/inference/fine-tuning/jobs/route.ts and with the dashboard's
 * model dropdown.
 */

/**
 * Per-base metadata. `gated` is whether HuggingFace requires manual
 * approval before downloading (true for all Meta + Google models as of
 * 2026-05). Gated models still work if HF_TOKEN belongs to an approved
 * account, but the training pod 403s at config.json fetch if not.
 */
export interface FtBaseModelInfo {
  hf_id: string;
  gated: boolean;
  /** Approx params for cost preview ("8B", "14B", "70B-MoE", "235B"). */
  size: string;
}

export const BASE_MODEL_INFO: Record<string, FtBaseModelInfo> = {
  "meta-llama/llama-4-scout":          { hf_id: "meta-llama/Llama-4-Scout-17B-16E-Instruct",    gated: true,  size: "17B-MoE" },
  "meta-llama/llama-4-maverick":       { hf_id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct",gated: true,  size: "17B-MoE" },
  "meta-llama/llama-3.3-70b-instruct": { hf_id: "meta-llama/Llama-3.3-70B-Instruct",            gated: true,  size: "70B" },
  // Llama 3.3 only ships at 70B — internal "8B" slot maps to Llama 3.1 8B,
  // the canonical small Meta open-weight at this scale.
  "meta-llama/llama-3.3-8b-instruct":  { hf_id: "meta-llama/Llama-3.1-8B-Instruct",             gated: true,  size: "8B" },
  "deepseek/deepseek-v3.2":            { hf_id: "deepseek-ai/DeepSeek-V3.2-Exp",                gated: false, size: "671B-MoE" },
  "qwen/qwen-3-235b-instruct":         { hf_id: "Qwen/Qwen3-235B-A22B",                         gated: false, size: "235B-MoE" },
  "qwen/qwen-3-32b-instruct":          { hf_id: "Qwen/Qwen3-32B",                               gated: false, size: "32B" },
  "qwen/qwen-3-14b-instruct":          { hf_id: "Qwen/Qwen3-14B",                               gated: false, size: "14B" },
  "qwen/qwen-3-8b-instruct":           { hf_id: "Qwen/Qwen3-8B",                                gated: false, size: "8B" },
  "mistralai/mistral-large-3":         { hf_id: "mistralai/Mistral-Large-Instruct-2411",        gated: false, size: "123B" },
  "mistralai/mistral-nemo":            { hf_id: "mistralai/Mistral-Nemo-Instruct-2407",         gated: false, size: "12B" },
  "microsoft/phi-4":                   { hf_id: "microsoft/phi-4",                              gated: false, size: "14B" },
  // Gemma 4 isn't released; internal "gemma-4-27b-it" slot maps to Gemma 3.
  "google/gemma-4-27b-it":             { hf_id: "google/gemma-3-27b-it",                        gated: true,  size: "27B" },
};

/** Translate internal ID → HF ID. Falls back to passthrough so a missing
 *  mapping fails loudly at HF (404) rather than silently misrouting. */
export function resolveHuggingFaceId(internalId: string): string {
  return BASE_MODEL_INFO[internalId]?.hf_id ?? internalId;
}
