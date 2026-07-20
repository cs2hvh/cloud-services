-- Fix inference.hybrid_search() (20260720000001): "column reference \"id\" is
-- ambiguous" on every call — found live, 2026-07-20, the first time the
-- function actually ran (not caught by static review or by tests, since no
-- test suite in this repo executes real SQL against Postgres).
--
-- Root cause: RETURNS TABLE(id UUID, ...) makes `id` an implicit PL/pgSQL
-- variable in scope through the ENTIRE function body — not just the final
-- RETURN QUERY. Two of the intermediate CTEs (vector_ranked, text_ranked)
-- referenced a bare, unqualified `id` column from their source CTE
-- (vector_candidates / text_candidates respectively), which Postgres could
-- not disambiguate from that implicit variable. Every other `id` reference
-- in the function was already qualified (r.id, v.id, t.id, f.id, vr.id) and
-- never had this problem — only these two bare ones did.
--
-- Same convention this schema already established for evolving a vector RPC
-- (20260614000002_vector_metadata_filter.sql extended search_vectors via a
-- new migration + CREATE OR REPLACE, rather than editing the original
-- 20260524 migration in place) — an already-applied migration file is never
-- edited after the fact; a bug in it is fixed forward, so migration history
-- always matches what actually ran on every environment.
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
    -- FIX: qualified vector_candidates.id / vector_candidates.similarity —
    -- bare `id`/`similarity` were ambiguous against the RETURNS TABLE
    -- output-parameter variables of the same names.
    SELECT vector_candidates.id, vector_candidates.similarity,
           ROW_NUMBER() OVER (ORDER BY vector_candidates.similarity DESC) AS vrank
    FROM vector_candidates
    WHERE vector_candidates.similarity >= p_min_similarity
  ),
  text_candidates AS (
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
    -- FIX: qualified text_candidates.id / text_candidates.rank_score, same reason.
    SELECT text_candidates.id,
           ROW_NUMBER() OVER (ORDER BY text_candidates.rank_score DESC) AS trank
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
