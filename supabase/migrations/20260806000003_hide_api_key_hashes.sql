-- Take hashed API keys out of the browser's reach.
--
-- FOUND 2026-08-06, by sweeping every PostgREST-exposed schema as an ordinary
-- logged-in customer (public anon key + a real session, no service role) after
-- the `inference` leak was closed. Two tables still hand out `key_hash`:
--
--     public.api_keys.key_hash          6 of the caller's own rows
--     agents.agent_api_keys.key_hash    1 of the caller's own rows
--
-- SEVERITY, HONESTLY: low. RLS is doing its job — the caller sees only their own
-- rows, verified (`distinct user_id: 1`, matching the signed-in user). The value
-- is a SHA-256 of a high-entropy key, so holding your own key's hash grants you
-- nothing you did not already have by holding the key. This is hardening, not an
-- incident.
--
-- WHY DO IT ANYWAY: it is secret-adjacent material with no legitimate browser use
-- case. `lib/supabase/queries/api_keys.ts` compares the hash server-side with a
-- constant-time compare — the care taken there is the same care that says it
-- should never have been reachable from a client in the first place. And the
-- blast radius grows quietly: an org-scoped read added later, or an RLS policy
-- loosened for an unrelated reason, turns "your own hash" into "your org's".
--
-- WHY NOT A SCHEMA-WIDE REVOKE, as `inference` got: `public` is the application's
-- core schema and the browser legitimately reaches it. This is two named tables
-- with a named column, which is the proportionate shape for a low-severity fix.
--
-- CHECKED FIRST — every reader of these two tables:
--   app/api/inference/api-keys/*        service-role
--   app/api/agents/[id]/keys/*          service-role
--   app/dashboard/services/inference/   service-role (server component)
--   lib/supabase/queries/api_keys.ts    createServiceClient
--   lib/supabase/queries/ai_agents.ts   service-role
-- No browser component and no SSR/cookie client reads either table, and there is
-- no `select("*")` against them that dropping a column could break.
--
-- MECHANICS: Postgres will not let a single column be revoked out of a
-- table-level grant — the table privilege has to go, then the wanted columns come
-- back by name. Hence revoke-then-regrant rather than a one-line REVOKE.

-- ── public.api_keys ──────────────────────────────────────────────────────────
REVOKE SELECT ON public.api_keys FROM authenticated, anon;

GRANT SELECT (
  id,
  user_id,
  name,
  key_prefix,
  plan,
  last_used_at,
  expires_at,
  created_at,
  updated_at
) ON public.api_keys TO authenticated;

COMMENT ON COLUMN public.api_keys.key_hash IS
  'SHA-256 of the key. NOT readable by anon/authenticated — compared server-side only, in constant time. See migration 20260806000003.';

-- ── agents.agent_api_keys ────────────────────────────────────────────────────
REVOKE SELECT ON agents.agent_api_keys FROM authenticated, anon;

GRANT SELECT (
  id,
  name,
  key_prefix,
  agent_id,
  user_id,
  last_used_at,
  request_count,
  is_active,
  expires_at,
  created_at
) ON agents.agent_api_keys TO authenticated;

COMMENT ON COLUMN agents.agent_api_keys.key_hash IS
  'SHA-256 of the key. NOT readable by anon/authenticated. See migration 20260806000003.';

-- NOTE: `key_prefix` and `key_last_four` stay readable on purpose — they are how
-- the dashboard lets someone recognise which key a row is, and they are not
-- secret. Only the full hash goes.
--
-- A future ADD COLUMN on either table stays invisible to authenticated until it
-- is added to the grant above. That is the safe direction to fail, but it does
-- mean a new customer-facing field needs a companion GRANT.
--
-- VERIFY with: npx tsx scripts/verify-upstream-column-grants.ts
