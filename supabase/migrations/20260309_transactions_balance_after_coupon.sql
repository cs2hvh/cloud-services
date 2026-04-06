-- Add balance_after column, coupon support, and description to transactions
-- Run this migration after 20260306_stripe_transactions.sql

-- 1. Add balance_after column (stores user balance after this transaction)
ALTER TABLE billing.transactions
  ADD COLUMN IF NOT EXISTS balance_after NUMERIC(10,2);
-- 2. Add description column (stores coupon code or other context)
ALTER TABLE billing.transactions
  ADD COLUMN IF NOT EXISTS description TEXT;
-- 3. Make stripe_session_id nullable (coupon transactions don't have one)
ALTER TABLE billing.transactions
  ALTER COLUMN stripe_session_id DROP NOT NULL;
-- 4. Drop the old unique constraint on stripe_session_id and re-add as partial unique
--    (only enforce uniqueness for non-null values)
ALTER TABLE billing.transactions
  DROP CONSTRAINT IF EXISTS transactions_stripe_session_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_stripe_session_id_unique
  ON billing.transactions(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
-- 5. Update type check constraint to include 'coupon'
ALTER TABLE billing.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE billing.transactions
  ADD CONSTRAINT transactions_type_check CHECK (type IN ('topup', 'refund', 'coupon'));
COMMENT ON COLUMN billing.transactions.balance_after IS 'User credit balance after this transaction was applied';
COMMENT ON COLUMN billing.transactions.description IS 'Additional context (e.g. coupon code for coupon transactions)';
