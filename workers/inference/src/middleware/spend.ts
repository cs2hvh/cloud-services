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
 *
 * Exemption (found live, 2026-07-18): agent-management operations (create/
 * list/update/delete an agent, mint/rotate/revoke its keys, MCP server and
 * knowledge-base CRUD) don't spend money themselves — only RUNNING an agent
 * does. An org that hit its hard cap must still be able to delete a
 * runaway agent or revoke a leaking key — the one thing that would let
 * them fix it — not get locked out of that too. See management-paths.ts
 * for why this can't just be "put those routes in a separate group"
 * instead — Hono doesn't scope `.use("*", ...)` per sub-app.
 */
import type { MiddlewareHandler } from "hono";
import type { Env, HonoVariables } from "../types.ts";
import { isManagementRequest } from "../lib/management-paths.ts";

export const spendCheckMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c, next) => {
  if (isManagementRequest(c.req.method, new URL(c.req.url).pathname)) {
    await next();
    return;
  }

  const auth = c.get("auth");
  const keyCap = auth.hardCapCents;
  const orgCap = auth.orgHardCapCents;
  if (!keyCap && !orgCap) {
    await next();
    return;
  }

  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const counterKey = `org:${auth.orgId}:month:${month}`;
  let currentRaw: string | null;
  try {
    currentRaw = await c.env.SPEND.get(counterKey);
  } catch (err) {
    // Fail OPEN on a KV outage: the usage consumer still enforces the cap
    // eventually, and we'd rather serve than hard-fail every request on an
    // infra blip. Log it so the outage is visible.
    console.error(
      JSON.stringify({
        level: "error",
        scope: "spend",
        message: "Spend counter unavailable; failing open",
        orgId: auth.orgId,
        keyId: auth.keyId,
        err: err instanceof Error ? err.message : String(err),
      })
    );
    await next();
    return;
  }
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
    // Visibility: a 402 hard-cap rejection is otherwise invisible to ops.
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "spend",
        message: "Hard cap reached",
        orgId: auth.orgId,
        keyId: auth.keyId,
        capScope: scope,
        spentCents: current,
        hardCapCents: cap,
        month,
      })
    );
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
