-- Atomic billing functions to prevent race conditions
-- These prevent double-crediting and overdraft from concurrent requests

-- 1. Atomic topup: increments balance in a single UPDATE, returns new balance
CREATE OR REPLACE FUNCTION billing_topup(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
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

-- 2. Atomic deduct: decrements balance only if sufficient, returns new balance
--    Returns -1 if insufficient balance (caller should throw error)
CREATE OR REPLACE FUNCTION billing_deduct(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  UPDATE billing.user_credits
  SET credit_balance = credit_balance - p_amount
  WHERE user_id = p_user_id
    AND credit_balance >= p_amount
  RETURNING credit_balance INTO v_new_balance;

  IF NOT FOUND THEN
    -- Check if user exists but has insufficient balance
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

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION billing_topup(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION billing_deduct(UUID, NUMERIC) TO service_role;
