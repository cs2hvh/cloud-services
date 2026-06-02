-- H1 (HIGH) — bill_service_cycle_atomic advanced last_billed_at BEFORE checking
-- the balance, so an insufficient-credit cycle moved the meter cursor forward and
-- the unpaid window was silently written off (free hours, recurring every cycle).
--
-- Fix: verify funds and perform the deduction FIRST; only advance last_billed_at
-- once the charge actually succeeds. On insufficient credit the cursor is left
-- untouched, so the accrued usage is re-attempted next cycle (and settled after a
-- top-up) while the grace lifecycle handles eventual non-payment.
--
-- The FOR UPDATE row locks and the last_billed_at compare-and-swap that make the
-- cron double-charge-proof are preserved EXACTLY; only the order of the
-- (balance-check + deduct) and the (cursor-advance) steps is swapped. Recreated
-- from 20260615000006 (same allowlist, same lookup-column logic, same grants).

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
          'active_platform_apps',
          'active_inference_vector',
          'active_compute',
          'active_custom_image',
          'active_gpu_pods'
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

      -- Lock the active service row and read its current meter cursor.
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

      -- Compare-and-swap guard: bail if another worker already advanced the cursor.
      IF p_expected_last_billed_at IS DISTINCT FROM v_current_last_billed_at THEN
        RETURN jsonb_build_object('charged', FALSE, 'status', 'stale_last_billed_at', 'new_balance', NULL);
      END IF;

      -- H1 FIX: verify funds and deduct BEFORE moving the meter cursor.
      SELECT credit_balance
      INTO v_balance
      FROM billing.user_credits
      WHERE user_id = p_user_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('charged', FALSE, 'status', 'credit_record_not_found', 'new_balance', NULL);
      END IF;

      IF v_balance < p_amount THEN
        -- Leave last_billed_at UNTOUCHED so the unpaid window is re-billed next
        -- cycle (after a top-up) instead of being silently written off.
        RETURN jsonb_build_object('charged', FALSE, 'status', 'insufficient_credit', 'new_balance', v_balance);
      END IF;

      UPDATE billing.user_credits
      SET credit_balance = credit_balance - p_amount
      WHERE user_id = p_user_id
      RETURNING credit_balance INTO v_new_balance;

      -- Charge succeeded — only now advance the meter cursor (still under the row lock).
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
