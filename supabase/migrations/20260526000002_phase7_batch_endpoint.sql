-- ============================================================
-- Phase 7.D — OpenAI-compatible batch endpoint
--
-- 1. inference.files          — uploaded files (input JSONL, output JSONL,
--                                error JSONL). OpenAI-compatible shape.
--                                Bytes live in R2 (ahura-batches bucket);
--                                this table is just metadata.
-- 2. inference.batches        — async batch jobs. The processor loops the
--                                input file, fires each line at the gateway,
--                                writes results to an output file, and flips
--                                status to completed.
--
-- 3. file_purpose + batch_status enums.
--
-- 4. New audit_action values for batch lifecycle events.
--
-- 5. RLS — org-scoped read/write via the existing is_org_member helper.
--
-- Design notes
-- ------------
-- • We don't dedupe file uploads — every POST /v1/files is a new row +
--   new R2 object. Users can DELETE explicitly.
-- • Batches have a 24h completion_window enum value for now; OpenAI also
--   offers a 7-day window but we don't expose that until we have proof
--   the SLA holds.
-- • Output files are auto-created on completion; their ownership is the
--   same org as the parent batch. Listed via GET /v1/files.
-- • request_counts JSONB carries { total, completed, failed } so the
--   dashboard can show progress without aggregating output file lines.
-- • Pricing: rows in `inference.usage` emitted by the batch processor
--   carry `is_batch=true` so the consumer applies the 50% discount at
--   billing time.
-- ============================================================

-- ─── 1. File purpose enum ────────────────────────────────────────
CREATE TYPE inference.file_purpose AS ENUM (
  'batch',          -- input JSONL for a batch job
  'batch_output',   -- output JSONL produced by a batch
  'batch_error'     -- error JSONL produced by a batch
);

-- ─── 2. Batch status enum ────────────────────────────────────────
CREATE TYPE inference.batch_status AS ENUM (
  'validating',     -- created, input file being checked
  'failed',         -- input validation failed
  'in_progress',    -- processor is iterating the input
  'finalizing',     -- all requests done, writing output file
  'completed',      -- output file ready
  'expired',        -- exceeded completion_window
  'cancelling',     -- cancel requested, processor will stop
  'cancelled'       -- processor stopped, partial output written
);

-- ─── 3. Files table ──────────────────────────────────────────────
CREATE TABLE inference.files (
  id              TEXT PRIMARY KEY,           -- "file_" + uuid, OpenAI shape
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES auth.users(id),
  purpose         inference.file_purpose NOT NULL,
  filename        TEXT NOT NULL,
  bytes           BIGINT NOT NULL,            -- file size for billing/quotas
  r2_bucket       TEXT NOT NULL DEFAULT 'ahura-batches',
  r2_key          TEXT NOT NULL,              -- "<org_id>/<file_id>.jsonl"
  /** Set to the batch id when this is an output/error file produced by a batch. */
  produced_by_batch_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_files_org_created
  ON inference.files(org_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ─── 4. Batches table ────────────────────────────────────────────
CREATE TABLE inference.batches (
  id                    TEXT PRIMARY KEY,     -- "batch_" + uuid, OpenAI shape
  org_id                UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  created_by            UUID REFERENCES auth.users(id),
  endpoint              TEXT NOT NULL,        -- "/v1/chat/completions" | "/v1/embeddings"
  input_file_id         TEXT NOT NULL REFERENCES inference.files(id),
  output_file_id        TEXT REFERENCES inference.files(id),
  error_file_id         TEXT REFERENCES inference.files(id),
  status                inference.batch_status NOT NULL DEFAULT 'validating',
  /** "24h" for now; future: "7d". Stored as text for forward-compat. */
  completion_window     TEXT NOT NULL DEFAULT '24h',
  /** { total, completed, failed } — total set at validation, others by processor. */
  request_counts        JSONB NOT NULL DEFAULT '{"total":0,"completed":0,"failed":0}'::JSONB,
  /** Free-form caller-supplied tags. OpenAI caps at 16 key/values. */
  metadata              JSONB NOT NULL DEFAULT '{}'::JSONB,
  /** If validation failed, the human-readable reason. */
  errors                JSONB,
  /** Timestamps that match OpenAI's batch response shape. */
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  in_progress_at        TIMESTAMPTZ,
  finalizing_at         TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  expired_at            TIMESTAMPTZ,
  cancelling_at         TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ NOT NULL  -- computed at create: now() + completion_window
);

CREATE INDEX idx_batches_org_created    ON inference.batches(org_id, created_at DESC);
CREATE INDEX idx_batches_processor_pool ON inference.batches(status, created_at)
  WHERE status IN ('validating', 'in_progress');

-- ─── 5. Updated_at trigger for files (deleted_at acts as soft delete) ──
-- Not used today; batches have explicit lifecycle timestamps instead.

-- ─── 6. RLS ──────────────────────────────────────────────────────
ALTER TABLE inference.files   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY files_member_select   ON inference.files   FOR SELECT
  USING (inference.is_org_member(org_id));
CREATE POLICY files_admin_write     ON inference.files   FOR ALL
  USING (inference.is_org_admin(org_id))
  WITH CHECK (inference.is_org_admin(org_id));

CREATE POLICY batches_member_select ON inference.batches FOR SELECT
  USING (inference.is_org_member(org_id));
CREATE POLICY batches_admin_write   ON inference.batches FOR ALL
  USING (inference.is_org_admin(org_id))
  WITH CHECK (inference.is_org_admin(org_id));

-- ─── 7. Usage table — mark batch-sourced rows for the 50% discount ──
-- We don't change pricing here; the worker's usage event carries
-- is_batch=true and the existing consumers/usage.ts logic will apply
-- the discount at billing time (see follow-up worker change).
ALTER TABLE inference.usage ADD COLUMN IF NOT EXISTS is_batch BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inference.usage ADD COLUMN IF NOT EXISTS batch_id TEXT REFERENCES inference.batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usage_batch ON inference.usage(batch_id) WHERE batch_id IS NOT NULL;

-- ─── 8. Audit enum extensions ────────────────────────────────────
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'file.uploaded';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'file.deleted';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'batch.created';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'batch.cancelled';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'batch.completed';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'batch.failed';
