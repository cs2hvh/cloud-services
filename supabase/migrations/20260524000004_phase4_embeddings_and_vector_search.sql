-- ============================================================
-- Phase 4 — Embeddings + Vector Search
--
-- 1. Add OpenAI embedding models to the catalog (only embedding-modality
--    models OpenRouter exposes today).
-- 2. Create inference.search_vectors() — pgvector similarity search RPC
--    that the /api/inference/vector/collections/[id]/query route calls.
-- 3. Create a helper INSERT trigger that maintains the row_count +
--    size_bytes columns on inference.vector_collections as rows are added
--    or removed.
-- ============================================================

-- ─── 1. Embedding models ────────────────────────────────────────
INSERT INTO inference.models (
  model_id, display_name, description, modality, serving_type,
  upstream_provider, upstream_model_id,
  capabilities, pricing,
  is_active, is_featured, sort_order
) VALUES
(
  'openai/text-embedding-3-large',
  'OpenAI text-embedding-3-large',
  'Highest-quality OpenAI embeddings. 3072-dim by default, supports dimensions reduction. Best retrieval quality in the OpenAI family.',
  'embedding', 'proxy', 'openrouter', 'openai/text-embedding-3-large',
  '{"dimensions": 3072, "supports_dimension_reduction": true, "context_window": 8191}'::JSONB,
  '{"input_cents_per_mtok": 13, "output_cents_per_mtok": 0, "cached_cents_per_mtok": 0}'::JSONB,
  TRUE, TRUE, 200
),
(
  'openai/text-embedding-3-small',
  'OpenAI text-embedding-3-small',
  'Workhorse embedding model. 1536-dim by default. Cheap, fast, strong on MTEB benchmarks.',
  'embedding', 'proxy', 'openrouter', 'openai/text-embedding-3-small',
  '{"dimensions": 1536, "supports_dimension_reduction": true, "context_window": 8191}'::JSONB,
  '{"input_cents_per_mtok": 2, "output_cents_per_mtok": 0, "cached_cents_per_mtok": 0}'::JSONB,
  TRUE, TRUE, 201
),
(
  'openai/text-embedding-ada-002',
  'OpenAI text-embedding-ada-002',
  'Legacy OpenAI embedding model. 1536-dim, kept for compatibility. Prefer text-embedding-3-small for new work.',
  'embedding', 'proxy', 'openrouter', 'openai/text-embedding-ada-002',
  '{"dimensions": 1536, "context_window": 8191}'::JSONB,
  '{"input_cents_per_mtok": 10, "output_cents_per_mtok": 0, "cached_cents_per_mtok": 0}'::JSONB,
  TRUE, FALSE, 202
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  pricing      = EXCLUDED.pricing,
  is_featured  = EXCLUDED.is_featured,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();

-- ─── 2. Similarity search RPC ───────────────────────────────────
--
-- Returns the top N most-similar rows in a collection for a given query
-- embedding. Distance metric is dynamic per collection (cosine | l2 |
-- inner_product). Similarity is normalized to [0, 1] where 1 = most similar.
--
-- Usage from app:
--   SELECT * FROM inference.search_vectors(
--     p_collection_id => '...',
--     p_query_embedding => '[0.1, 0.2, ...]'::vector,
--     p_distance_metric => 'cosine',
--     p_limit => 10,
--     p_min_similarity => 0.5
--   );
CREATE OR REPLACE FUNCTION inference.search_vectors(
  p_collection_id UUID,
  p_query_embedding vector,
  p_distance_metric TEXT DEFAULT 'cosine',
  p_limit INT DEFAULT 10,
  p_min_similarity FLOAT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  external_id TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  IF p_distance_metric = 'cosine' THEN
    RETURN QUERY
    SELECT
      r.id,
      r.external_id,
      r.content,
      r.metadata,
      (1 - (r.embedding <=> p_query_embedding))::FLOAT AS similarity
    FROM inference.vector_rows r
    WHERE r.collection_id = p_collection_id
      AND r.embedding IS NOT NULL
      AND (1 - (r.embedding <=> p_query_embedding)) >= p_min_similarity
    ORDER BY r.embedding <=> p_query_embedding
    LIMIT p_limit;
  ELSIF p_distance_metric = 'l2' THEN
    RETURN QUERY
    SELECT
      r.id,
      r.external_id,
      r.content,
      r.metadata,
      (1.0 / (1.0 + (r.embedding <-> p_query_embedding)))::FLOAT AS similarity
    FROM inference.vector_rows r
    WHERE r.collection_id = p_collection_id
      AND r.embedding IS NOT NULL
    ORDER BY r.embedding <-> p_query_embedding
    LIMIT p_limit;
  ELSIF p_distance_metric = 'inner_product' THEN
    RETURN QUERY
    SELECT
      r.id,
      r.external_id,
      r.content,
      r.metadata,
      (-(r.embedding <#> p_query_embedding))::FLOAT AS similarity
    FROM inference.vector_rows r
    WHERE r.collection_id = p_collection_id
      AND r.embedding IS NOT NULL
    ORDER BY r.embedding <#> p_query_embedding
    LIMIT p_limit;
  ELSE
    RAISE EXCEPTION 'Unsupported distance metric: %', p_distance_metric;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION inference.search_vectors TO service_role;
GRANT EXECUTE ON FUNCTION inference.search_vectors TO authenticated;

-- ─── 3. Collection stats trigger ─────────────────────────────────
--
-- Keeps vector_collections.row_count current as rows are inserted/deleted.
-- We don't track per-row byte size (variable embedding dim makes it noisy);
-- size_bytes left as approximate via row_count × dimensions × 4.

CREATE OR REPLACE FUNCTION inference.update_collection_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE inference.vector_collections
    SET row_count = row_count + 1,
        size_bytes = (row_count + 1) * dimensions * 4
    WHERE id = NEW.collection_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE inference.vector_collections
    SET row_count = GREATEST(row_count - 1, 0),
        size_bytes = GREATEST(row_count - 1, 0) * dimensions * 4
    WHERE id = OLD.collection_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vector_rows_stats ON inference.vector_rows;
CREATE TRIGGER trg_vector_rows_stats
  AFTER INSERT OR DELETE ON inference.vector_rows
  FOR EACH ROW EXECUTE FUNCTION inference.update_collection_stats();
