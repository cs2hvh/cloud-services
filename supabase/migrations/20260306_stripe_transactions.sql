-- Stripe Integration: Add transactions table and stripe_customer_id column
-- Run this migration against your Supabase database

-- 1. Add stripe_customer_id to user_credits (maps users to Stripe customers)
ALTER TABLE billing.user_credits
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- 2. Create transactions table for payment audit trail + idempotency
CREATE TABLE IF NOT EXISTS billing.transactions (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  stripe_session_id     TEXT UNIQUE NOT NULL,
  stripe_payment_intent TEXT,
  amount                NUMERIC(10,2) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'usd',
  status                TEXT NOT NULL DEFAULT 'pending',
  type                  TEXT NOT NULL DEFAULT 'topup',
  created_at            TIMESTAMPTZ DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  
  CONSTRAINT transactions_status_check CHECK (status IN ('pending', 'completed', 'failed')),
  CONSTRAINT transactions_type_check CHECK (type IN ('topup', 'refund')),
  CONSTRAINT transactions_amount_positive CHECK (amount > 0)
);

-- 3. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON billing.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session_id ON billing.transactions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON billing.transactions(created_at DESC);

-- 4. RLS policies (service_role bypasses RLS; users can only read their own transactions)
ALTER TABLE billing.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions"
  ON billing.transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only service_role (webhook) can insert/update transactions
CREATE POLICY "Service role can manage transactions"
  ON billing.transactions
  FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE billing.transactions IS 'Stripe payment transactions for balance top-ups. Used for idempotency (unique stripe_session_id) and audit trail.';
COMMENT ON COLUMN billing.transactions.stripe_session_id IS 'Stripe Checkout Session ID - unique constraint prevents double-crediting on webhook retries';
COMMENT ON COLUMN billing.user_credits.stripe_customer_id IS 'Maps user to Stripe Customer object for checkout sessions';
