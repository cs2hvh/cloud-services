-- Fix 42501: permission denied for sequence run_steps_id_seq
--
-- agentcore.run_steps uses BIGSERIAL, which creates the sequence
-- agentcore.run_steps_id_seq. The schema migration (…001) granted table
-- privileges (GRANT ALL ON agentcore.run_steps TO service_role) but NOT the
-- sequence privileges an INSERT needs to advance a BIGSERIAL default. Result:
-- the runner's per-step trace INSERT fails with 42501, while every other
-- agentcore table (UUID PKs, no sequence) inserts fine.
--
-- Discovered by live end-to-end testing (2026-07-02): a run completed but its
-- run_steps trace was empty. The runner (service_role) is the only writer.
--
-- Grant current + future sequences in the schema so this can't recur when new
-- serial-backed tables are added.

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA agentcore TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA agentcore
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
