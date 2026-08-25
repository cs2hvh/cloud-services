-- Fix PGRST106: the `agentcore` schema was not exposed to the Supabase API.
--
-- The control-plane + gateway reach agentcore.* through PostgREST
-- (supabase-js `.schema("agentcore")`), and PostgREST only serves schemas listed
-- in `pgrst.db_schemas`. Without this, every agentcore query/insert fails with:
--   PGRST106: The schema must be one of the following: public, graphql_public,
--             billing, audit, agents, audits, support, inference
--
-- This appends `agentcore` to the existing exposed-schema list, then reloads
-- PostgREST. (Equivalent one-click alternative: Supabase Dashboard →
-- Project Settings → API → Exposed schemas → add "agentcore".)
--
-- The list below MUST preserve every currently-exposed schema; it mirrors the
-- project's current PGRST_DB_SCHEMAS with `agentcore` added at the end.

ALTER ROLE authenticator
  SET pgrst.db_schemas = 'public, graphql_public, billing, audit, agents, audits, support, inference, agentcore';

-- Reload both config (picks up the new db_schemas) and the schema cache.
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
