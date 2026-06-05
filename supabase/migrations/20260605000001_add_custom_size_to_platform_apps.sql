-- Add custom profile support to platform_apps.
--
-- 1. Widen the size CHECK to allow 'custom'.
--    Custom-profile apps bypass the standard size lookup — their resources
--    are stored explicitly in custom_spec.
--
-- 2. Add custom_spec (JSONB) to persist the CustomProfileSpec so that
--    redeploy, rollback, and auto-deploy can recover it without relying
--    on the original create request.
--
-- 3. Add custom_hourly_rate (NUMERIC) so billing never loses the negotiated
--    rate between billing cycles.

ALTER TABLE platform_apps DROP CONSTRAINT IF EXISTS platform_apps_size_check;
ALTER TABLE platform_apps
  ADD CONSTRAINT platform_apps_size_check
  CHECK (size IN ('small', 'medium', 'large', 'xlarge', 'xxlarge', 'custom'));

ALTER TABLE platform_apps
  ADD COLUMN IF NOT EXISTS custom_spec        JSONB,
  ADD COLUMN IF NOT EXISTS custom_hourly_rate NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS pending_custom_profile_request_id UUID,
  ADD COLUMN IF NOT EXISTS pending_custom_spec JSONB,
  ADD COLUMN IF NOT EXISTS pending_custom_hourly_rate NUMERIC(12,6);

COMMENT ON COLUMN platform_apps.size IS
  'Deployment size. Standard: small|medium|large|xlarge|xxlarge. '
  'custom: resources defined in custom_spec, rate in custom_hourly_rate.';
COMMENT ON COLUMN platform_apps.custom_spec IS
  'CustomProfileSpec JSON (cpuRequest, cpuLimit, memoryRequest, memoryLimit, replicas). NULL for standard sizes.';
COMMENT ON COLUMN platform_apps.custom_hourly_rate IS
  'Negotiated hourly billing rate for custom-profile apps. NULL for standard sizes.';

-- 4. Custom profile request/approval workflow.
--    Users request larger resources; admin reviews and approves with the
--    actual spec and rate. The user redeploys to apply the approved resources.

CREATE TABLE IF NOT EXISTS platform_custom_profile_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id              UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Denormalised for admin display — auth.users is not PostgREST-accessible
  user_email          TEXT,

  -- What the user asked for (free-form, for admin context)
  requested_cpu       TEXT,
  requested_memory    TEXT,
  requested_replicas  INTEGER,
  reason              TEXT NOT NULL,

  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),

  -- What admin actually approved (may differ from requested)
  approved_spec       JSONB,           -- CustomProfileSpec JSON
  approved_hourly_rate NUMERIC(12,6),

  admin_notes         TEXT,
  reviewed_by         UUID REFERENCES auth.users(id),
  reviewed_at         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_custom_profile_requests ENABLE ROW LEVEL SECURITY;

-- Users can read their own requests
CREATE POLICY "Users can view own custom profile requests"
  ON platform_custom_profile_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can submit requests
CREATE POLICY "Users can create custom profile requests"
  ON platform_custom_profile_requests FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND approved_spec IS NULL
    AND approved_hourly_rate IS NULL
    AND admin_notes IS NULL
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM platform_apps
      WHERE platform_apps.id = platform_custom_profile_requests.app_id
        AND platform_apps.user_id = auth.uid()
        AND platform_apps.pending_custom_profile_request_id IS NULL
    )
  );

CREATE INDEX idx_custom_profile_requests_app    ON platform_custom_profile_requests(app_id);
CREATE INDEX idx_custom_profile_requests_user   ON platform_custom_profile_requests(user_id);
CREATE INDEX idx_custom_profile_requests_status ON platform_custom_profile_requests(status);
CREATE UNIQUE INDEX idx_custom_profile_requests_one_pending_per_app
  ON platform_custom_profile_requests(app_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION approve_platform_custom_profile_request(
  p_request_id UUID,
  p_custom_spec JSONB,
  p_hourly_rate NUMERIC,
  p_admin_notes TEXT,
  p_reviewed_by UUID
)
RETURNS TABLE(app_id UUID, user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_id UUID;
  v_user_id UUID;
BEGIN
  UPDATE platform_custom_profile_requests
  SET
    status = 'approved',
    approved_spec = p_custom_spec,
    approved_hourly_rate = p_hourly_rate,
    admin_notes = NULLIF(BTRIM(p_admin_notes), ''),
    reviewed_by = p_reviewed_by,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_request_id
    AND status = 'pending'
  RETURNING platform_custom_profile_requests.app_id,
            platform_custom_profile_requests.user_id
  INTO v_app_id, v_user_id;

  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'Custom profile request is not pending';
  END IF;

  UPDATE platform_apps
  SET
    pending_custom_profile_request_id = p_request_id,
    pending_custom_spec = p_custom_spec,
    pending_custom_hourly_rate = p_hourly_rate,
    updated_at = now()
  WHERE id = v_app_id
    AND pending_custom_profile_request_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Platform app already has a pending custom profile';
  END IF;

  RETURN QUERY SELECT v_app_id, v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION activate_platform_custom_profile(
  p_app_id UUID,
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing
AS $$
DECLARE
  v_user_id UUID;
  v_new_rate NUMERIC;
  v_old_rate NUMERIC;
  v_last_billed_at TIMESTAMPTZ;
  v_transition_at TIMESTAMPTZ := now();
  v_charge NUMERIC := 0;
  v_balance NUMERIC;
  v_new_balance NUMERIC;
  v_settled BOOLEAN := FALSE;
BEGIN
  SELECT user_id, pending_custom_hourly_rate
  INTO v_user_id, v_new_rate
  FROM platform_apps
  WHERE id = p_app_id
    AND pending_custom_profile_request_id = p_request_id
    AND pending_custom_spec IS NOT NULL
    AND pending_custom_hourly_rate IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending custom profile does not match app';
  END IF;

  SELECT hourly_rate, last_billed_at
  INTO v_old_rate, v_last_billed_at
  FROM billing.active_platform_apps
  WHERE service_id = p_app_id
    AND user_id = v_user_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active platform app billing record not found';
  END IF;

  v_charge := ROUND(
    GREATEST(
      0,
      EXTRACT(EPOCH FROM (v_transition_at - COALESCE(v_last_billed_at, v_transition_at))) / 3600
    ) * v_old_rate,
    6
  );

  SELECT credit_balance
  INTO v_balance
  FROM billing.user_credits
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF FOUND AND v_balance >= v_charge THEN
    UPDATE billing.user_credits
    SET credit_balance = credit_balance - v_charge
    WHERE user_id = v_user_id
    RETURNING credit_balance INTO v_new_balance;
    v_settled := TRUE;
  ELSE
    v_new_balance := v_balance;
  END IF;

  UPDATE billing.active_platform_apps
  SET
    hourly_rate = v_new_rate,
    last_billed_at = v_transition_at,
    updated_at = v_transition_at
  WHERE service_id = p_app_id
    AND user_id = v_user_id
    AND status = 'active';

  UPDATE platform_apps
  SET
    size = 'custom',
    custom_spec = pending_custom_spec,
    custom_hourly_rate = pending_custom_hourly_rate,
    pending_custom_profile_request_id = NULL,
    pending_custom_spec = NULL,
    pending_custom_hourly_rate = NULL,
    updated_at = now()
  WHERE id = p_app_id;

  UPDATE platform_custom_profile_requests
  SET status = 'applied', updated_at = v_transition_at
  WHERE id = p_request_id
    AND app_id = p_app_id
    AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved custom profile request not found';
  END IF;

  RETURN jsonb_build_object(
    'activated', TRUE,
    'charged', v_charge,
    'settled', v_settled,
    'new_balance', v_new_balance,
    'period_start', v_last_billed_at,
    'period_end', v_transition_at,
    'hourly_rate', v_new_rate
  );
END;
$$;

CREATE OR REPLACE FUNCTION transition_platform_app_size(
  p_app_id UUID,
  p_user_id UUID,
  p_new_size TEXT,
  p_new_rate NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing
AS $$
DECLARE
  v_old_rate NUMERIC;
  v_last_billed_at TIMESTAMPTZ;
  v_transition_at TIMESTAMPTZ := now();
  v_charge NUMERIC := 0;
  v_balance NUMERIC;
  v_new_balance NUMERIC;
  v_settled BOOLEAN := FALSE;
BEGIN
  IF p_new_size NOT IN ('small', 'medium', 'large', 'xlarge', 'xxlarge') THEN
    RAISE EXCEPTION 'Invalid standard platform app size';
  END IF;

  PERFORM 1
  FROM platform_apps
  WHERE id = p_app_id
    AND user_id = p_user_id
    AND pending_custom_profile_request_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Platform app not found or has a pending custom profile';
  END IF;

  SELECT hourly_rate, last_billed_at
  INTO v_old_rate, v_last_billed_at
  FROM billing.active_platform_apps
  WHERE service_id = p_app_id
    AND user_id = p_user_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE platform_apps
    SET size = p_new_size, updated_at = v_transition_at
    WHERE id = p_app_id;

    RETURN jsonb_build_object(
      'updated', TRUE,
      'billing_active', FALSE,
      'charged', 0,
      'settled', TRUE,
      'new_balance', NULL,
      'period_start', NULL,
      'period_end', v_transition_at
    );
  END IF;

  v_charge := ROUND(
    GREATEST(
      0,
      EXTRACT(EPOCH FROM (v_transition_at - COALESCE(v_last_billed_at, v_transition_at))) / 3600
    ) * v_old_rate,
    6
  );

  SELECT credit_balance
  INTO v_balance
  FROM billing.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF FOUND AND v_balance >= v_charge THEN
    UPDATE billing.user_credits
    SET credit_balance = credit_balance - v_charge
    WHERE user_id = p_user_id
    RETURNING credit_balance INTO v_new_balance;
    v_settled := TRUE;
  ELSE
    v_new_balance := v_balance;
  END IF;

  UPDATE billing.active_platform_apps
  SET
    hourly_rate = p_new_rate,
    last_billed_at = v_transition_at,
    updated_at = v_transition_at
  WHERE service_id = p_app_id
    AND user_id = p_user_id
    AND status = 'active';

  UPDATE platform_apps
  SET size = p_new_size, updated_at = v_transition_at
  WHERE id = p_app_id;

  RETURN jsonb_build_object(
    'updated', TRUE,
    'billing_active', TRUE,
    'charged', v_charge,
    'settled', v_settled,
    'new_balance', v_new_balance,
    'period_start', v_last_billed_at,
    'period_end', v_transition_at
  );
END;
$$;

REVOKE ALL ON FUNCTION approve_platform_custom_profile_request(UUID, JSONB, NUMERIC, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_platform_custom_profile_request(UUID, JSONB, NUMERIC, TEXT, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION activate_platform_custom_profile(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION activate_platform_custom_profile(UUID, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION transition_platform_app_size(UUID, UUID, TEXT, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION transition_platform_app_size(UUID, UUID, TEXT, NUMERIC)
  TO service_role;

ALTER TABLE platform_apps
  DROP CONSTRAINT IF EXISTS platform_apps_pending_custom_profile_request_fkey;
ALTER TABLE platform_apps
  ADD CONSTRAINT platform_apps_pending_custom_profile_request_fkey
  FOREIGN KEY (pending_custom_profile_request_id)
  REFERENCES platform_custom_profile_requests(id)
  ON DELETE SET NULL;

COMMENT ON TABLE platform_custom_profile_requests IS
  'Stores user requests for custom deployment profiles (enterprise resources). '
  'Admin reviews and approves with explicit spec + hourly rate.';
