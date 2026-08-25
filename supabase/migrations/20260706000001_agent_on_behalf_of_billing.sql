-- Doc: nextstespsAI/11-agent-implementation-plan.md · found by the 2026-07-06 code
-- audit: agent-runner authenticates every model-turn call with one static
-- `ahu_...` API key (env var INFERENCE_PLATFORM_KEY on the runner side), so
-- inference.lookup_api_key resolves auth.orgId to whichever org owns THAT
-- key — every agent run across every customer bills its model tokens to
-- the platform's own internal org, never the customer running the agent.
-- This is a live misattribution, not a future gap.
--
-- Fix: flag that one key row as an internal-service identity. When a
-- flagged key is used together with a validated X-Ahura-On-Behalf-Of-Org
-- header, the gateway's auth middleware (see workers/inference/src/
-- middleware/auth.ts) attributes cost/caps to the asserted CUSTOMER org
-- instead of the key's own org. The org is validated via
-- inference.lookup_org_billing (below), not trusted blindly from the
-- header — an unknown org fails closed.
--
-- MANUAL STEP (not automatable from this migration — we don't know the key
-- id until you tell us which row is the one agent-runner's
-- INFERENCE_PLATFORM_KEY env var currently holds):
--
--   UPDATE inference.api_keys SET is_internal_service = TRUE WHERE id = '<key id>';
--
-- Until that UPDATE runs, this is a no-op: the key keeps behaving exactly as
-- it does today (resolves its own org, on-behalf-of header ignored).

ALTER TABLE inference.api_keys
  ADD COLUMN IF NOT EXISTS is_internal_service BOOLEAN NOT NULL DEFAULT FALSE;

-- Extend lookup_api_key to surface the new flag. Postgres won't let
-- CREATE OR REPLACE change a function's return column list, so drop first
-- (same pattern as 20260526000007 / 20260526000012) — safe, the old shape
-- is a strict subset and the only caller (the Worker) redeploys alongside
-- this migration.
DROP FUNCTION IF EXISTS inference.lookup_api_key(TEXT);

CREATE OR REPLACE FUNCTION inference.lookup_api_key(p_hash TEXT)
RETURNS TABLE (
  key_id                       UUID,
  org_id                       UUID,
  allowed_models               TEXT[],
  allowed_ip_cidrs             CIDR[],
  zdr_enabled                  BOOLEAN,
  monthly_budget_cents         BIGINT,
  hard_cap_cents               BIGINT,
  org_monthly_budget_cents     BIGINT,
  org_hard_cap_cents           BIGINT,
  semantic_cache_enabled       BOOLEAN,
  org_semantic_cache_threshold NUMERIC(3,2),
  rate_limit_rpm               INTEGER,
  is_internal_service          BOOLEAN,
  expires_at                   TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT k.id, k.org_id, k.allowed_models, k.allowed_ip_cidrs, k.zdr_enabled,
         k.monthly_budget_cents, k.hard_cap_cents,
         o.monthly_budget_cents AS org_monthly_budget_cents,
         o.hard_cap_cents       AS org_hard_cap_cents,
         k.semantic_cache_enabled,
         o.semantic_cache_threshold AS org_semantic_cache_threshold,
         k.rate_limit_rpm,
         k.is_internal_service,
         k.expires_at
  FROM inference.api_keys k
  JOIN inference.orgs     o ON o.id = k.org_id
  WHERE k.key_hash = p_hash
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > NOW());
$$;

GRANT EXECUTE ON FUNCTION inference.lookup_api_key TO service_role;

-- Org-keyed counterpart to lookup_api_key, used only once a request has
-- already resolved to an is_internal_service key: looks up the ASSERTED
-- target org's billing profile so on-behalf-of attribution isn't trusted
-- blindly from the header alone.
CREATE OR REPLACE FUNCTION inference.lookup_org_billing(p_org_id UUID)
RETURNS TABLE (
  org_id                       UUID,
  zdr_enabled                  BOOLEAN,
  org_monthly_budget_cents     BIGINT,
  org_hard_cap_cents           BIGINT,
  org_semantic_cache_threshold NUMERIC(3,2)
)
LANGUAGE sql STABLE AS $$
  SELECT o.id, o.zdr_default, o.monthly_budget_cents, o.hard_cap_cents,
         o.semantic_cache_threshold
  FROM inference.orgs o
  WHERE o.id = p_org_id;
$$;

GRANT EXECUTE ON FUNCTION inference.lookup_org_billing TO service_role;
