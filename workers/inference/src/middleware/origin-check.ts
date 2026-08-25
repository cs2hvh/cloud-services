/**
 * Origin enforcement for public-tier keys (doc: manager ask 2026-07-08).
 *
 * The gateway's CORS middleware is wide open (`origin: "*"` in index.ts) for
 * every route, and always has been — CORS was never a real security boundary
 * here (it's browser-enforced only; a non-browser client ignores it
 * entirely). A public key is designed to be safe to leak, the way a Stripe
 * `pk_` key is: not because of CORS, but because of what it's allowed to do
 * (one agent only, redacted responses) plus this explicit, server-side check
 * that the request actually came from a domain the customer approved.
 *
 * A private key is untouched by this — no-op, exactly as before.
 */
import type { MiddlewareHandler } from "hono";
import type { Env, HonoVariables } from "../types.ts";
import { gatewayError } from "../lib/gateway.ts";

export const originCheckMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c, next) => {
  const auth = c.get("auth");
  if (auth.keyTier !== "public") return next(); // private key — no restriction

  const requestId = c.get("requestId");
  const origin = c.req.header("Origin");
  const allowed = auth.allowedOrigins ?? [];

  // DB CHECK (chk_public_key_has_origins) guarantees allowed.length > 0 for
  // any public key, so an empty list here means data got here some other
  // way (e.g. a stale KV cache entry from before the column existed) —
  // fail closed either way.
  if (!origin || !allowed.includes(origin)) {
    return c.json(
      gatewayError(
        "This public key is restricted to specific origins and the request's Origin header didn't match",
        "invalid_request_error",
        "origin_not_allowed",
        requestId
      ),
      403
    );
  }

  return next();
};
