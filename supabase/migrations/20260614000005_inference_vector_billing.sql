-- Metered billing for managed vector collections.
-- Each active collection is a billable resource at a flat monthly rate
-- (stored as an hourly rate, hourly_rate = monthly / 720), billed by the same
-- 5-minute credit cron that meters Kubernetes / Database / GPU pods — so it
-- gets proration + the 7-day grace → auto-delete lifecycle for free.
--
-- service_id = inference.vector_collections.id (UUID).

CREATE TABLE IF NOT EXISTS billing.active_inference_vector (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL,
  hourly_rate     NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paused','grace','terminated')),
  last_billed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id)
);

CREATE INDEX IF NOT EXISTS idx_active_inference_vector_user   ON billing.active_inference_vector (user_id);
CREATE INDEX IF NOT EXISTS idx_active_inference_vector_service ON billing.active_inference_vector (service_id);
CREATE INDEX IF NOT EXISTS idx_active_inference_vector_status ON billing.active_inference_vector (status, last_billed_at);

COMMENT ON COLUMN billing.active_inference_vector.service_id IS 'References inference.vector_collections.id.';

-- Reuse the shared updated_at trigger fn from the GPU service migration.
DROP TRIGGER IF EXISTS trg_active_inference_vector_updated_at ON billing.active_inference_vector;
CREATE TRIGGER trg_active_inference_vector_updated_at BEFORE UPDATE ON billing.active_inference_vector
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

ALTER TABLE billing.active_inference_vector ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON billing.active_inference_vector TO authenticated;
GRANT ALL    ON billing.active_inference_vector TO service_role;

DO $$ BEGIN
  CREATE POLICY "Users can view own active vector collections" ON billing.active_inference_vector
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages active vector collections" ON billing.active_inference_vector
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
