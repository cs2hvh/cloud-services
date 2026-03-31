-- Create billing.deduct_user_credit_atomic function
-- Separated from db pull snapshot due to CLI parser issue with CREATE FUNCTION in billing schema context
CREATE OR REPLACE FUNCTION billing.deduct_user_credit_atomic(p_user_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_balance numeric;
BEGIN
  -- Lock the row to prevent race conditions
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
$function$
;;
