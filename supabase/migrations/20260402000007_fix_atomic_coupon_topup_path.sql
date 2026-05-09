-- Fix atomic coupon redeem topup path to avoid dependency on
-- ON CONFLICT(user_id) when user_credits may not have a unique user_id constraint.
-- Also handles concurrent insert races safely.

CREATE OR REPLACE FUNCTION billing.billing_redeem_promocode_atomic(
  p_code TEXT,
  p_user_id UUID,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
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

  SELECT *
  INTO v_promo
  FROM billing.promocodes
  WHERE code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You have entered an invalid promo code'
    );
  END IF;

  IF v_promo.is_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'This promo code is not active');
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

  v_redemption_count := jsonb_array_length(v_redeem_by);
  IF v_promo.max_redemptions IS NOT NULL
     AND v_redemption_count >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Promo code redemption limit reached'
    );
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

  -- Update existing user_credits row first.
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
        -- Another concurrent transaction created the row. Update it now.
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
$$;

REVOKE ALL ON FUNCTION billing.billing_redeem_promocode_atomic(
  TEXT,
  UUID,
  TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION billing.billing_redeem_promocode_atomic(
  TEXT,
  UUID,
  TEXT
) TO service_role;
