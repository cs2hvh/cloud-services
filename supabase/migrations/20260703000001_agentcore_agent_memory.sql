-- Agents v2 (agentcore) — S5 agent memory (pgvector).
--
-- Gives a defined agent a durable, embeddings-searchable memory: the agent's
-- `memory_write` tool stores a fact, `memory_search` recalls the most relevant
-- ones across runs. Scoped by (org_id, agent_id, scope_key) — one agent's memory
-- is never visible to another org (RLS) or another agent (query filter).
--
-- Conventions mirror 20260701000001_agentcore_schema.sql: RLS enable + GRANT
-- SELECT authenticated / ALL service_role, policies wrapped in DO $$ ... EXCEPTION
-- WHEN duplicate_object, org membership via inference.is_org_member(org_id). The
-- search RPC mirrors inference.search_vectors (cosine, JSON-stringified embedding).
--
-- NOTE (repo policy): the USER applies migrations. This file is written, not run.

-- Table -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agentcore.agent_memories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  agent_id   UUID NOT NULL REFERENCES agentcore.agents(id) ON DELETE CASCADE,
  scope_key  TEXT NOT NULL DEFAULT 'default',   -- partitions memory within an agent
  content    TEXT NOT NULL,
  embedding  vector(1536),                      -- catalog text-embedding-3-small dims
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recall is always filtered by (agent_id, scope_key); the vector scan runs over
-- that small subset, so a btree index on the filter is what matters. A dedicated
-- vector index (hnsw/ivfflat) is a scaling follow-up once per-scope volume grows.
CREATE INDEX IF NOT EXISTS idx_agent_mem_scope
  ON agentcore.agent_memories (agent_id, scope_key, created_at DESC);

-- RLS -------------------------------------------------------------------------
ALTER TABLE agentcore.agent_memories ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON agentcore.agent_memories TO authenticated;
GRANT ALL    ON agentcore.agent_memories TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org memories" ON agentcore.agent_memories
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Restrict the ALL policy to service_role ONLY. RLS policies are permissive
-- (OR'd), so a `USING (true)` FOR ALL policy would apply to `authenticated` too
-- and let any signed-in user read EVERY org's memories via PostgREST — bypassing
-- the is_org_member SELECT policy above. Match the pattern used by every other
-- agentcore table. (DROP first so a re-apply corrects an earlier buggy version —
-- the DO/EXCEPTION block below only skips, it can't rewrite an existing policy.)
DROP POLICY IF EXISTS "service role manages memories" ON agentcore.agent_memories;
DO $$ BEGIN
  CREATE POLICY "service role manages memories" ON agentcore.agent_memories
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Search RPC (cosine) ---------------------------------------------------------
-- Scoped to one agent + scope_key. Runner passes p_query_embedding as a
-- JSON-stringified array (pgvector casts it), exactly like inference.search_vectors.
CREATE OR REPLACE FUNCTION agentcore.search_agent_memories(
  p_agent_id       UUID,
  p_scope_key      TEXT,
  p_query_embedding vector,
  p_limit          INT DEFAULT 5
)
RETURNS TABLE (
  id         UUID,
  content    TEXT,
  similarity FLOAT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    (1 - (m.embedding <=> p_query_embedding))::FLOAT AS similarity,
    m.created_at
  FROM agentcore.agent_memories m
  WHERE m.agent_id = p_agent_id
    AND m.scope_key = p_scope_key
    AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
-- SECURITY INVOKER (the default) — mirrors inference.search_vectors. Runs with the
-- CALLER's privileges so RLS on agent_memories applies: the runner (service_role)
-- bypasses RLS as intended, while an `authenticated` caller is filtered to their
-- own org by the "members read own org memories" policy. A SECURITY DEFINER here
-- would bypass RLS and let any signed-in user read another org's agent memories by
-- passing its agent_id — do NOT reintroduce it.
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION agentcore.search_agent_memories(UUID, TEXT, vector, INT) TO service_role;
GRANT EXECUTE ON FUNCTION agentcore.search_agent_memories(UUID, TEXT, vector, INT) TO authenticated;
