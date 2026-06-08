-- GPU network volumes: UUID billing meter + grace/ledger support.

ALTER TABLE public.gpu_network_volumes
  ADD COLUMN IF NOT EXISTS billing_service_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_gpu_network_volumes_billing_service_id
  ON public.gpu_network_volumes (billing_service_id);

-- Active slots make the five-pod user limit concurrency-safe. The partial
-- unique index releases a slot automatically when a pod becomes terminal.
ALTER TABLE public.gpu_pods
  ADD COLUMN IF NOT EXISTS active_slot SMALLINT;

WITH active AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY owner_id ORDER BY created_at, id) AS slot
  FROM public.gpu_pods
  WHERE status IN ('provisioning','running','stopped','restarting','interrupted')
)
UPDATE public.gpu_pods AS pod
SET active_slot = active.slot
FROM active
WHERE pod.id = active.id
  AND active.slot <= 5
  AND pod.active_slot IS NULL;

ALTER TABLE public.gpu_pods
  DROP CONSTRAINT IF EXISTS gpu_pods_active_slot_check;
ALTER TABLE public.gpu_pods
  ADD CONSTRAINT gpu_pods_active_slot_check
  CHECK (active_slot IS NULL OR active_slot BETWEEN 1 AND 5);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gpu_pods_owner_active_slot
  ON public.gpu_pods (owner_id, active_slot)
  WHERE active_slot IS NOT NULL
    AND status IN ('provisioning','running','stopped','restarting','interrupted');

CREATE TABLE IF NOT EXISTS billing.active_gpu_volumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL UNIQUE,
  hourly_rate NUMERIC(12,6) NOT NULL CHECK (hourly_rate >= 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','grace','terminated')),
  last_billed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_gpu_volumes_user
  ON billing.active_gpu_volumes (user_id);
CREATE INDEX IF NOT EXISTS idx_active_gpu_volumes_status
  ON billing.active_gpu_volumes (status, last_billed_at);

DROP TRIGGER IF EXISTS trg_active_gpu_volumes_updated_at
  ON billing.active_gpu_volumes;
CREATE TRIGGER trg_active_gpu_volumes_updated_at
  BEFORE UPDATE ON billing.active_gpu_volumes
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

ALTER TABLE billing.active_gpu_volumes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON billing.active_gpu_volumes TO authenticated;
GRANT ALL ON billing.active_gpu_volumes TO service_role;

DO $$ BEGIN
  CREATE POLICY "Users can view own active gpu volumes"
    ON billing.active_gpu_volumes
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages active gpu volumes"
    ON billing.active_gpu_volumes
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing usable volumes begin billing from migration time. Do not back-charge
-- time before the meter existed, and do not meter failed/deleted rows.
INSERT INTO billing.active_gpu_volumes (
  user_id,
  service_id,
  hourly_rate,
  status,
  last_billed_at
)
SELECT
  owner_id,
  billing_service_id,
  round((monthly_cost_usd / 730.0)::numeric, 6),
  'active',
  now()
FROM public.gpu_network_volumes
WHERE status IN ('available', 'attached')
ON CONFLICT (service_id) DO NOTHING;

ALTER TABLE billing.service_lifecycle
  DROP CONSTRAINT IF EXISTS service_lifecycle_table_check;
ALTER TABLE billing.service_lifecycle
  ADD CONSTRAINT service_lifecycle_table_check CHECK (
    service_table IN (
      'active_kubernetes',
      'active_database',
      'active_objectspace',
      'active_spectrum',
      'active_platform_apps',
      'active_inference_vector',
      'active_compute',
      'active_custom_image',
      'active_gpu_pods',
      'active_gpu_volumes'
    )
  );

ALTER TABLE billing.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_table_check;
ALTER TABLE billing.notification_outbox
  ADD CONSTRAINT notification_outbox_table_check CHECK (
    service_table IS NULL OR service_table IN (
      'active_kubernetes',
      'active_database',
      'active_objectspace',
      'active_spectrum',
      'active_platform_apps',
      'active_inference_vector',
      'active_compute',
      'active_custom_image',
      'active_gpu_pods',
      'active_gpu_volumes'
    )
  );

ALTER TABLE billing.transactions
  DROP CONSTRAINT IF EXISTS transactions_service_type_check;
ALTER TABLE billing.transactions
  ADD CONSTRAINT transactions_service_type_check CHECK (
    service_type IS NULL OR service_type IN (
      'database',
      'kubernetes',
      'objectspace',
      'spectrum',
      'platform_apps',
      'domain',
      'gpu_pod',
      'gpu_volume',
      'compute',
      'custom_image',
      'inference_finetune',
      'inference_serving',
      'inference_deployment',
      'inference_vector'
    )
  );

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
          'active_gpu_pods',
          'active_gpu_volumes'
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
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'billing'
            AND table_name = p_table_name
            AND column_name = 'service_id'
        ) THEN 'service_id'
        WHEN EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'billing'
            AND table_name = p_table_name
            AND column_name = 'id'
        ) THEN 'id'
        ELSE NULL
      END INTO v_lookup_column;

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
        RETURN jsonb_build_object(
          'charged', FALSE,
          'status', 'service_not_found',
          'new_balance', NULL
        );
      END IF;
      IF v_service_status IS DISTINCT FROM 'active' THEN
        RETURN jsonb_build_object(
          'charged', FALSE,
          'status', 'service_not_active',
          'new_balance', NULL
        );
      END IF;
      IF p_expected_last_billed_at IS DISTINCT FROM v_current_last_billed_at THEN
        RETURN jsonb_build_object(
          'charged', FALSE,
          'status', 'stale_last_billed_at',
          'new_balance', NULL
        );
      END IF;

      SELECT credit_balance
      INTO v_balance
      FROM billing.user_credits
      WHERE user_id = p_user_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'charged', FALSE,
          'status', 'credit_record_not_found',
          'new_balance', NULL
        );
      END IF;
      IF v_balance < p_amount THEN
        RETURN jsonb_build_object(
          'charged', FALSE,
          'status', 'insufficient_credit',
          'new_balance', v_balance
        );
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

      RETURN jsonb_build_object(
        'charged', TRUE,
        'status', 'charged',
        'new_balance', v_new_balance
      );
    END;
    $fn$
  $exec$;
END $outer$;

REVOKE ALL ON FUNCTION billing.bill_service_cycle_atomic(
  text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION billing.bill_service_cycle_atomic(
  text,uuid,uuid,numeric,timestamp with time zone,timestamp with time zone
) TO service_role;
