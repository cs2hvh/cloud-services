-- ════════════════════════════════════════════════════════════════════════════
-- GPU pods: UUID billing key + close the hourly-cron allowlist gap
-- ════════════════════════════════════════════════════════════════════════════
-- Two billing-integrity bugs this fixes:
--
--   1. GPU pods keyed billing by the integer gpu_pods.id, but the entire billing
--      spine (billing.transactions.service_id, the atomic cron RPC, the grace
--      lifecycle) is UUID-keyed. So save_transaction threw
--      "invalid input syntax for type uuid", and the cron's UUID guard rejected
--      GPU pods outright. Fix: give gpu_pods a billing_service_id UUID (mirrors
--      servers.billing_service_id) and re-key billing.active_gpu_pods.service_id
--      to it.
--
--   2. The hardened atomic RPC bill_service_cycle_atomic only allowlisted the
--      original 5 active_* tables. active_compute, active_inference_vector and
--      active_custom_image were wired into the cron later but never added to the
--      RPC allowlist, so their hourly charge was rejected ("Unsupported billing
--      table") every cycle. Fix: expand the allowlist to every table the cron
--      meters, plus active_gpu_pods.
--
-- To avoid surprise retroactive charges, last_billed_at is reset to now() for
-- the tables whose billing has been silently failing, so the first successful
-- cycle bills forward (not from creation).

-- ── 1. gpu_pods.billing_service_id (stable UUID billing key) ─────────────────
ALTER TABLE public.gpu_pods
  ADD COLUMN IF NOT EXISTS billing_service_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_gpu_pods_billing_service_id
  ON public.gpu_pods (billing_service_id);

COMMENT ON COLUMN public.gpu_pods.billing_service_id IS
  'Stable UUID billing key (billing.active_gpu_pods.service_id + grace lifecycle). gpu_pods.id is bigint, which the UUID-keyed billing cron cannot use.';

-- ── 2. Re-key billing.active_gpu_pods.service_id BIGINT → UUID ───────────────
ALTER TABLE billing.active_gpu_pods
  ADD COLUMN IF NOT EXISTS service_id_uuid UUID;

UPDATE billing.active_gpu_pods a
  SET service_id_uuid = p.billing_service_id
  FROM public.gpu_pods p
  WHERE p.id = a.service_id;

-- Active billing rows that no longer map to a pod can't be billed — drop them.
DELETE FROM billing.active_gpu_pods WHERE service_id_uuid IS NULL;

-- DROP COLUMN cascades the UNIQUE(service_id) constraint + idx_active_gpu_pods_service.
ALTER TABLE billing.active_gpu_pods DROP COLUMN service_id;
ALTER TABLE billing.active_gpu_pods RENAME COLUMN service_id_uuid TO service_id;
ALTER TABLE billing.active_gpu_pods ALTER COLUMN service_id SET NOT NULL;
ALTER TABLE billing.active_gpu_pods
  ADD CONSTRAINT active_gpu_pods_service_id_key UNIQUE (service_id);
CREATE INDEX IF NOT EXISTS idx_active_gpu_pods_service
  ON billing.active_gpu_pods (service_id);

COMMENT ON COLUMN billing.active_gpu_pods.service_id IS
  'References public.gpu_pods.billing_service_id (UUID).';

-- ── 3. Expand the atomic billing RPC allowlist to every metered table ───────
-- Recreated verbatim from 20260609000002 with the allowlist array extended to
-- include active_inference_vector / active_compute / active_custom_image (wired
-- into the cron but previously rejected here) and active_gpu_pods (new).
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

      EXECUTE format(
        'UPDATE billing.%I SET last_billed_at = $1 WHERE %I = $2',
        p_table_name,
        v_lookup_column
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
BEGIN
  IF to_regprocedure('billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) FROM PUBLIC;
    REVOKE ALL ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) FROM anon;
    REVOKE ALL ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) FROM authenticated;
    GRANT EXECUTE ON FUNCTION billing.bill_service_cycle_atomic(text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone) TO service_role;
  END IF;
END $$;

-- ── 4. Bill forward, not backward ───────────────────────────────────────────
-- These tables' hourly billing has been failing (compute/vector/custom: RPC
-- rejection; gpu_pods: not wired at all), so last_billed_at is frozen at
-- creation. Reset it so the first successful cycle charges from now() and no
-- customer gets a surprise retroactive back-bill for the unbilled period.
UPDATE billing.active_compute          SET last_billed_at = now() WHERE status = 'active';
UPDATE billing.active_inference_vector SET last_billed_at = now() WHERE status = 'active';
UPDATE billing.active_custom_image     SET last_billed_at = now() WHERE status = 'active';
UPDATE billing.active_gpu_pods         SET last_billed_at = now() WHERE status = 'active';
