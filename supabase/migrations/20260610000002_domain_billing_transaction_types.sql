-- Extend billing.transactions to support domain purchase and refund events.
-- Adds 'domain' to service_type and 'purchase' to type constraints.

ALTER TABLE billing.transactions
  DROP CONSTRAINT IF EXISTS transactions_service_type_check;

ALTER TABLE billing.transactions
  ADD CONSTRAINT transactions_service_type_check CHECK (
    service_type IS NULL
    OR service_type IN ('database', 'kubernetes', 'objectspace', 'spectrum', 'platform_apps', 'domain')
  );

ALTER TABLE billing.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE billing.transactions
  ADD CONSTRAINT transactions_type_check CHECK (
    type IN ('topup', 'refund', 'coupon', 'recurring', 'setup', 'usage', 'purchase')
  );
