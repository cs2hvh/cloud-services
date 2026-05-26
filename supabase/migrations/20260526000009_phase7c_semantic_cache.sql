-- ============================================================
-- Phase 7.C — Semantic cache
--
-- The existing L1 cache (CF KV) catches exact-match repeats —
-- sha256(normalized_request) → cached response, 5-minute TTL. That
-- helps replays + identical prompts but misses near-duplicates
-- ("What's the weather?" vs "How's the weather today?").
--
-- Semantic cache layers on top: embed the user's prompt, find any
-- cached response whose prompt embedding is within cosine threshold
-- 0.95 (same org, same model, same temperature bucket, <1 hour old),
-- and return that response. Real cost cutter for high-traffic Q&A
-- workloads.
--
-- Design choices locked this session:
--   • Embeddings come from OpenRouter text-embedding-3-small (1536d).
--     Same provider boundary we already proxy through.
--   • Per-key opt-in via api_keys.semantic_cache_enabled (default
--     FALSE). Customers turn it on knowing the trade-off.
--   • ZDR keys never cache — privacy guarantee is absolute.
--   • Stored values: embedding + response_body + usage. NEVER the
--     original prompt text (privacy + GDPR + smaller rows).
-- ============================================================

-- ─── 1. Per-key opt-in flag ─────────────────────────────────────
ALTER TABLE inference.api_keys
  ADD COLUMN IF NOT EXISTS semantic_cache_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 2. Cache storage ───────────────────────────────────────────
--
-- temperature_bucket is the request's temperature rounded to 0.1 —
-- different buckets get different rows so cache-served responses
-- preserve the caller's determinism preference. e.g. temp=0.0 hits
-- never bleed into temp=0.7 hits.
--
-- response_body is the FULL non-streaming JSON we'd otherwise have
-- generated. content_type lets us replay it with the right header
-- (always application/json today; future-proofs alt formats).
--
-- usage is the OpenAI-shape usage block ({prompt_tokens, completion_
-- tokens, total_tokens, ...}) so a cache hit can emit a usage event
-- with the same token counts as the original call. The hit is then
-- billed at the cached_tokens rate (caller saved real compute, we
-- pay them back via the existing pricing model in usage-consumer).
CREATE TABLE IF NOT EXISTS inference.semantic_cache (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  model_id            TEXT NOT NULL,
  temperature_bucket  NUMERIC(2,1) NOT NULL,
  embedding           VECTOR(1536) NOT NULL,
  response_body       TEXT NOT NULL,
  content_type        TEXT NOT NULL DEFAULT 'application/json',
  usage               JSONB,
  cached_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ANN index — IVFFlat with 100 lists, cosine distance. Good default
-- for tables in the 10k–1M row range. If we ever cross 10M rows in
-- this table consider HNSW; for the 1-hour TTL above that's unlikely.
CREATE INDEX IF NOT EXISTS idx_semantic_cache_embedding
  ON inference.semantic_cache
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Composite filter index — pgvector ANN can't filter cheaply on its
-- own, so we let the planner narrow by (org, model, bucket) first.
CREATE INDEX IF NOT EXISTS idx_semantic_cache_org_model_bucket_time
  ON inference.semantic_cache(org_id, model_id, temperature_bucket, cached_at DESC);

-- ─── 3. Lookup RPC ─────────────────────────────────────────────
--
-- The Worker calls this via service-role (same as lookup_api_key).
-- Returns at most one row — the closest neighbor above threshold,
-- within the org+model+bucket scope, within the freshness window.
DROP FUNCTION IF EXISTS inference.lookup_semantic_cache(
  UUID, TEXT, NUMERIC, VECTOR(1536), FLOAT, INTEGER
);

CREATE OR REPLACE FUNCTION inference.lookup_semantic_cache(
  p_org_id      UUID,
  p_model_id    TEXT,
  p_temp_bucket NUMERIC(2,1),
  p_embedding   VECTOR(1536),
  p_threshold   FLOAT,
  p_ttl_seconds INTEGER
)
RETURNS TABLE (
  response_body TEXT,
  content_type  TEXT,
  usage         JSONB,
  similarity    FLOAT,
  cached_at     TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT
    s.response_body,
    s.content_type,
    s.usage,
    1 - (s.embedding <=> p_embedding) AS similarity,
    s.cached_at
  FROM inference.semantic_cache s
  WHERE s.org_id = p_org_id
    AND s.model_id = p_model_id
    AND s.temperature_bucket = p_temp_bucket
    AND s.cached_at > NOW() - (p_ttl_seconds || ' seconds')::INTERVAL
    AND 1 - (s.embedding <=> p_embedding) >= p_threshold
  ORDER BY s.embedding <=> p_embedding
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION inference.lookup_semantic_cache TO service_role;

-- ─── 4. Cleanup helper ─────────────────────────────────────────
--
-- Called by a periodic cron (Worker's scheduled() handler can fire
-- this once a day) to GC expired rows. Until then the freshness
-- filter in the RPC keeps stale rows invisible to callers but they
-- still cost storage.
CREATE OR REPLACE FUNCTION inference.gc_semantic_cache(p_ttl_seconds INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM inference.semantic_cache
  WHERE cached_at < NOW() - (p_ttl_seconds || ' seconds')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION inference.gc_semantic_cache TO service_role;

-- ─── 5. Re-issue lookup_api_key to carry the new flag ──────────
--
-- The Worker needs semantic_cache_enabled in the same RPC roundtrip
-- as the rest of the key context so we don't pay an extra query on
-- every request. DROP-then-CREATE because we're changing the return
-- column list (Postgres won't allow CREATE OR REPLACE to do that).
DROP FUNCTION IF EXISTS inference.lookup_api_key(TEXT);

CREATE OR REPLACE FUNCTION inference.lookup_api_key(p_hash TEXT)
RETURNS TABLE (
  key_id                   UUID,
  org_id                   UUID,
  allowed_models           TEXT[],
  allowed_ip_cidrs         CIDR[],
  zdr_enabled              BOOLEAN,
  monthly_budget_cents     BIGINT,
  hard_cap_cents           BIGINT,
  org_monthly_budget_cents BIGINT,
  org_hard_cap_cents       BIGINT,
  semantic_cache_enabled   BOOLEAN,
  expires_at               TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT k.id, k.org_id, k.allowed_models, k.allowed_ip_cidrs, k.zdr_enabled,
         k.monthly_budget_cents, k.hard_cap_cents,
         o.monthly_budget_cents AS org_monthly_budget_cents,
         o.hard_cap_cents       AS org_hard_cap_cents,
         k.semantic_cache_enabled,
         k.expires_at
  FROM inference.api_keys k
  JOIN inference.orgs     o ON o.id = k.org_id
  WHERE k.key_hash = p_hash
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > NOW());
$$;

GRANT EXECUTE ON FUNCTION inference.lookup_api_key TO service_role;
