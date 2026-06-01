-- ============================================================
-- Phase 7.C observability — record cache hit kind on usage rows
--
-- Without this, customers who enable semantic_cache (Phase 7.C) can't
-- tell whether it's actually saving them anything — they'd need to
-- scrape X-Ahura-Cache headers from their own logs to compute hit
-- rate. Adding the field on the server side lets the usage dashboard
-- surface hit rate per kind out of the box.
--
-- Values:
--   'none'      → went to upstream (no cache hit) OR not a cacheable
--                 path at all (errors, streaming with no usage block,
--                 etc.). Default — keeps the column NOT NULL without
--                 backfilling history.
--   'l1'        → served from the Cloudflare KV exact-match cache
--   'semantic'  → served from the Supabase pgvector semantic cache
--
-- Implementation note: ALTERing a partitioned parent applies to all
-- existing partitions automatically. New partitions (added by the
-- monthly rotation cron) inherit the column + default.
-- ============================================================

ALTER TABLE inference.usage
  ADD COLUMN IF NOT EXISTS cache_kind TEXT NOT NULL DEFAULT 'none';

-- Sanity bound — keeps unknown values out of the column so the
-- dashboard aggregation can rely on the three-value enum without a
-- "what is this string?" branch. Wrapped in DO/IF NOT EXISTS for
-- safe re-runs (Postgres pre-17 lacks ADD CONSTRAINT IF NOT EXISTS
-- for CHECK).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'usage_cache_kind_valid'
      AND conrelid = 'inference.usage'::regclass
  ) THEN
    ALTER TABLE inference.usage
      ADD CONSTRAINT usage_cache_kind_valid
      CHECK (cache_kind IN ('none', 'l1', 'semantic'));
  END IF;
END $$;

-- Partial index on hits only — the summary aggregation filters
-- WHERE cache_kind <> 'none' (the dominant case) so a partial index
-- on (org, cache_kind, created_at) keeps the scan cheap even as
-- the partition grows. Default-value rows ('none') are excluded
-- from the index, saving most of the storage.
CREATE INDEX IF NOT EXISTS idx_usage_cache_kind_hits
  ON inference.usage(org_id, cache_kind, created_at DESC)
  WHERE cache_kind <> 'none';
