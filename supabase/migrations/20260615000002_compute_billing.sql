-- Metered billing for Compute / Virtual Servers.
--
-- VPS instances were balance-gated at create but NEVER actually charged: no
-- active-meter row, not in the 5-minute cron, delete only stamped billing_end.
-- This wires compute into the same metered-cron + grace lifecycle as
-- Database / Kubernetes: charge hourly while running, prorate on delete, and
-- after the 7-day grace period auto-delete on non-payment.
--
-- The cron's atomic billing RPC keys on a UUID service id, but servers.id is a
-- bigint — so we add a UUID billing key on servers and key the meter off it.

ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS billing_service_id UUID NOT NULL DEFAULT gen_random_uuid();

-- Backfill is automatic (DEFAULT applies to existing rows). Enforce uniqueness
-- so it can be the meter's service_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_billing_service_id
  ON public.servers (billing_service_id);

COMMENT ON COLUMN public.servers.billing_service_id IS
  'Stable UUID billing key for this server (billing.active_compute.service_id + grace lifecycle). servers.id is bigint, which the UUID-keyed billing cron cannot use.';

CREATE TABLE IF NOT EXISTS billing.active_compute (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL,            -- = public.servers.billing_service_id
  hourly_rate     NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paused','grace','terminated')),
  last_billed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id)
);

CREATE INDEX IF NOT EXISTS idx_active_compute_user    ON billing.active_compute (user_id);
CREATE INDEX IF NOT EXISTS idx_active_compute_service ON billing.active_compute (service_id);
CREATE INDEX IF NOT EXISTS idx_active_compute_status  ON billing.active_compute (status, last_billed_at);

COMMENT ON COLUMN billing.active_compute.service_id IS 'References public.servers.billing_service_id.';

-- Reuse the shared updated_at trigger fn from the GPU service migration.
DROP TRIGGER IF EXISTS trg_active_compute_updated_at ON billing.active_compute;
CREATE TRIGGER trg_active_compute_updated_at BEFORE UPDATE ON billing.active_compute
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

ALTER TABLE billing.active_compute ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON billing.active_compute TO authenticated;
GRANT ALL    ON billing.active_compute TO service_role;

DO $$ BEGIN
  CREATE POLICY "Users can view own active compute" ON billing.active_compute
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages active compute" ON billing.active_compute
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
