/**
 * Endpoints retired by the move from OpenRouter to Wokey.
 *
 * Every route below was implemented against models that Wokey does not carry.
 * Some are obvious — Wokey serves no /embeddings and no /rerank at all.  The
 * rest are less obvious and worth spelling out, because the endpoint names
 * make them look independent when they are not: /ocr, /moderations,
 * /audio/speech, /audio/music and /audio/transcriptions are all implemented as
 * POSTs to /chat/completions driven by a specific multimodal model resolved
 * from inference.models. They break not because the path is missing upstream
 * but because the model behind them is:
 *
 *   /ocr                    google/gemini-2.5-flash        — no Google on Wokey
 *   /moderations            meta-llama/llama-guard-4-12b   — no Llama on Wokey
 *   /audio/speech           openai/gpt-audio-mini          — no audio models
 *   /audio/transcriptions   openai/gpt-audio-mini          — no audio models
 *   /audio/music            google/lyria-3-clip-preview    — no Google, no music
 *   /images/generations     google/gemini-2.5-flash-image  — see note below
 *   /videos                 alibaba/wan-2.6, kling, veo    — see note below
 *   /embeddings, /rerank    no such endpoint on Wokey
 *
 * Images and video are the salvageable pair: Wokey DOES serve image and video
 * generation (POST /v1/images/generations and POST /v1/videos both answer),
 * but with different model ids (gpt-image-2, jimeng-*, grok-imagine-*) and a
 * different request shape. Re-enabling them is a porting job, not a config
 * change, which is why they are retired here rather than quietly repointed.
 *
 * Returning 503 with a stable code is deliberate. The alternative — leaving
 * the routes wired to models that no longer resolve — produces a confusing
 * mixture of upstream 404s and null-model crashes, and bills nothing while
 * looking like an outage. This says plainly that the capability is gone.
 *
 * To restore any of these: give it a provider that serves the model, put that
 * model back in inference.models with a live upstream_model_id, and delete its
 * line from the retired list in index.ts.
 */
import type { Handler } from "hono";
import type { Env, HonoVariables } from "../types.ts";

export function retiredEndpoint(
  capability: string
): Handler<{ Bindings: Env; Variables: HonoVariables }> {
  return async (c) => {
    const requestId = c.get("requestId") ?? crypto.randomUUID();
    return c.json(
      {
        error: {
          message:
            `The ${capability} API is not currently available. This ` +
            `platform's inference provider does not serve the models this ` +
            `endpoint depends on. Chat completions, the Anthropic messages ` +
            `API and the responses API are unaffected.`,
          type: "service_unavailable",
          code: "capability_retired",
          request_id: requestId,
        },
      },
      503,
      { "X-Ahura-Request-Id": requestId }
    );
  };
}
