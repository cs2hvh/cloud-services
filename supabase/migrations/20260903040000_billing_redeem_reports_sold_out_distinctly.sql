-- A sold-out coupon should say so, not claim it was switched off.
--
-- billing_redeem_promocode_atomic checked is_active BEFORE max_redemptions.
-- The auto-deactivate branch flips is_active the moment a 'limited' code hits
-- its cap, so the last person to try was told "This promo code is not active" —
-- indistinguishable from an operator having killed the code deliberately.
--
-- Verified live on 2026-09-02 with TESTCOUPON1 (cap 2): user C, arriving after
-- the cap was reached, got "not active" and never reached the limit check.
--
-- The admin panel already ranks these two states correctly in its own display
-- ("exhausted" outranks "suspended"). The customer-facing message did not, and
-- "we switched it off" invites a support ticket that "the limit was reached"
-- answers by itself.
--
-- ORDERING, most specific first:
--   expired -> already redeemed -> limit reached -> not active
--
-- `already redeemed` stays ahead of the cap check on purpose: a user who has
-- redeemed already should hear that, not "limit reached", even when both are
-- true. is_active moves last because it is now the residual case — an operator
-- act rather than a rule the code hit on its own.
--
-- NOTHING BECOMES MORE PERMISSIVE. is_active is still checked, still before any
-- credit is issued; only which refusal a caller hears has changed.

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

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_promo.amount,
    'balance', v_new_balance
  );
END;
$function$;
