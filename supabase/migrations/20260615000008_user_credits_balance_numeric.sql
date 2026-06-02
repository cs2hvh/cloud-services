-- ════════════════════════════════════════════════════════════════════════════
-- CRITICAL money-correctness fix: credit_balance was REAL (float4)
-- ════════════════════════════════════════════════════════════════════════════
-- billing.user_credits.credit_balance was stored as `real` (single-precision
-- float, ~7 significant digits). Deductions silently round away once a balance
-- is large: at a balance of ~6.5e8 the float4 step (ULP) is ~64, so a $0.04 or
-- even $5 charge computes back to the same value and the balance never moves.
-- Small balances (a few hundred $) bill fine, which masked the bug.
--
-- Money must be exact. Convert to NUMERIC. The USING cast preserves each row's
-- current stored value; future deductions then apply exactly at any magnitude.
-- amount / balance_after on billing.transactions are already numeric.
ALTER TABLE billing.user_credits
  ALTER COLUMN credit_balance TYPE NUMERIC(20, 6)
  USING credit_balance::numeric;

ALTER TABLE billing.user_credits
  ALTER COLUMN credit_balance SET DEFAULT 0;

-- Same float4 bug in two more money columns (the other billing.active_* tables
-- already use NUMERIC(12,6)). active_kubernetes.hourly_rate and products.fixed_price
-- are small enough today that they bill, but money should be exact everywhere.
ALTER TABLE billing.active_kubernetes
  ALTER COLUMN hourly_rate TYPE NUMERIC(12, 6)
  USING hourly_rate::numeric;

ALTER TABLE public.products
  ALTER COLUMN fixed_price TYPE NUMERIC(12, 2)
  USING fixed_price::numeric;

