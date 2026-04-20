-- Harden hourly billing cron safety without changing billing flow.
-- Fixes: atomic per-service cycle lock, timestamp/deduction race, input guards,
-- RPC permissions, active-table bounds, and failure remediation tracking.

CREATE TABLE IF NOT EXISTS billing.billing_failure_events (
  id BIGSERIAL PRIMARY KEY,
  service_table TEXT NOT NULL,
  service_id UUID NOT NULL,
  user_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  failure_type TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  billing_attempted_at TIMESTAMPTZ,
  last_billed_at TIMESTAMPTZ,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_failure_events_lookup
  ON billing.billing_failure_events(service_table, service_id, user_id, resolved);

CREATE INDEX IF NOT EXISTS idx_billing_failure_events_occurred_at
  ON billing.billing_failure_events(occurred_at DESC);

ALTER TABLE billing.billing_failure_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage billing failure events" ON billing.billing_failure_events;
CREATE POLICY "Service role can manage billing failure events"
  ON billing.billing_failure_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON billing.billing_failure_events FROM anon;
REVOKE ALL ON billing.billing_failure_events FROM authenticated;
GRANT ALL ON billing.billing_failure_events TO service_role;

DO $$
BEGIN
  IF to_regclass('billing.billing_failure_events_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE billing.billing_failure_events_id_seq FROM anon;
    REVOKE ALL ON SEQUENCE billing.billing_failure_events_id_seq FROM authenticated;
    GRANT ALL ON SEQUENCE billing.billing_failure_events_id_seq TO service_role;
  END IF;
END $$;

DO $outer$
BEGIN
  EXECUTE $exec$
    CREATE OR REPLACE FUNCTION billing.deduct_user_credit_atomic(
      p_user_id UUID,
      p_amount NUMERIC
    )
    RETURNS VOID
    LANGUAGE plpgsql
    AS $fn$
    DECLARE
      v_balance NUMERIC;
    BEGIN
      IF p_amount IS NULL OR p_amount <= 0 OR p_amount::TEXT = 'NaN' THEN
        RAISE EXCEPTION 'Invalid deduction amount';
      END IF;

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
    $fn$
  $exec$;
END $outer$;

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

      EXECUTE format(
        'SELECT status, last_billed_at FROM billing.%I WHERE service_id = $1 FOR UPDATE',
        p_table_name
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

      EXECUTE format(
        'UPDATE billing.%I SET last_billed_at = $1 WHERE service_id = $2',
        p_table_name
      )
      USING p_new_last_billed_at, p_service_id;

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

      RETURN jsonb_build_object('charged', TRUE, 'status', 'charged', 'new_balance', v_new_balance);
    END;
    $fn$
  $exec$;
END $outer$;

DO $$
DECLARE
  v_table_name TEXT;
  v_rate_constraint TEXT;
  v_status_constraint TEXT;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'active_kubernetes',
    'active_database',
    'active_objectspace',
    'active_spectrum',
    'active_platform_apps'
  ]
  LOOP
    IF to_regclass(format('billing.%I', v_table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    v_rate_constraint := format('%s_hourly_rate_bounds_check', v_table_name);
    v_status_constraint := format('%s_status_bounds_check', v_table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'billing'
        AND r.relname = v_table_name
        AND c.conname = v_rate_constraint
    ) THEN
      EXECUTE format(
        'ALTER TABLE billing.%I ADD CONSTRAINT %I CHECK (hourly_rate >= 0.0001 AND hourly_rate <= 1000) NOT VALID',
        v_table_name,
        v_rate_constraint
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'billing'
        AND r.relname = v_table_name
        AND c.conname = v_status_constraint
    ) THEN
      EXECUTE format(
        'ALTER TABLE billing.%I ADD CONSTRAINT %I CHECK (status IS NOT NULL AND char_length(btrim(status)) BETWEEN 2 AND 32) NOT VALID',
        v_table_name,
        v_status_constraint
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regprocedure('billing.deduct_user_credit_atomic(uuid,numeric)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION billing.deduct_user_credit_atomic(uuid,numeric) FROM PUBLIC;
    REVOKE ALL ON FUNCTION billing.deduct_user_credit_atomic(uuid,numeric) FROM anon;
    REVOKE ALL ON FUNCTION billing.deduct_user_credit_atomic(uuid,numeric) FROM authenticated;
    GRANT EXECUTE ON FUNCTION billing.deduct_user_credit_atomic(uuid,numeric) TO service_role;
  END IF;

  IF to_regprocedure('billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) FROM PUBLIC;
    REVOKE ALL ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) FROM anon;
    REVOKE ALL ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) FROM authenticated;
    GRANT EXECUTE ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) TO service_role;
  END IF;
END $$;
