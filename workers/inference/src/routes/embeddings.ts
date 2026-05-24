/**
 * POST /v1/embeddings — OpenAI-compatible.
 * Phase 0 stub; landing in Phase 4 (Embeddings + Vector).
 */
import type { Handler } from "hono";
import type { Env, HonoVariables } from "../types.ts";

export const embeddings: Handler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c) => {
  return c.json(
    {
      error: {
        message: "Embeddings ship in Phase 4.",
        type: "not_implemented",
        code: "phase_0_stub",
        request_id: c.get("requestId"),
      },
    },
    501
  );
};
