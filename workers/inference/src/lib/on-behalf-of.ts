/**
 * On-behalf-of billing attribution (found missing by the 2026-07-06 audit).
 *
 * agent-runner is a plain Node process with no customer API key of its own —
 * it authenticates every gateway call with the single static
 * INFERENCE_PLATFORM_KEY. Without this module, that means every agent run's
 * model/tool cost attributes to whichever org owns THAT one key, never the
 * customer whose agent actually ran. This lets the trusted platform-key
 * caller assert a target org (via X-Ahura-On-Behalf-Of-Org), validated
 * against a real inference.orgs row rather than trusted blindly.
 */
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";

/** AuthContext.keyId for every on-behalf-of request is `obo:{orgId}` — unique
 *  per org (so rate-limiting stays per-org fair, not one shared global
 *  bucket) and prefix-detectable so internal-only routes can reject any
 *  request that didn't come through this path. */
const OBO_PREFIX = "obo:";

export function onBehalfOfKeyId(orgId: string): string {
  return `${OBO_PREFIX}${orgId}`;
}

export function isOnBehalfOf(keyId: string): boolean {
  return keyId.startsWith(OBO_PREFIX);
}

/** Sentinel apiKeyId stamped on synthetic on-behalf-of UsageEvents.
 *  inference.usage.api_key_id is a plain UUID column with no FK constraint
 *  (see 20260523000001), so this doesn't need to reference a real row — it
 *  just needs to be a stable, greppable marker distinguishing
 *  agent-runner-attributed usage from a real customer API key's traffic. */
export const OBO_API_KEY_ID = "00000000-0000-0000-0000-0000000000a9";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export interface OrgBilling {
  orgId: string;
  zdrEnabled: boolean;
  orgMonthlyBudgetCents: number | null;
  orgHardCapCents: number | null;
  orgSemanticCacheThreshold: number | null;
}

/** Org-keyed counterpart to lookup_api_key — returns null for an unknown org
 *  so the caller fails closed rather than fabricating a permissive default. */
export async function lookupOrgBilling(env: Env, orgId: string): Promise<OrgBilling | null> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-edge" } },
  });

  const { data, error } = await supabase
    .schema("inference")
    .rpc("lookup_org_billing", { p_org_id: orgId })
    .single<{
      org_id: string;
      zdr_enabled: boolean;
      org_monthly_budget_cents: number | null;
      org_hard_cap_cents: number | null;
      org_semantic_cache_threshold: number | string | null;
    }>();

  if (error || !data) return null;

  const rawThreshold = data.org_semantic_cache_threshold;
  const orgSemanticCacheThreshold =
    rawThreshold === null || rawThreshold === undefined
      ? null
      : typeof rawThreshold === "number"
        ? rawThreshold
        : Number.parseFloat(String(rawThreshold));

  return {
    orgId: data.org_id,
    zdrEnabled: data.zdr_enabled,
    orgMonthlyBudgetCents: data.org_monthly_budget_cents,
    orgHardCapCents: data.org_hard_cap_cents,
    orgSemanticCacheThreshold: Number.isFinite(orgSemanticCacheThreshold)
      ? orgSemanticCacheThreshold
      : null,
  };
}
