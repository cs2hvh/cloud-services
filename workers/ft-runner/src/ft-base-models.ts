/**
 * Maps our internal model IDs (used in inference.models.model_id and on the
 * dashboard) to the actual HuggingFace model IDs that axolotl needs to
 * download.
 *
 * Our internal IDs follow the pattern `<vendor>/<lowercase-name>` (e.g.
 * `qwen/qwen-3-8b-instruct`). HF's actual repo names use mixed case and
 * different naming conventions (e.g. `Qwen/Qwen3-8B`). When the dashboard
 * lets a user pick a base for fine-tuning, we store the internal ID; the
 * runner translates it here before passing BASE_MODEL into the training
 * container's env.
 *
 * If the internal ID has no mapping entry, we pass it through verbatim
 * (caller's responsibility) and axolotl will hit HF's 404 path on its own.
 *
 * Keep this in sync with ALLOWED_FT_BASE_MODELS in
 * app/api/inference/fine-tuning/jobs/route.ts.
 */

export const INTERNAL_TO_HF_MODEL_ID: Record<string, string> = {
  // ─── Llama 4 (Meta, 2025) ─────────────────────────────────────────
  "meta-llama/llama-4-scout": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  "meta-llama/llama-4-maverick": "meta-llama/Llama-4-Maverick-17B-128E-Instruct",

  // ─── Llama 3.x (Meta) ─────────────────────────────────────────────
  // Llama 3.3 only shipped a 70B SKU; the "8B" slot in our catalog maps
  // to Llama 3.1 8B Instruct which is still the canonical small Meta
  // open-weight at this scale.
  "meta-llama/llama-3.3-70b-instruct": "meta-llama/Llama-3.3-70B-Instruct",
  "meta-llama/llama-3.3-8b-instruct": "meta-llama/Llama-3.1-8B-Instruct",

  // ─── DeepSeek ─────────────────────────────────────────────────────
  "deepseek/deepseek-v3.2": "deepseek-ai/DeepSeek-V3.2-Exp",

  // ─── Qwen3 (Alibaba) ──────────────────────────────────────────────
  // Qwen3 dropped the "-Instruct" suffix in HF naming for the open
  // sizes; the "instruct" variant is the default repo.
  "qwen/qwen-3-235b-instruct": "Qwen/Qwen3-235B-A22B",
  "qwen/qwen-3-32b-instruct": "Qwen/Qwen3-32B",
  "qwen/qwen-3-14b-instruct": "Qwen/Qwen3-14B",
  "qwen/qwen-3-8b-instruct": "Qwen/Qwen3-8B",

  // ─── Mistral ──────────────────────────────────────────────────────
  // Mistral's "Large 3" is internal codename for Mistral-Large-Instruct-2411.
  "mistralai/mistral-large-3": "mistralai/Mistral-Large-Instruct-2411",
  "mistralai/mistral-nemo": "mistralai/Mistral-Nemo-Instruct-2407",

  // ─── Microsoft ────────────────────────────────────────────────────
  // phi-4 is the only entry where our internal ID already matches HF.
  "microsoft/phi-4": "microsoft/phi-4",

  // ─── Google ───────────────────────────────────────────────────────
  // Gemma 4 isn't out yet; the "gemma-4-27b-it" slot in our catalog
  // maps to Gemma 3 27B IT (the latest open Gemma at this scale).
  "google/gemma-4-27b-it": "google/gemma-3-27b-it",
};

/**
 * Translate our internal ID to the HF ID. If no mapping exists, returns
 * the internal ID as-is — caller can rely on axolotl/HF to surface a
 * clear 404 instead of us silently doing the wrong thing.
 */
export function resolveHuggingFaceId(internalId: string): string {
  return INTERNAL_TO_HF_MODEL_ID[internalId] ?? internalId;
}
