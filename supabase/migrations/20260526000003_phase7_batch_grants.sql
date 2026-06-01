-- ============================================================
-- Phase 7.D — fix: GRANT privileges on the new batch tables
--
-- The base schema migration (20260523000001) runs:
--   GRANT ALL ON ALL TABLES IN SCHEMA inference TO service_role
-- which only applies to tables that exist AT THAT MOMENT. Tables added
-- by later migrations (like inference.files + inference.batches from
-- 20260526000002) inherit none of that. Result: PostgREST returns
-- "permission denied for table files" even via service_role.
--
-- Fix in two parts:
--   1. Explicit GRANT on the new tables (recovers the broken state).
--   2. ALTER DEFAULT PRIVILEGES so future tables in this schema get
--      the right perms automatically — no more whack-a-mole.
-- ============================================================

-- ─── 1. Catch-up GRANTs for the new tables ──────────────────────
GRANT ALL    ON inference.files   TO service_role;
GRANT ALL    ON inference.batches TO service_role;
GRANT SELECT ON inference.files   TO authenticated;
GRANT SELECT ON inference.batches TO authenticated;

-- ─── 2. Default privileges for FUTURE tables in this schema ────
--   Belt-and-suspenders: if anyone adds another inference.* table
--   in a future migration without remembering to GRANT, the row
--   below ensures service_role can still write and authenticated
--   can still read.
ALTER DEFAULT PRIVILEGES IN SCHEMA inference
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA inference
  GRANT SELECT ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA inference
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA inference
  GRANT EXECUTE ON FUNCTIONS TO service_role;
