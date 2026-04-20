-- Grace-period lifecycle and notification outbox for insufficient-credit handling.

CREATE TABLE IF NOT EXISTS billing.service_lifecycle (
  id BIGSERIAL PRIMARY KEY,
  service_table TEXT NOT NULL,
  service_id UUID NOT NULL,
  user_id UUID NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('grace', 'deletion_scheduled', 'deleting', 'deleted', 'restored')
  ),
  grace_started_at TIMESTAMPTZ,
  grace_expires_at TIMESTAMPTZ,
  deletion_started_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deletion_attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_lifecycle_table_check CHECK (
    service_table IN (
      'active_kubernetes',
      'active_database',
      'active_objectspace',
      'active_spectrum',
      'active_platform_apps'
    )
  ),
  CONSTRAINT service_lifecycle_unique_service UNIQUE (service_table, service_id)
);

CREATE INDEX IF NOT EXISTS idx_service_lifecycle_state_expiry
  ON billing.service_lifecycle(state, grace_expires_at);

CREATE INDEX IF NOT EXISTS idx_service_lifecycle_user_state
  ON billing.service_lifecycle(user_id, state);

ALTER TABLE billing.service_lifecycle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage service lifecycle" ON billing.service_lifecycle;
CREATE POLICY "Service role can manage service lifecycle"
  ON billing.service_lifecycle
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own service lifecycle" ON billing.service_lifecycle;
CREATE POLICY "Users can view own service lifecycle"
  ON billing.service_lifecycle
  FOR SELECT
  USING (auth.uid() = user_id);

REVOKE ALL ON billing.service_lifecycle FROM anon;
REVOKE ALL ON billing.service_lifecycle FROM authenticated;
GRANT SELECT ON billing.service_lifecycle TO authenticated;
GRANT ALL ON billing.service_lifecycle TO service_role;

DO $$
BEGIN
  IF to_regclass('billing.service_lifecycle_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE billing.service_lifecycle_id_seq FROM anon;
    REVOKE ALL ON SEQUENCE billing.service_lifecycle_id_seq FROM authenticated;
    GRANT ALL ON SEQUENCE billing.service_lifecycle_id_seq TO service_role;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS billing.notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  user_id UUID NOT NULL,
  service_table TEXT,
  service_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'processed', 'failed')
  ),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_outbox_table_check CHECK (
    service_table IS NULL OR service_table IN (
      'active_kubernetes',
      'active_database',
      'active_objectspace',
      'active_spectrum',
      'active_platform_apps'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status_created
  ON billing.notification_outbox(status, created_at);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_user_status
  ON billing.notification_outbox(user_id, status);

ALTER TABLE billing.notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage notification outbox" ON billing.notification_outbox;
CREATE POLICY "Service role can manage notification outbox"
  ON billing.notification_outbox
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON billing.notification_outbox FROM anon;
REVOKE ALL ON billing.notification_outbox FROM authenticated;
GRANT ALL ON billing.notification_outbox TO service_role;

DO $$
BEGIN
  IF to_regclass('billing.notification_outbox_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE billing.notification_outbox_id_seq FROM anon;
    REVOKE ALL ON SEQUENCE billing.notification_outbox_id_seq FROM authenticated;
    GRANT ALL ON SEQUENCE billing.notification_outbox_id_seq TO service_role;
  END IF;
END $$;

DO $outer$
BEGIN
  EXECUTE $exec$
    CREATE OR REPLACE FUNCTION billing.resolve_grace_for_user(
      p_user_id UUID,
      p_min_hours_coverage NUMERIC DEFAULT 1
    )
    RETURNS TABLE (
      service_table TEXT,
      service_id UUID,
      new_state TEXT,
      required_balance NUMERIC,
      available_balance NUMERIC
    )
    LANGUAGE plpgsql
    AS $fn$
    DECLARE
      v_balance NUMERIC;
      v_lookup_column TEXT;
      v_hourly_rate NUMERIC;
      v_required_balance NUMERIC;
      v_row RECORD;
      v_coverage NUMERIC := COALESCE(p_min_hours_coverage, 1);
    BEGIN
      IF v_coverage <= 0 THEN
        v_coverage := 1;
      END IF;

      SELECT credit_balance
      INTO v_balance
      FROM billing.user_credits
      WHERE user_id = p_user_id;

      IF NOT FOUND THEN
        RETURN;
      END IF;

      FOR v_row IN
        SELECT id, service_table, service_id
        FROM billing.service_lifecycle
        WHERE user_id = p_user_id
          AND state IN ('grace', 'deletion_scheduled')
      LOOP
        SELECT CASE
          WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'billing'
              AND table_name = v_row.service_table
              AND column_name = 'service_id'
          ) THEN 'service_id'
          WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'billing'
              AND table_name = v_row.service_table
              AND column_name = 'id'
          ) THEN 'id'
          ELSE NULL
        END
        INTO v_lookup_column;

        IF v_lookup_column IS NULL THEN
          CONTINUE;
        END IF;

        EXECUTE format(
          'SELECT hourly_rate FROM billing.%I WHERE %I = $1 AND status = ''active''',
          v_row.service_table,
          v_lookup_column
        )
        INTO v_hourly_rate
        USING v_row.service_id;

        IF v_hourly_rate IS NULL THEN
          UPDATE billing.service_lifecycle
          SET state = 'deleted',
              deleted_at = NOW(),
              updated_at = NOW(),
              metadata = metadata || jsonb_build_object('resolved_reason', 'active_row_missing')
          WHERE id = v_row.id;

          service_table := v_row.service_table;
          service_id := v_row.service_id;
          new_state := 'deleted';
          required_balance := 0;
          available_balance := v_balance;
          RETURN NEXT;
          CONTINUE;
        END IF;

        v_required_balance := GREATEST(v_hourly_rate * v_coverage, 0);

        IF v_balance >= v_required_balance THEN
          UPDATE billing.service_lifecycle
          SET state = 'restored',
              updated_at = NOW(),
              metadata = metadata || jsonb_build_object(
                'resolved_by', 'topup',
                'resolved_at', NOW(),
                'min_hours_coverage', v_coverage
              )
          WHERE id = v_row.id;

          service_table := v_row.service_table;
          service_id := v_row.service_id;
          new_state := 'restored';
          required_balance := v_required_balance;
          available_balance := v_balance;
          RETURN NEXT;
        END IF;
      END LOOP;
    END;
    $fn$
  $exec$;
END $outer$;

DO $$
BEGIN
  IF to_regprocedure('billing.resolve_grace_for_user(uuid,numeric)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION billing.resolve_grace_for_user(uuid,numeric) FROM PUBLIC;
    REVOKE ALL ON FUNCTION billing.resolve_grace_for_user(uuid,numeric) FROM anon;
    REVOKE ALL ON FUNCTION billing.resolve_grace_for_user(uuid,numeric) FROM authenticated;
    GRANT EXECUTE ON FUNCTION billing.resolve_grace_for_user(uuid,numeric) TO service_role;
  END IF;
END $$;

COMMENT ON TABLE billing.service_lifecycle IS 'Billing grace/deletion lifecycle per active service.';
COMMENT ON TABLE billing.notification_outbox IS 'Retry-safe outbox for billing lifecycle notifications.';
