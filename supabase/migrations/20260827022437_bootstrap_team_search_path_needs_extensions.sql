-- The pinned search_path was right and incomplete.
--
-- `paas.teams.ref` defaults to `paas.gen_ref('team')`, which calls
-- `gen_random_bytes` from pgcrypto — and Supabase installs pgcrypto into the
-- `extensions` schema. Pinning to `paas, public, pg_temp` therefore made the
-- default expression fail with:
--
--   42883  function gen_random_bytes(integer) does not exist
--
-- Worth keeping because the instinct on seeing that error is to unpin the
-- search_path, and unpinning a SECURITY DEFINER function is a known
-- privilege-escalation route: a caller sets their own search_path and the
-- function resolves unqualified names against objects they control. The fix is
-- to name the schema it actually needs, not to stop naming schemas.
--
-- `extensions` is added LAST, so nothing in it can shadow paas or public.

alter function paas.bootstrap_personal_team()
  set search_path = paas, public, extensions, pg_temp;
