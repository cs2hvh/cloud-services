-- ============================================================
-- Phase 4 polish — make inference.vector_rows.embedding accept any dimension
--
-- The original schema hard-coded `embedding vector(1536)` because the only
-- catalogged embedding model at that point was text-embedding-3-small.
-- text-embedding-3-large (3072-dim default) and any future BGE / Voyage
-- models can't store rows under the old constraint — INSERTs fail with
-- "expected 1536 dimensions, got 3072".
--
-- Per-collection dimension is still enforced at the app layer (the upsert
-- route compares row.embedding.length against collection.dimensions before
-- inserting), so relaxing the column type is safe.
--
-- pgvector supports an unconstrained `vector` type. Indexes (hnsw/ivfflat)
-- require a concrete dimension and so are added per-collection later via
-- partial indexes WHERE collection_id = '...' once a collection grows.
-- ============================================================

ALTER TABLE inference.vector_rows
  ALTER COLUMN embedding TYPE vector USING embedding::vector;

-- Add audit actions for row-level deletes (collection-level already exists).
-- ALTER TYPE ADD VALUE cannot run inside a transaction in older Postgres,
-- but Supabase migrations run each statement individually so this is fine.
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'vector_row.deleted';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'vector_rows.deleted';
