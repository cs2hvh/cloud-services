-- Harden billing schema RLS for credit/security-sensitive tables.
-- Goal: ensure authenticated users can only read their own rows and
-- only service_role can mutate balances/transactions.

-- -----------------------------------------------------------------------------
-- billing.user_credits
-- -----------------------------------------------------------------------------
ALTER TABLE billing.user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own credits" ON billing.user_credits;
CREATE POLICY "Users can view their own credits"
  ON billing.user_credits
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage user credits" ON billing.user_credits;
CREATE POLICY "Service role can manage user credits"
  ON billing.user_credits
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON billing.user_credits FROM authenticated;
GRANT SELECT ON billing.user_credits TO authenticated;
GRANT ALL ON billing.user_credits TO service_role;

-- -----------------------------------------------------------------------------
-- billing.transactions
-- -----------------------------------------------------------------------------
ALTER TABLE billing.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own transactions" ON billing.transactions;
CREATE POLICY "Users can view their own transactions"
  ON billing.transactions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage transactions" ON billing.transactions;
CREATE POLICY "Service role can manage transactions"
  ON billing.transactions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON billing.transactions FROM authenticated;
GRANT SELECT ON billing.transactions TO authenticated;
GRANT ALL ON billing.transactions TO service_role;
