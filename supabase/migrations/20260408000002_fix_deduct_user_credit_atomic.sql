-- Fix billing.deduct_user_credit_atomic:
-- Add SECURITY DEFINER so the function runs as its owner (postgres), not the caller.
-- Without this, service_role could be blocked by RLS on billing.user_credits.
-- Note: GRANT EXECUTE is in the next migration file (CLI cannot handle multiple
-- statements when a CREATE FUNCTION dollar-quote body is present in the same file).

CREATE OR REPLACE FUNCTION billing.deduct_user_credit_atomic(p_user_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_balance numeric;
BEGIN
  SELECT credit_balance
  INTO v_balance
  FROM billing.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User credit record not found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credit balance';
  END IF;

  UPDATE billing.user_credits
  SET credit_balance = credit_balance - p_amount
  WHERE user_id = p_user_id;
END;
$function$;
