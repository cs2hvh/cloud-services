-- ============================================================
-- Phase 1.5 — Per-API-key rate limit override
--
-- The Worker's rate-limit middleware hardcodes 10 RPS / 60-token
-- burst for every key. That's fine as a platform default, but
-- enterprise customers want to set tighter caps on specific keys
-- (a key issued to a contractor) AND loose ones on others (a
-- batch-job key during a once-a-month load).
--
-- One nullable column on api_keys + propagation through the
-- already-cached lookup RPC = customer sets the value in the
-- dashboard, takes effect on next KV refresh (≤5 min).
--
-- NULL = use the worker's baked-in default (currently 600 RPM,
--        equivalent to 10 RPS). Customer doesn't have to opt in
--        to anything to stay on the historical behavior.
-- ============================================================

ALTER TABLE inference.api_keys
  ADD COLUMN IF NOT EXISTS rate_limit_rpm INTEGER;

-- Sanity bound: 1 RPM is the floor (anything lower is effectively
-- disabled — use revoke for that), 10,000 RPM (~166 RPS) is a
-- generous ceiling for an enterprise tier — orgs needing more
-- should reach out for an architecture conversation, not flip a
-- dashboard switch.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'api_keys_rate_limit_rpm_range'
      AND conrelid = 'inference.api_keys'::regclass
  ) THEN
    ALTER TABLE inference.api_keys
      ADD CONSTRAINT api_keys_rate_limit_rpm_range
      CHECK (
        rate_limit_rpm IS NULL OR
        (rate_limit_rpm >= 1 AND rate_limit_rpm <= 10000)
      );
  END IF;
END $$;

-- Re-issue lookup_api_key (5th revision now) to return rate_limit_rpm
-- so the Worker reads it in the same KV-cached AuthContext, no extra
-- hot-path query.
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
         k.expires_at
  FROM inference.api_keys k
  JOIN inference.orgs     o ON o.id = k.org_id
  WHERE k.key_hash = p_hash
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > NOW());
$$;

GRANT EXECUTE ON FUNCTION inference.lookup_api_key TO service_role;
