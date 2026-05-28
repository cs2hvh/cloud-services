-- Fixes found while testing the standalone credit-system cron worker:
--
-- 1. Usage ledger inserts can fail for users with very large balances because
--    billing.transactions.balance_after was NUMERIC(10,2).
-- 2. billing.bill_service_cycle_atomic advanced service last_billed_at before
--    confirming that credits were actually deducted. If a user had insufficient
--    credits, unpaid usage could be skipped.

ALTER TABLE billing.transactions
  ALTER COLUMN balance_after TYPE NUMERIC(18,2);

DO $outer$
BEGIN
  EXECUTE $exec$
    CREATE OR REPLACE FUNCTION billing.bill_service_cycle_atomic(
      p_table_name TEXT,
      p_service_id UUID,
      p_user_id UUID,
      p_amount NUMERIC,
      p_new_last_billed_at TIMESTAMPTZ,
      p_expected_last_billed_at TIMESTAMPTZ DEFAULT NULL
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    AS $fn$
    DECLARE
      v_service_status TEXT;
      v_current_last_billed_at TIMESTAMPTZ;
      v_balance NUMERIC;
      v_new_balance NUMERIC;
      v_lookup_column TEXT;
    BEGIN
      IF p_table_name IS NULL OR p_table_name = '' THEN
        RAISE EXCEPTION 'Invalid table name';
      END IF;

      IF p_table_name <> ALL (
        ARRAY[
          'active_kubernetes',
          'active_database',
          'active_objectspace',
          'active_spectrum',
          'active_platform_apps'
        ]
      ) THEN
        RAISE EXCEPTION 'Unsupported billing table: %', p_table_name;
      END IF;

      IF p_amount IS NULL OR p_amount <= 0 OR p_amount::TEXT = 'NaN' THEN
        RAISE EXCEPTION 'Invalid billing amount';
      END IF;

      IF p_new_last_billed_at IS NULL THEN
        RAISE EXCEPTION 'Invalid billed timestamp';
      END IF;

      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'billing'
            AND table_name = p_table_name
            AND column_name = 'service_id'
        ) THEN 'service_id'
        WHEN EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'billing'
            AND table_name = p_table_name
            AND column_name = 'id'
        ) THEN 'id'
        ELSE NULL
      END
      INTO v_lookup_column;

      IF v_lookup_column IS NULL THEN
        RAISE EXCEPTION 'Billing table % has no lookup key column', p_table_name;
      END IF;

      EXECUTE format(
        'SELECT status, last_billed_at FROM billing.%I WHERE %I = $1 FOR UPDATE',
        p_table_name,
        v_lookup_column
      )
      INTO v_service_status, v_current_last_billed_at
      USING p_service_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('charged', FALSE, 'status', 'service_not_found', 'new_balance', NULL);
      END IF;

      IF v_service_status IS DISTINCT FROM 'active' THEN
        RETURN jsonb_build_object('charged', FALSE, 'status', 'service_not_active', 'new_balance', NULL);
      END IF;

      IF p_expected_last_billed_at IS DISTINCT FROM v_current_last_billed_at THEN
        RETURN jsonb_build_object('charged', FALSE, 'status', 'stale_last_billed_at', 'new_balance', NULL);
      END IF;

      SELECT credit_balance
      INTO v_balance
      FROM billing.user_credits
      WHERE user_id = p_user_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('charged', FALSE, 'status', 'credit_record_not_found', 'new_balance', NULL);
      END IF;

      IF v_balance < p_amount THEN
        RETURN jsonb_build_object('charged', FALSE, 'status', 'insufficient_credit', 'new_balance', v_balance);
      END IF;

      UPDATE billing.user_credits
      SET credit_balance = credit_balance - p_amount
      WHERE user_id = p_user_id
      RETURNING credit_balance INTO v_new_balance;

      EXECUTE format(
        'UPDATE billing.%I SET last_billed_at = $1 WHERE %I = $2',
        p_table_name,
        v_lookup_column
      )
      USING p_new_last_billed_at, p_service_id;

      RETURN jsonb_build_object('charged', TRUE, 'status', 'charged', 'new_balance', v_new_balance);
    END;
    $fn$
  $exec$;
END $outer$;

DO $$
BEGIN
  IF to_regprocedure('billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) FROM PUBLIC;
    REVOKE ALL ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) FROM anon;
    REVOKE ALL ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) FROM authenticated;
    GRANT EXECUTE ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) TO service_role;
  END IF;
END $$;

