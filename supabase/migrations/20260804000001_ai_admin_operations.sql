-- AI admin operations: cron visibility, per-org vector quota, job actions,
-- and per-capability kill switches.
--
-- Doc: nextstespsAI/21-admin-platform.md. Four independent changes, each
-- closing a gap the admin console could not close with a read-only query:
--
--   1. inference.cron_runs   — the 9 scheduled sweeps only logged to Cloudflare,
--                              so a sweep that 404'd was invisible to the admin.
--   2. orgs.vector_quota     — the RAG page could SEE a customer at their limit
--                              and not raise it; the ceiling was a constant.
--   3. audit vocabulary      — retry/cancel/quota/switch changes must be recorded
--                              like every other admin mutation (§5.2).
--   4. AI feature switches   — only `gpu_deploy_enabled` existed; there was no
--                              way to stop selling a capability that had gone bad.

-- ── 1. Scheduled-sweep heartbeats ────────────────────────────────────────────
--
-- ONE ROW PER JOB, upserted — not an append-only history. The operator question
-- is "did this run, and did it work", which the latest state answers; a history
-- table would need its own retention job to stay bounded, and the sweeps run
-- every 1–5 minutes.
--
-- `consecutive_failures` is the figure that matters: a single failed sweep is
-- noise (a cold start, a transient 500), the same sweep failing twenty times in
-- a row is an outage. It is incremented by the writer rather than derived,
-- because deriving it would require the history this table deliberately lacks.
CREATE TABLE IF NOT EXISTS inference.cron_runs (
  job                   TEXT PRIMARY KEY,
  last_run_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'ok' | 'error'. Free text rather than an enum: this table is written by a
  -- best-effort helper that must never fail a sweep, and an enum mismatch would
  -- turn a successful sweep into a logged error for no operational gain.
  last_status           TEXT NOT NULL DEFAULT 'ok',
  last_ok_at            TIMESTAMPTZ,
  last_error            TEXT,
  last_duration_ms      INTEGER,
  /** Whatever the sweep returned (scanned/reaped/errors), for the admin table. */
  last_result           JSONB NOT NULL DEFAULT '{}'::jsonb,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  runs_total            BIGINT NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inference.cron_runs ENABLE ROW LEVEL SECURITY;
-- No policies: this is platform-internal, service-role only. Customers must not
-- be able to read the platform's operational schedule.
GRANT ALL ON inference.cron_runs TO service_role;

COMMENT ON TABLE inference.cron_runs IS
  'Latest outcome of each scheduled sweep. Written best-effort by lib/inference/cron-heartbeat.ts; read by /api/admin/inference/cron. A job with no row here has never reported in — which is the failure mode this table exists to catch.';

-- ── 2. Per-org vector quota ──────────────────────────────────────────────────
--
-- NULL means "use the platform default" (DEFAULT_VECTOR_QUOTA in
-- lib/inference/vector-quota.ts), so this column only ever records a deliberate
-- per-customer decision. Backfilling every org with 1,000,000 would freeze
-- today's default into 200 rows and make raising it a data migration.
ALTER TABLE inference.orgs ADD COLUMN IF NOT EXISTS vector_quota BIGINT;

ALTER TABLE inference.orgs DROP CONSTRAINT IF EXISTS orgs_vector_quota_positive;
ALTER TABLE inference.orgs ADD CONSTRAINT orgs_vector_quota_positive
  CHECK (vector_quota IS NULL OR vector_quota >= 0);

COMMENT ON COLUMN inference.orgs.vector_quota IS
  'Max vectors this org may store. NULL = platform default. Enforced by checkVectorQuota() in lib/inference/vector-quota.ts and its copy in workers/inference/src/routes/vector-collections.ts.';

-- ── 3. Audit vocabulary for the new admin actions ────────────────────────────
--
-- Same rule as 20260729000001: named for what the operator did, `admin.` prefixed
-- so "everything staff did" stays a prefix match.
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'admin.job_retried';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'admin.job_cancelled';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'admin.feature_switch_changed';

-- ── 4. AI capability kill switches ───────────────────────────────────────────
--
-- Seeded ENABLED so this migration cannot itself take the platform offline, and
-- so a missing row and an enabled switch mean the same thing (the readers
-- default to true). Same pattern and same table as `gpu_deploy_enabled`.
INSERT INTO public.platform_settings (key, value) VALUES
  ('ai_inference_enabled',      'true'::jsonb),
  ('ai_agents_enabled',         'true'::jsonb),
  ('ai_media_enabled',          'true'::jsonb),
  ('ai_connector_sync_enabled', 'true'::jsonb),
  ('ai_finetuning_enabled',     'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- NOTE: `ALTER TYPE ... ADD VALUE` cannot be used by a statement in the SAME
-- transaction that adds it. Nothing below reads the new audit actions, so the
-- ordering here is safe.
