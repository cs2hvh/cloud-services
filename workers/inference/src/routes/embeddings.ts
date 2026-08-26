/**
 * POST /v1/embeddings — disabled.
 *
 * This route used to forward to OpenRouter's /embeddings, which served the
 * three OpenAI embedding models in our catalog. When the platform moved to
 * Wokey as its single upstream, embeddings had nowhere to go: Wokey exposes
 * no /v1/embeddings endpoint, and its model list contains no embedding model
 * (verified against GET https://api.wokey.ai/v1/models — 33 models, all chat).
 *
 * So this returns a straight 503 rather than pretending. The alternative —
 * leaving the forward in place — would have produced an upstream 404 dressed
 * up as our error, which is a worse experience and a worse diagnostic.
 *
 * To bring embeddings back, pick a provider that actually serves them
 * (OpenAI direct is the obvious candidate; the key is already in .env as
 * OPENAI_API_KEY) and restore the forward against that provider. It is
 * deliberately not a one-line revert, because it needs a billing rate and a
 * credential decision, not just a base URL.
 *
 * Callers affected: the embedding models in inference.models are delisted in
 * the same migration that added this, so /v1/models no longer advertises
 * something that cannot be called.
 */
import type { Handler } from "hono";
import type { Env, HonoVariables } from "../types.ts";

export const embeddings: Handler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c) => {
  const requestId = c.get("requestId") ?? crypto.randomUUID();

  return c.json(
    {
      error: {
        message:
          "The embeddings API is not available. This platform's inference " +
          "upstream does not currently serve embedding models. Existing " +
          "vector collections are unaffected, but new embeddings cannot be " +
          "created until an embeddings provider is configured.",
        type: "service_unavailable",
        code: "embeddings_unavailable",
        request_id: requestId,
      },
    },
    503,
    { "X-Ahura-Request-Id": requestId }
  );
};
