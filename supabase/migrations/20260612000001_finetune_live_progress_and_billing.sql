-- Phase 8 batch 2 — live progress + billing + log link for fine-tuning jobs.
--
-- Previously the dashboard could only show coarse status ('queued', 'running',
-- 'completed'); during the running phase there was nothing — no current step,
-- no loss curve, no ETA, no cost-so-far. Heartbeats from the training pod
-- already carry global_step / max_steps / epoch / loss but those snapshots
-- only lived in Upstash with a 90s TTL.
--
-- This migration:
--   1. Adds progress columns the heartbeat receiver updates on every ping
--   2. Adds hourly_cost_cents the runner populates on pod provision so the
--      completion webhook can compute final cost_cents
--   3. Adds training_log_url for the full log download (uploaded to R2
--      alongside the adapter by train.sh post-training)
--
-- All columns NULLABLE — they're only populated mid-flight / on completion;
-- queued/preparing/failed-early rows leave them NULL.

ALTER TABLE inference.finetunes
  ADD COLUMN IF NOT EXISTS current_step       INTEGER,
  ADD COLUMN IF NOT EXISTS max_steps          INTEGER,
  ADD COLUMN IF NOT EXISTS current_epoch      NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS latest_loss        NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS last_heartbeat_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS training_log_url   TEXT,
  -- Hourly cost in cents (e.g. 139 = $1.39/hr for A100-80GB). Populated
  -- once when the runner provisions the pod and gets back the RunPod
  -- costPerHr; never changes after that. Used by the completion webhook
  -- to compute cost_cents = ceil(hourly_cost_cents * training_seconds / 3600).
  ADD COLUMN IF NOT EXISTS hourly_cost_cents  INTEGER;

-- Index for the "in-flight jobs with progress" dashboard query
CREATE INDEX IF NOT EXISTS idx_finetunes_last_heartbeat
  ON inference.finetunes(last_heartbeat_at DESC)
  WHERE status = 'running';
