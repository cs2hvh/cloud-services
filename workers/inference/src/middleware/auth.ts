/**
 * API key authentication.
 *
 * Flow:
 *   1. Pull bearer token from Authorization header (or x-api-key fallback)
 *   2. sha256 → hex; look up in KV (hot cache)
 *   3. KV miss → look up in Postgres via service-role RPC; backfill KV with 5-min TTL
 *   4. Apply IP allowlist / expiry / model-scope checks
 *   5. Attach resolved AuthContext to c.var.auth
 *
 * Phase 0: KV path stubbed (always misses); Postgres lookup wired.
 * Phase 1: enable KV warm path, add per-region replication semantics.
 */
import type { MiddlewareHandler } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { AuthContext, Env, HonoVariables } from "../types.ts";

const KEY_CACHE_TTL_SECONDS = 300; // 5 min

export const authMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c, next) => {
  const token = extractToken(c.req.header("Authorization"), c.req.header("x-api-key"));
  if (!token) {
    return unauth(c, "Missing API key");
  }
  if (!token.startsWith("ahu_")) {
    return unauth(c, "Malformed API key");
  }

  const hash = await sha256Hex(token);

  // 1. KV hot path
  const cached = await c.env.API_KEYS.get<CachedKey>(hash, "json");
  let resolved: CachedKey | null = cached;

  // 2. Postgres fallback
  if (!resolved) {
    resolved = await lookupInPostgres(c.env, hash);
    if (resolved) {
      // Best-effort write-through; ignore failure (KV is a cache, not source of truth)
      c.executionCtx.waitUntil(
        c.env.API_KEYS.put(hash, JSON.stringify(resolved), {
          expirationTtl: KEY_CACHE_TTL_SECONDS,
        })
      );
    }
  }

  if (!resolved) {
    return unauth(c, "Invalid API key");
  }
  if (resolved.expiresAt && new Date(resolved.expiresAt) <= new Date()) {
    return unauth(c, "API key expired");
  }

  // 3. IP allowlist
  if (resolved.allowedIpCidrs && resolved.allowedIpCidrs.length > 0) {
    const ip = c.req.header("CF-Connecting-IP");
    if (!ip || !ipMatchesAny(ip, resolved.allowedIpCidrs)) {
      return unauth(c, "Source IP not permitted for this key");
    }
  }

  // 4. Billing election
  const billingHeader = c.req.header("X-Ahura-Billing")?.toLowerCase();
  const billing: AuthContext["billing"] = billingHeader === "byok" ? "byok" : "platform";
  const byokProvider = c.req.header("X-Ahura-BYOK-Provider")?.toLowerCase() as
    | AuthContext["byokProvider"]
    | undefined;

  const auth: AuthContext = {
    keyId: resolved.keyId,
    orgId: resolved.orgId,
    allowedModels: resolved.allowedModels,
    allowedIpCidrs: resolved.allowedIpCidrs,
    zdrEnabled: resolved.zdrEnabled,
    monthlyBudgetCents: resolved.monthlyBudgetCents,
    hardCapCents: resolved.hardCapCents,
    orgMonthlyBudgetCents: resolved.orgMonthlyBudgetCents,
    orgHardCapCents: resolved.orgHardCapCents,
    semanticCacheEnabled: resolved.semanticCacheEnabled,
    orgSemanticCacheThreshold: resolved.orgSemanticCacheThreshold,
    rateLimitRpm: resolved.rateLimitRpm,
    billing,
    byokProvider,
  };
  c.set("auth", auth);
  await next();
};

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

interface CachedKey {
  keyId: string;
  orgId: string;
  allowedModels: string[] | null;
  allowedIpCidrs: string[] | null;
  zdrEnabled: boolean;
  monthlyBudgetCents: number | null;
  hardCapCents: number | null;
  orgMonthlyBudgetCents: number | null;
  orgHardCapCents: number | null;
  semanticCacheEnabled: boolean;
  orgSemanticCacheThreshold: number | null;
  rateLimitRpm: number | null;
  expiresAt: string | null;
}

function extractToken(authHeader: string | undefined, xApiKey: string | undefined): string | null {
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();
  if (xApiKey) return xApiKey.trim();
  return null;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function lookupInPostgres(env: Env, hash: string): Promise<CachedKey | null> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-edge" } },
  });

  const { data, error } = await supabase
    .schema("inference")
    .rpc("lookup_api_key", { p_hash: hash })
    .single<{
      key_id: string;
      org_id: string;
      allowed_models: string[] | null;
      allowed_ip_cidrs: string[] | null;
      zdr_enabled: boolean;
      monthly_budget_cents: number | null;
      hard_cap_cents: number | null;
      org_monthly_budget_cents: number | null;
      org_hard_cap_cents: number | null;
      semantic_cache_enabled: boolean;
      org_semantic_cache_threshold: number | string | null;
      rate_limit_rpm: number | null;
      expires_at: string | null;
    }>();

  if (error || !data) return null;

  // pg NUMERIC comes back as string in PostgREST JSON — coerce here
  // so the worker can treat it as a plain number downstream.
  const rawThreshold = data.org_semantic_cache_threshold;
  const orgSemanticCacheThreshold =
    rawThreshold === null || rawThreshold === undefined
      ? null
      : typeof rawThreshold === "number"
        ? rawThreshold
        : Number.parseFloat(String(rawThreshold));

  return {
    keyId: data.key_id,
    orgId: data.org_id,
    allowedModels: data.allowed_models,
    allowedIpCidrs: data.allowed_ip_cidrs,
    zdrEnabled: data.zdr_enabled,
    monthlyBudgetCents: data.monthly_budget_cents,
    hardCapCents: data.hard_cap_cents,
    orgMonthlyBudgetCents: data.org_monthly_budget_cents,
    orgHardCapCents: data.org_hard_cap_cents,
    semanticCacheEnabled: data.semantic_cache_enabled ?? false,
    orgSemanticCacheThreshold: Number.isFinite(orgSemanticCacheThreshold)
      ? orgSemanticCacheThreshold
      : null,
    rateLimitRpm: data.rate_limit_rpm ?? null,
    expiresAt: data.expires_at,
  };
}

function ipMatchesAny(ip: string, cidrs: string[]): boolean {
  // Phase 0 stub. Replace with a real CIDR matcher in Phase 1 — Workers don't
  // ship a CIDR lib, but a lightweight implementation is ~30 lines.
  return cidrs.includes(ip) || cidrs.some((c) => c === `${ip}/32`);
}

function unauth(c: Parameters<MiddlewareHandler>[0], message: string) {
  return c.json(
    {
      error: {
        message,
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    },
    401
  );
}
