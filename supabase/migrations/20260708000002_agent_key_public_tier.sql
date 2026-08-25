-- Doc: manager ask (2026-07-08) — "industrial standard" public + private key
-- tiers for agent access keys, on top of 20260708000001's agent_id scoping.
--
-- private (default, unchanged behavior): server-to-server, full trace/cost
-- visibility on its one agent, no origin restriction.
-- public: safe to embed in a customer's website JS (mirrors Stripe pk_/sk_,
-- Algolia referrer-restricted search keys). Always agent-scoped (there is no
-- such thing as an org-wide public key — far too dangerous) and always
-- requires at least one allowed origin, enforced server-side by
-- workers/inference/src/middleware/origin-check.ts (CORS itself is already
-- wide open in this gateway and was never a real security boundary — see
-- that middleware's comment). Responses to a public-tier key are redacted
-- (no cost_cents/steps) by workers/inference/src/routes/agent-runs.ts.

ALTER TABLE inference.api_keys
  ADD COLUMN IF NOT EXISTS key_tier TEXT NOT NULL DEFAULT 'private'
    CHECK (key_tier IN ('private', 'public'));

ALTER TABLE inference.api_keys
  ADD COLUMN IF NOT EXISTS allowed_origins TEXT[];

ALTER TABLE inference.api_keys
  ADD CONSTRAINT chk_public_key_has_origins
    CHECK (key_tier = 'private' OR (allowed_origins IS NOT NULL AND array_length(allowed_origins, 1) > 0));

ALTER TABLE inference.api_keys
  ADD CONSTRAINT chk_public_key_is_agent_scoped
    CHECK (key_tier = 'private' OR agent_id IS NOT NULL);

-- Extend lookup_api_key to surface the new tier + origins. Postgres won't
-- let CREATE OR REPLACE change a function's return column list, so drop
-- first (same pattern as every prior revision of this function).
DROP FUNCTION IF EXISTS inference.lookup_api_key(TEXT);

CREATE OR REPLACE FUNCTION inference.lookup_api_key(p_hash TEXT)
RETURNS TABLE (
  key_id                       UUID,
  org_id                       UUID,
  agent_id                     UUID,
  key_tier                     TEXT,
  allowed_origins              TEXT[],
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
  SELECT k.id, k.org_id, k.agent_id, k.key_tier, k.allowed_origins,
         k.allowed_models, k.allowed_ip_cidrs, k.zdr_enabled,
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
