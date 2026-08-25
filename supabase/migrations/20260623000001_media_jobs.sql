-- Media jobs table for async video/music generation.
-- See nextstespsAI/01-multimodal-apis.md §4 for the full data model.
-- Workers create a row and return 202 immediately;
-- the media-runner (or Worker waitUntil for fast upstreams) settles the job.

-- Must run outside a transaction (Postgres restriction on enum ADD VALUE).
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'video';

CREATE TABLE IF NOT EXISTS inference.media_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  api_key_id      UUID REFERENCES inference.api_keys(id) ON DELETE SET NULL,
  modality        inference.model_modality NOT NULL,
  model_id        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','completed','failed','canceled')),
  request_params  JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_r2_key    TEXT,
  output_r2_key   TEXT,
  output_url      TEXT,
  num_units       NUMERIC(14,4),
  unit_label      TEXT,
  cost_cents      INTEGER NOT NULL DEFAULT 0,
  error_code      TEXT,
  claimed_at      TIMESTAMPTZ,
  heartbeat_at    TIMESTAMPTZ,
  deadline_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_jobs_claim
  ON inference.media_jobs (status, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_media_jobs_org
  ON inference.media_jobs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_jobs_watchdog
  ON inference.media_jobs (status, deadline_at)
  WHERE status IN ('queued','running');

ALTER TABLE inference.media_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.media_jobs TO authenticated;
GRANT ALL    ON inference.media_jobs TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read org media jobs" ON inference.media_jobs
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages media jobs" ON inference.media_jobs
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_media_jobs_updated_at ON inference.media_jobs;
CREATE TRIGGER trg_media_jobs_updated_at
  BEFORE UPDATE ON inference.media_jobs
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

-- Seed the first video model (update upstream_model_id to match your OpenRouter model)
INSERT INTO inference.models (
  model_id, display_name, modality, serving_type, upstream_provider, upstream_model_id,
  is_active, is_featured, sort_order,
  capabilities, pricing
) VALUES (
  'ahura/video-gen',
  'Video Gen',
  'video',
  'proxy',
  'openrouter',
  'google/veo-2.0-generate-001',
  true, true, 1,
  '{"async": true}'::jsonb,
  '{"cents_per_media_second": 50}'::jsonb
) ON CONFLICT (model_id) DO UPDATE SET
  upstream_model_id = EXCLUDED.upstream_model_id,
  serving_type      = EXCLUDED.serving_type,
  is_active         = EXCLUDED.is_active,
  pricing           = EXCLUDED.pricing,
  updated_at        = now();
