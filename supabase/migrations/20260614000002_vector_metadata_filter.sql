-- Vector search: metadata filtering for multi-tenant RAG.
--
-- Adds an optional JSONB containment filter (@>) to search_vectors so callers
-- can scope results, e.g. {"tenant":"acme","lang":"en"} returns only rows
-- whose metadata contains those pairs. This is a core RAG capability (tenant
-- isolation, source/type filters) the product markets but didn't implement.
--
-- Replaces the 5-arg function with a 6-arg version. p_metadata_filter defaults
-- NULL, so existing 5-arg callers are unaffected. A GIN index on metadata
-- keeps the containment filter fast within a collection.

DROP FUNCTION IF EXISTS inference.search_vectors(uuid, vector, text, integer, double precision);

CREATE OR REPLACE FUNCTION inference.search_vectors(
  p_collection_id UUID,
  p_query_embedding vector,
  p_distance_metric TEXT DEFAULT 'cosine',
  p_limit INT DEFAULT 10,
  p_min_similarity FLOAT DEFAULT 0,
  p_metadata_filter JSONB DEFAULT NULL
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
      AND (p_metadata_filter IS NULL OR r.metadata @> p_metadata_filter)
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
      AND (p_metadata_filter IS NULL OR r.metadata @> p_metadata_filter)
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
      AND (p_metadata_filter IS NULL OR r.metadata @> p_metadata_filter)
    ORDER BY r.embedding <#> p_query_embedding
    LIMIT p_limit;
  ELSE
    RAISE EXCEPTION 'Unsupported distance metric: %', p_distance_metric;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION inference.search_vectors TO service_role;
GRANT EXECUTE ON FUNCTION inference.search_vectors TO authenticated;

-- Speeds up metadata containment (@>) filtering within a collection.
CREATE INDEX IF NOT EXISTS idx_vector_rows_metadata
  ON inference.vector_rows USING GIN (metadata);
