-- RAG data platform (nextstespsAI/04-rag-data-platform.md) — hybrid search.
--
-- inference.vector_collections / vector_rows already ARE the "Knowledge Base"
-- primitive the doc specs (no new table needed — a collection is a KB).
-- POST /v1/vector/collections/:id/query already covers the doc's
-- /v1/knowledge/{kb}/search. What's missing is the RRF (Reciprocal Rank
-- Fusion) of dense vector search + sparse full-text (BM25-style) search this
-- migration adds, so `queryCollection` and the new /answer endpoint can offer
-- `mode:'hybrid'` alongside the existing pure-vector default.
--
-- 1. content_tsv generated column + GIN index (the sparse-search half).
-- 2. inference.hybrid_search() RPC — same trust model as search_vectors
--    (no internal org check; the calling route already verifies collection
--    ownership before invoking this, and it runs via the service-role client
--    like every other vector RPC call in this schema).

-- ─── 1. Full-text column (generated, so it self-maintains on every INSERT/UPDATE) ───
ALTER TABLE inference.vector_rows
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_vector_rows_tsv
  ON inference.vector_rows USING GIN (content_tsv);

-- ─── 2. Hybrid search RPC ────────────────────────────────────────────────────
--
-- Fuses a vector-similarity ranked list and a full-text ranked list via RRF:
-- score(row) = sum over each list it appears in of weight * 1/(k + rank),
-- k=60 (the original Cormack et al. RRF-paper default — Supabase's own
-- reference hybrid_search guide defaults k=50; both are reasonable, this
-- picks the more commonly-cited value). RRF (not a raw weighted-sum of the
-- two scores) because vector similarity and ts_rank_cd live on completely
-- different, incomparable scales — fusing by RANK POSITION sidesteps that.
-- A row missing from one list just contributes 0 for that half — so a
-- vector-only or text-only match still surfaces, it's just ranked lower than
-- a row both methods agree on.
--
-- p_full_text_weight / p_semantic_weight (both default 1.0, i.e. equal
-- blend): matches Supabase's own published hybrid_search reference
-- (supabase.com/docs/guides/ai/hybrid-search) so a caller can bias toward
-- exact-keyword-heavy collections (e.g. product SKUs) or meaning-heavy ones
-- (e.g. general FAQs) without a second RPC. Not yet threaded through to the
-- gateway routes' request schemas — only the RPC exposes the knob for now.
--
-- Degrades gracefully: if p_query_text has no indexable terms (e.g. all
-- stopwords), text_ranked is empty and this is equivalent to pure vector
-- search — never errors, never returns nothing just because full-text found
-- no match.
--
-- PERFORMANCE — each candidate half is a TWO-STEP CTE (deliberately, not one
-- query with ROW_NUMBER() OVER an unbounded ORDER BY): once a window
-- function is present, Postgres generally can't push a LIMIT down into an
-- index-order scan, which would silently defeat pgvector's HNSW/ivfflat
-- "top-N without a full sort" optimization for any collection past a
-- trivial row count — precisely the "pgvector scale ceiling" doc 04 §9
-- flags as the platform's top RAG risk. Verified against Postgres's own
-- documented behavior (postgresql.org/docs, use-the-index-luke.com): even
-- PG15+'s WindowAgg "run condition" pushdown only fires for a `WHERE rn <=
-- N` filter, NOT a bare `ORDER BY rn LIMIT N` — and Supabase's own reference
-- hybrid_search uses exactly that `ORDER BY rn LIMIT N` shape, so it doesn't
-- get the pushdown either. This function avoids needing that optimization
-- at all: LIMIT via a plain ORDER BY first (index-eligible, identical to
-- search_vectors' own query shape), THEN apply ROW_NUMBER() only over that
-- already-small (<=100 row) candidate set in a second step.
CREATE OR REPLACE FUNCTION inference.hybrid_search(
  p_collection_id UUID,
  p_query_embedding vector,
  p_query_text TEXT,
  p_distance_metric TEXT DEFAULT 'cosine',
  p_limit INT DEFAULT 10,
  p_metadata_filter JSONB DEFAULT NULL,
  p_min_similarity FLOAT DEFAULT 0,
  p_rrf_k INT DEFAULT 60,
  p_full_text_weight FLOAT DEFAULT 1.0,
  p_semantic_weight FLOAT DEFAULT 1.0
)
RETURNS TABLE (
  id UUID,
  external_id TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT,
  rrf_score FLOAT
) AS $$
DECLARE
  v_candidate_limit INT := GREATEST(p_limit * 4, 50);
BEGIN
  IF p_distance_metric NOT IN ('cosine', 'l2', 'inner_product') THEN
    RAISE EXCEPTION 'Unsupported distance metric: %', p_distance_metric;
  END IF;

  RETURN QUERY
  WITH vector_candidates AS (
    -- Plain ORDER BY + LIMIT, no window function — the query shape
    -- search_vectors already uses, so it stays eligible for the same
    -- ANN-index top-N pushdown.
    SELECT
      r.id,
      (CASE p_distance_metric
        WHEN 'cosine'        THEN 1 - (r.embedding <=> p_query_embedding)
        WHEN 'l2'             THEN 1.0 / (1.0 + (r.embedding <-> p_query_embedding))
        WHEN 'inner_product'  THEN -(r.embedding <#> p_query_embedding)
      END)::FLOAT AS similarity
    FROM inference.vector_rows r
    WHERE r.collection_id = p_collection_id
      AND r.embedding IS NOT NULL
      AND (p_metadata_filter IS NULL OR r.metadata @> p_metadata_filter)
    ORDER BY
      CASE p_distance_metric
        WHEN 'cosine'        THEN r.embedding <=> p_query_embedding
        WHEN 'l2'             THEN r.embedding <-> p_query_embedding
        WHEN 'inner_product'  THEN r.embedding <#> p_query_embedding
      END ASC
    LIMIT v_candidate_limit
  ),
  vector_ranked AS (
    -- ROW_NUMBER() now only ranks the already-limited candidate pool
    -- (<=100 rows) — cheap regardless of collection size. min_similarity
    -- applied here (not in vector_candidates) so it filters the same
    -- rows search_vectors would, without adding a second sort key to the
    -- index-eligible query above.
    SELECT id, similarity, ROW_NUMBER() OVER (ORDER BY similarity DESC) AS vrank
    FROM vector_candidates
    WHERE similarity >= p_min_similarity
  ),
  text_candidates AS (
    -- websearch_to_tsquery (not plainto_tsquery): the Postgres-docs- and
    -- industry-recommended choice for free-text user input specifically —
    -- understands quoted phrases, OR, and -exclusion the way a search box
    -- is expected to, while still never erroring on malformed operator
    -- syntax the way raw to_tsquery would.
    SELECT
      r.id,
      ts_rank_cd(r.content_tsv, websearch_to_tsquery('english', p_query_text)) AS rank_score
    FROM inference.vector_rows r
    WHERE r.collection_id = p_collection_id
      AND p_query_text IS NOT NULL
      AND length(trim(p_query_text)) > 0
      AND r.content_tsv @@ websearch_to_tsquery('english', p_query_text)
      AND (p_metadata_filter IS NULL OR r.metadata @> p_metadata_filter)
    ORDER BY ts_rank_cd(r.content_tsv, websearch_to_tsquery('english', p_query_text)) DESC
    LIMIT v_candidate_limit
  ),
  text_ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY rank_score DESC) AS trank
    FROM text_candidates
  ),
  fused AS (
    SELECT
      COALESCE(v.id, t.id) AS id,
      COALESCE(1.0 / (p_rrf_k + v.vrank), 0) * p_semantic_weight
        + COALESCE(1.0 / (p_rrf_k + t.trank), 0) * p_full_text_weight AS rrf_score
    FROM vector_ranked v
    FULL OUTER JOIN text_ranked t ON v.id = t.id
  )
  SELECT
    r.id,
    r.external_id,
    r.content,
    r.metadata,
    COALESCE(vr.similarity, 0)::FLOAT AS similarity,
    f.rrf_score::FLOAT AS rrf_score
  FROM fused f
  JOIN inference.vector_rows r ON r.id = f.id
  LEFT JOIN vector_ranked vr ON vr.id = f.id
  ORDER BY f.rrf_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION inference.hybrid_search TO service_role;
GRANT EXECUTE ON FUNCTION inference.hybrid_search TO authenticated;
