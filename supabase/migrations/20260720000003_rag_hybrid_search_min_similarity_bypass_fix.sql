-- Fix inference.hybrid_search() (20260720000001, 20260720000002): a
-- text-only match could bypass p_min_similarity entirely.
--
-- Found live, 2026-07-20, testing a deliberately tricky scenario: querying
-- "refund" with mode:'hybrid' and min_similarity:0.9 against a real
-- collection returned a row with similarity:0 in the response — the exact
-- opposite of what a 0.9 floor should allow through. The same query in pure
-- vector mode correctly returned zero rows, isolating the bug to fusion.
--
-- Root cause: p_min_similarity was only ever applied inside vector_ranked,
-- filtering the vector-similarity candidate pool BEFORE fusion. A row that
-- matched via full-text search only (e.g. the literal word "refund" appears
-- in its content) never went through that filter at all — it enters via
-- text_ranked, and the FULL OUTER JOIN in `fused` lets it through
-- regardless of its (COALESCE'd to 0) vector similarity. A customer setting
-- min_similarity reasonably expects it to gate the WHOLE result set, not
-- just the vector half of a hybrid fusion.
--
-- Fix: apply p_min_similarity again on the final joined result, after
-- fusion. For p_min_similarity = 0 (the default) this is a no-op — every
-- row already satisfies `>= 0` whether or not it has a real vector match —
-- so normal hybrid search behavior (including legitimate text-only matches)
-- is completely unaffected. It only takes effect once a caller explicitly
-- asks for a similarity floor.
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
  -- FIX: re-apply the similarity floor after fusion, so a text-only match
  -- (vr.similarity NULL -> 0) can't bypass a caller-specified min_similarity.
  -- No-op at the default p_min_similarity = 0.
  WHERE COALESCE(vr.similarity, 0) >= p_min_similarity
  ORDER BY f.rrf_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION inference.hybrid_search TO service_role;
GRANT EXECUTE ON FUNCTION inference.hybrid_search TO authenticated;
