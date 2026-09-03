-- Coupon credit and its ledger row now commit together.
--
-- Applied to production as schema_migrations version 20260903072444.
--
-- The credit was already atomic inside billing_redeem_promocode_atomic. The
-- ledger row was not: app/api/billing/coupons/redeem/route.ts wrote it
-- afterwards, in a try/catch whose comment read
--
--     // Don't fail the redemption — credits are already added
--
-- which is exactly how the 2026-08 audit found $110 of coupon credit sitting
-- in a balance with nothing in billing.transactions explaining it. The row now
-- lives inside the same transaction as the credit: if it cannot be written,
-- the credit and the redemption both roll back and the customer simply tries
-- again.
--
-- This is the coupon half of the change in
-- 20260903050000_billing_money_moves_with_its_record.sql. Coupons get it here
-- rather than through billing.move_credit because the credit already lived in
-- this function, alongside the redemption bookkeeping it has to stay atomic
-- with.

create or replace function billing.billing_redeem_promocode_atomic(
  p_code text, p_user_id uuid, p_email text
)
returns jsonb
language plpgsql
security definer
set search_path to 'billing', 'public'
as $function$
DECLARE
  v_promo billing.promocodes%ROWTYPE;
  v_redeem_by JSONB;
  v_redemption_count INTEGER;
  v_new_balance NUMERIC;
  v_txn_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_code TEXT := UPPER(BTRIM(COALESCE(p_code, '')));
  v_email TEXT := LOWER(BTRIM(COALESCE(p_email, '')));
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Promo code is required');
  END IF;

  IF p_user_id IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_promo
  FROM billing.promocodes
  WHERE code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You have entered an invalid promo code'
    );
  END IF;

  IF v_promo.valid_till < v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'Promo code has expired');
  END IF;

  v_redeem_by := COALESCE(v_promo.redeem_by, '[]'::jsonb);

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_redeem_by) AS elem
    WHERE elem->>'userId' = p_user_id::text
       OR LOWER(COALESCE(elem->>'email', '')) = v_email
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You have already redeemed this promo code'
    );
  END IF;

  -- Cap before is_active: a code that sold out reached its own limit, and
  -- saying so is both true and more useful than reporting an operator act.
  v_redemption_count := jsonb_array_length(v_redeem_by);
  IF v_promo.max_redemptions IS NOT NULL
     AND v_redemption_count >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Promo code redemption limit reached'
    );
  END IF;

  -- The residual case: still switched off, still refused, still before credit.
  IF v_promo.is_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'This promo code is not active');
  END IF;

  v_redeem_by := v_redeem_by || jsonb_build_array(
    jsonb_build_object(
      'userId', p_user_id::text,
      'email', p_email,
      'redeemedAt', v_now
    )
  );

  UPDATE billing.promocodes
  SET
    redeem_by = v_redeem_by,
    updated_at = v_now,
    is_active = CASE
      WHEN coupon_type = 'limited'
        AND max_redemptions IS NOT NULL
        AND jsonb_array_length(v_redeem_by) >= max_redemptions
      THEN FALSE
      ELSE is_active
    END
  WHERE id = v_promo.id;

  UPDATE billing.user_credits
  SET credit_balance = credit_balance + v_promo.amount
  WHERE user_id = p_user_id
  RETURNING credit_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    BEGIN
      INSERT INTO billing.user_credits (user_id, credit_balance)
      VALUES (p_user_id, v_promo.amount)
      RETURNING credit_balance INTO v_new_balance;
    EXCEPTION
      WHEN unique_violation THEN
        UPDATE billing.user_credits
        SET credit_balance = credit_balance + v_promo.amount
        WHERE user_id = p_user_id
        RETURNING credit_balance INTO v_new_balance;
    END;
  END IF;

  -- The ledger row, inside this transaction with the credit.
  INSERT INTO billing.transactions (
    user_id, amount, currency, status, type, balance_after, description,
    metadata, completed_at
  )
  VALUES (
    p_user_id, v_promo.amount, 'usd', 'completed', 'coupon',
    v_new_balance, v_code,
    jsonb_build_object('promocode_id', v_promo.id, 'coupon_type', v_promo.coupon_type),
    v_now
  )
  RETURNING id INTO v_txn_id;

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_promo.amount,
    'balance', v_new_balance,
    'transactionId', v_txn_id
  );
END;
$function$;
