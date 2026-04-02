-- Recurring billing support (Stripe subscriptions for auto top-up)

-- 1) Recurring top-up settings per user
CREATE TABLE IF NOT EXISTS billing.recurring_topups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  interval TEXT NOT NULL CHECK (interval IN ('week', 'month', 'year')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'trialing', 'paused')
  ),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_topups_user_id ON billing.recurring_topups(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_topups_subscription_id ON billing.recurring_topups(stripe_subscription_id);

ALTER TABLE billing.recurring_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own recurring topups" ON billing.recurring_topups;
CREATE POLICY "Users can view their own recurring topups"
  ON billing.recurring_topups
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage recurring topups" ON billing.recurring_topups;
CREATE POLICY "Service role can manage recurring topups"
  ON billing.recurring_topups
  FOR ALL
  USING (auth.role() = 'service_role');

REVOKE ALL ON billing.recurring_topups FROM authenticated;
GRANT SELECT ON billing.recurring_topups TO authenticated;
GRANT ALL ON billing.recurring_topups TO service_role;

-- 2) Track invoice id for recurring webhook idempotency
ALTER TABLE billing.transactions
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_stripe_invoice_id_unique
  ON billing.transactions(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

-- 3) Extend transaction type enum/check to include recurring top-ups
ALTER TABLE billing.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE billing.transactions
  ADD CONSTRAINT transactions_type_check CHECK (type IN ('topup', 'refund', 'coupon', 'recurring'));

COMMENT ON TABLE billing.recurring_topups IS 'Per-user recurring billing configuration for automatic Stripe subscription top-ups.';
COMMENT ON COLUMN billing.transactions.stripe_invoice_id IS 'Stripe Invoice ID, used for idempotency on recurring billing webhooks.';
