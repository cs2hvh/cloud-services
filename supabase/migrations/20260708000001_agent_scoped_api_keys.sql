-- Doc: manager ask (2026-07-08) — "add access key for agent": a customer
-- should be able to hand out a key that only runs ONE specific agentcore
-- agent, for external/commercial distribution, instead of a full-access
-- platform key that can run every agent in the org plus hit every other
-- inference endpoint (chat completions, images, embeddings, ...).
--
-- The full create -> poll/stream -> cancel lifecycle for calling an agent
-- externally already works today via inference.api_keys + the existing
-- POST /v1/agents/:id/runs, GET /v1/agents/runs/:id(/stream), POST
-- /v1/agents/runs/:id/cancel routes (workers/inference/src/routes/
-- responses.ts + agent-runs.ts) — this migration only adds the missing
-- SCOPE restriction on top of that already-working key system, rather than
-- building a second, parallel key system (the older `agents.agent_api_keys`
-- table already has that shape for the separate legacy ai-agents product;
-- this stays independent of it).

ALTER TABLE inference.api_keys
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agentcore.agents(id) ON DELETE CASCADE;
-- NULL (default) = today's behavior, an unrestricted org-wide key.
-- Set = the gateway's agentScopeMiddleware restricts this key to running
-- and reading only that one agent's runs. ON DELETE CASCADE (not SET NULL):
-- a key scoped to a deleted agent has no reason to keep working, and
-- SET NULL would silently upgrade a scoped key into a full-access key —
-- a real privilege-escalation bug, not just a dangling reference.

CREATE INDEX IF NOT EXISTS idx_api_keys_agent
  ON inference.api_keys (agent_id) WHERE agent_id IS NOT NULL;

-- Extend lookup_api_key to surface the new scope. Postgres won't let
-- CREATE OR REPLACE change a function's return column list, so drop first
-- (same pattern as 20260526000007 / 20260526000012 / 20260706000001).
DROP FUNCTION IF EXISTS inference.lookup_api_key(TEXT);

CREATE OR REPLACE FUNCTION inference.lookup_api_key(p_hash TEXT)
RETURNS TABLE (
  key_id                       UUID,
  org_id                       UUID,
  agent_id                     UUID,
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
  SELECT k.id, k.org_id, k.agent_id, k.allowed_models, k.allowed_ip_cidrs, k.zdr_enabled,
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
