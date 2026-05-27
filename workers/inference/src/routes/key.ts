/**
 * GET /v1/key — returns the calling key's identity, scopes, and usage snapshot.
 * Useful for SDKs to fetch budget remaining without scraping the dashboard.
 */
import type { Handler } from "hono";
import type { Env, HonoVariables } from "../types.ts";

export const keyInfo: Handler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c) => {
  const auth = c.get("auth");

  // Current month spend (best-effort read from KV; not authoritative)
  const month = new Date().toISOString().slice(0, 7);
  const spendKey = `org:${auth.orgId}:month:${month}`;
  const raw = await c.env.SPEND.get(spendKey);
  const spentCents = raw ? Number.parseInt(raw, 10) : 0;

  return c.json({
    key_id: auth.keyId,
    org_id: auth.orgId,
    zdr_enabled: auth.zdrEnabled,
    allowed_models: auth.allowedModels,
    billing: auth.billing,
    usage: {
      month,
      spent_cents: Number.isFinite(spentCents) ? spentCents : 0,
      monthly_budget_cents: auth.monthlyBudgetCents,
      hard_cap_cents: auth.hardCapCents,
    },
  });
};
