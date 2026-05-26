/**
 * Hard-cap spend check.
 *
 * Reads the current month's accumulated cents from KV and rejects the
 * request if EITHER cap is reached:
 *
 *   • Per-key cap   (auth.hardCapCents)        — set per-API-key in the
 *                                                 dashboard
 *   • Org-level cap (auth.orgHardCapCents)     — set on the org settings
 *                                                 page; enforces a ceiling
 *                                                 a single misconfigured
 *                                                 key can't blow past
 *
 * Effective cap = min(non-null values). Whichever fires first wins; the
 * error payload names which cap kicked so the customer knows where to
 * change it. Returns 402 before any upstream call so the customer isn't
 * billed for the rejection.
 *
 * The org KV counter itself is INCRBY'd from the usage-events consumer
 * once a request completes. We accept a small race at the boundary;
 * tightenable to a Durable Object reservation later if we cross ~10k RPS.
 */
import type { MiddlewareHandler } from "hono";
import type { Env, HonoVariables } from "../types.ts";

export const spendCheckMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c, next) => {
  const auth = c.get("auth");
  const keyCap = auth.hardCapCents;
  const orgCap = auth.orgHardCapCents;
  if (!keyCap && !orgCap) {
    await next();
    return;
  }

  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const counterKey = `org:${auth.orgId}:month:${month}`;
  const currentRaw = await c.env.SPEND.get(counterKey);
  const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
  if (!Number.isFinite(current)) {
    await next();
    return;
  }

  // Check the more-restrictive cap first so the error message names the
  // one the customer actually has to change.
  const orgHit = orgCap !== null && orgCap !== undefined && current >= orgCap;
  const keyHit = keyCap !== null && keyCap !== undefined && current >= keyCap;
  if (orgHit || keyHit) {
    const scope: "org" | "key" =
      orgHit && keyHit
        ? // Both hit — name the lower one so raising it actually helps
          (orgCap! <= keyCap! ? "org" : "key")
        : orgHit
          ? "org"
          : "key";
    const cap = scope === "org" ? orgCap! : keyCap!;
    const where =
      scope === "org"
        ? "the organization's monthly hard cap"
        : "this API key's monthly hard cap";
    return c.json(
      {
        error: {
          message:
            `Reached ${where} of ${(cap / 100).toFixed(2)} USD for ${month}. ` +
            (scope === "org"
              ? "Raise the org cap on the Inference Settings page, or wait for the next billing period."
              : "Raise this key's cap on the API Keys page, or use a different key."),
          type: "billing_error",
          code: scope === "org" ? "org_hard_cap_reached" : "hard_cap_reached",
          scope,
          spent_cents: current,
          hard_cap_cents: cap,
        },
      },
      402
    );
  }

  await next();
};
