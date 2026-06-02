-- L1 + L3 — billing RPC amount guards + drop the dormant self-update RLS policy.
--
-- L1: billing_topup / billing_deduct (20260314) had no amount validation. A future
-- un-validated caller passing a negative amount to billing_deduct would INFLATE the
-- balance (credit_balance - (-5) = +5). Add a NULL / <= 0 / NaN guard, mirroring the
-- hardened deduct_user_credit_atomic / bill_service_cycle_atomic. Recreated with the
-- C1 search_path pin; grants are re-asserted (service_role only) afterwards.
--
-- L3: 20260321072918 left a "Users can update own credits" UPDATE policy on
-- billing.user_credits. It is currently dormant (authenticated has no UPDATE grant),
-- but the policy only checks row ownership, not column immutability — so a future
-- GRANT UPDATE would silently re-open self-balance inflation. Drop it; the
-- service_role-only FOR ALL policy is the sole intended writer.

-- ── L1: billing_topup with amount guard ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.billing_topup(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, billing
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount::TEXT = 'NaN' THEN
    RAISE EXCEPTION 'Invalid top-up amount: %', p_amount;
  END IF;

  UPDATE billing.user_credits
  SET credit_balance = credit_balance + p_amount
  WHERE user_id = p_user_id
  RETURNING credit_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found in user_credits', p_user_id;
  END IF;

  RETURN v_new_balance;
END;
$$;

-- ── L1: billing_deduct with amount guard ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.billing_deduct(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, billing
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount::TEXT = 'NaN' THEN
    RAISE EXCEPTION 'Invalid deduction amount: %', p_amount;
  END IF;

  UPDATE billing.user_credits
  SET credit_balance = credit_balance - p_amount
  WHERE user_id = p_user_id
    AND credit_balance >= p_amount
  RETURNING credit_balance INTO v_new_balance;

  IF NOT FOUND THEN
    PERFORM 1 FROM billing.user_credits WHERE user_id = p_user_id;
    IF FOUND THEN
      RETURN -1; -- Insufficient balance
    ELSE
      RAISE EXCEPTION 'User % not found in user_credits', p_user_id;
    END IF;
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Re-assert the C1 lockdown (CREATE OR REPLACE preserves grants, but be explicit).
REVOKE ALL ON FUNCTION public.billing_topup(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_deduct(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_topup(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_deduct(uuid, numeric) TO service_role;

-- ── L3: drop the dormant self-update policy ─────────────────────────────────
DROP POLICY IF EXISTS "Users can update own credits" ON billing.user_credits;
