-- Extend billing.transactions into a service-usage ledger.
-- This keeps Stripe/coupon credits and service deductions in one audit trail.

ALTER TABLE billing.transactions
  ADD COLUMN IF NOT EXISTS service_id UUID,
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE billing.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE billing.transactions
  ADD CONSTRAINT transactions_type_check CHECK (
    type IN ('topup', 'refund', 'coupon', 'recurring', 'setup', 'usage')
  );

ALTER TABLE billing.transactions
  DROP CONSTRAINT IF EXISTS transactions_service_type_check;

ALTER TABLE billing.transactions
  ADD CONSTRAINT transactions_service_type_check CHECK (
    service_type IS NULL OR service_type IN ('database', 'kubernetes', 'objectspace', 'spectrum', 'platform_apps')
  );

CREATE INDEX IF NOT EXISTS idx_transactions_service_id
  ON billing.transactions(service_id)
  WHERE service_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_type_created_at
  ON billing.transactions(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_period_end
  ON billing.transactions(period_end DESC)
  WHERE period_end IS NOT NULL;

COMMENT ON COLUMN billing.transactions.service_id IS 'Associated service row id for service billing events.';
COMMENT ON COLUMN billing.transactions.service_type IS 'Service category for setup and usage transactions.';
COMMENT ON COLUMN billing.transactions.period_start IS 'Inclusive start of the metered billing window.';
COMMENT ON COLUMN billing.transactions.period_end IS 'Exclusive end of the metered billing window.';
COMMENT ON COLUMN billing.transactions.metadata IS 'Additional structured context for billing events.';
