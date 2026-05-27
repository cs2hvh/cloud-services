-- ============================================================
-- Phase 7.C — Per-org semantic cache threshold tuning
--
-- The semantic cache (Phase 7.C, migration 20260526000009) ships
-- with a hardcoded 0.95 cosine similarity threshold in the worker.
-- That's the safe default — strict enough that hits are usually a
-- restatement of the same question — but different workloads have
-- different sweet spots:
--
--   • Customer support FAQs: 0.92 (more hits, very forgiving)
--   • Code generation:        0.97 (looser hits could ship wrong code)
--   • Stylistic Q&A:          0.95 (default)
--
-- Per-org column (not per-key) — operators almost always want one
-- setting for the whole org, and per-key would force the customer
-- to keep the value in sync across keys.
--
-- NULL means "use the platform default" (still 0.95). When the
-- worker reads a null from the lookup RPC it falls back to its
-- baked-in SIMILARITY_THRESHOLD.
-- ============================================================

ALTER TABLE inference.orgs
  ADD COLUMN IF NOT EXISTS semantic_cache_threshold NUMERIC(3,2);

-- Bound: cosine similarity lives in [-1, 1] for arbitrary vectors,
-- but for OpenAI/embedding-style normalized vectors it lives in
-- [0, 1]. Anything below ~0.80 is too loose to ship; anything
-- above ~0.99 effectively disables the cache. We bracket to
-- [0.50, 0.99] for safety + UX clarity on the settings UI.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orgs_semantic_cache_threshold_range'
      AND conrelid = 'inference.orgs'::regclass
  ) THEN
    ALTER TABLE inference.orgs
      ADD CONSTRAINT orgs_semantic_cache_threshold_range
      CHECK (
        semantic_cache_threshold IS NULL OR
        (semantic_cache_threshold >= 0.50 AND semantic_cache_threshold <= 0.99)
      );
  END IF;
END $$;

-- Re-issue lookup_api_key to carry the new field. The Worker reads
-- this on every request via the KV-cached AuthContext, so adding
-- here means no extra query in the hot path. Same DROP-then-CREATE
-- pattern as previous extensions (Postgres won't allow CREATE OR
-- REPLACE to change the return column list).
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
  expires_at                   TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT k.id, k.org_id, k.allowed_models, k.allowed_ip_cidrs, k.zdr_enabled,
         k.monthly_budget_cents, k.hard_cap_cents,
         o.monthly_budget_cents AS org_monthly_budget_cents,
         o.hard_cap_cents       AS org_hard_cap_cents,
         k.semantic_cache_enabled,
         o.semantic_cache_threshold AS org_semantic_cache_threshold,
         k.expires_at
  FROM inference.api_keys k
  JOIN inference.orgs     o ON o.id = k.org_id
  WHERE k.key_hash = p_hash
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > NOW());
$$;

GRANT EXECUTE ON FUNCTION inference.lookup_api_key TO service_role;
