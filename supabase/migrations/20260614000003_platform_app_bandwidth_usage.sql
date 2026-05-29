-- Track monthly network transfer for deployed platform apps.
-- This is intentionally independent from object storage: any traffic that
-- reaches an app pod can be metered here, even when the app proxies files to
-- third-party storage.

CREATE TABLE IF NOT EXISTS platform_app_bandwidth_usage_monthly (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  ingress_bytes BIGINT NOT NULL DEFAULT 0 CHECK (ingress_bytes >= 0),
  egress_bytes BIGINT NOT NULL DEFAULT 0 CHECK (egress_bytes >= 0),
  total_bytes BIGINT GENERATED ALWAYS AS (ingress_bytes + egress_bytes) STORED,
  lifecycle_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (lifecycle_status IN ('ok', 'warning', 'critical', 'overage', 'restricted')),
  source TEXT NOT NULL DEFAULT 'prometheus' CHECK (source IN ('prometheus', 'ingress', 'manual')),
  last_sampled_at TIMESTAMPTZ,
  restricted_at TIMESTAMPTZ,
  restored_at TIMESTAMPTZ,
  -- Extra bytes purchased via bandwidth packs for this billing period.
  -- Added to quota.totalBytes when computing lifecycle status.
  purchased_bytes BIGINT NOT NULL DEFAULT 0 CHECK (purchased_bytes >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_platform_app_bandwidth_usage_user_period
  ON platform_app_bandwidth_usage_monthly(user_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_platform_app_bandwidth_usage_app_period
  ON platform_app_bandwidth_usage_monthly(app_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_platform_app_bandwidth_usage_total
  ON platform_app_bandwidth_usage_monthly(period_start DESC, total_bytes DESC);

CREATE INDEX IF NOT EXISTS idx_platform_app_bandwidth_usage_lifecycle
  ON platform_app_bandwidth_usage_monthly(lifecycle_status, period_start DESC);

CREATE TABLE IF NOT EXISTS platform_app_bandwidth_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'warning_80',
      'critical_90',
      'limit_reached',
      'overage_started',
      'traffic_restricted',
      'traffic_restored'
    )
  ),
  usage_bytes BIGINT NOT NULL DEFAULT 0 CHECK (usage_bytes >= 0),
  quota_bytes BIGINT CHECK (quota_bytes IS NULL OR quota_bytes >= 0),
  percent_used NUMERIC(8,2),
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id, period_start, event_type)
);

CREATE INDEX IF NOT EXISTS idx_platform_app_bandwidth_events_user_created
  ON platform_app_bandwidth_events(user_id, created_at DESC);

ALTER TABLE platform_app_bandwidth_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_app_bandwidth_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own app bandwidth usage"
    ON platform_app_bandwidth_usage_monthly
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can manage app bandwidth usage"
    ON platform_app_bandwidth_usage_monthly
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their own app bandwidth events"
    ON platform_app_bandwidth_events
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can manage app bandwidth events"
    ON platform_app_bandwidth_events
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION update_platform_app_bandwidth_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_platform_app_bandwidth_usage_updated_at
  ON platform_app_bandwidth_usage_monthly;

CREATE TRIGGER trigger_update_platform_app_bandwidth_usage_updated_at
  BEFORE UPDATE ON platform_app_bandwidth_usage_monthly
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_app_bandwidth_usage_updated_at();

CREATE OR REPLACE FUNCTION increment_platform_app_bandwidth_purchased_bytes(
  p_app_id UUID,
  p_user_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_bytes BIGINT
)
RETURNS platform_app_bandwidth_usage_monthly AS $$
DECLARE
  updated_row platform_app_bandwidth_usage_monthly;
BEGIN
  IF p_bytes <= 0 THEN
    RAISE EXCEPTION 'p_bytes must be positive';
  END IF;

  INSERT INTO platform_app_bandwidth_usage_monthly (
    app_id,
    user_id,
    period_start,
    period_end,
    ingress_bytes,
    egress_bytes,
    lifecycle_status,
    source,
    purchased_bytes,
    metadata
  )
  VALUES (
    p_app_id,
    p_user_id,
    p_period_start,
    p_period_end,
    0,
    0,
    'ok',
    'prometheus',
    p_bytes,
    '{}'::jsonb
  )
  ON CONFLICT (app_id, period_start)
  DO UPDATE SET
    purchased_bytes = platform_app_bandwidth_usage_monthly.purchased_bytes + EXCLUDED.purchased_bytes
  RETURNING * INTO updated_row;

  RETURN updated_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION increment_platform_app_bandwidth_purchased_bytes(
  UUID,
  UUID,
  DATE,
  DATE,
  BIGINT
) TO service_role;

COMMENT ON TABLE platform_app_bandwidth_usage_monthly IS
  'Monthly ingress/egress byte usage for deployed platform apps. Counts app network traffic, not only object storage.';
COMMENT ON COLUMN platform_app_bandwidth_usage_monthly.ingress_bytes IS
  'Bytes received by app pods during the billing period.';
COMMENT ON COLUMN platform_app_bandwidth_usage_monthly.egress_bytes IS
  'Bytes transmitted by app pods during the billing period.';
COMMENT ON COLUMN platform_app_bandwidth_usage_monthly.lifecycle_status IS
  'Current monthly quota lifecycle: ok, warning, critical, overage, or restricted.';
COMMENT ON TABLE platform_app_bandwidth_events IS
  'Idempotent per-month bandwidth lifecycle events used for user notifications and audits.';
COMMENT ON COLUMN products.resources IS
  'Optional service resources and quotas. For platform-apps, supported bandwidth keys include bandwidth_gb, ingress_gb, egress_gb, max_request_body_mb, overage_per_gb, overage_limit_gb.';

-- ── Pod counter state (for delta-based monthly accumulation) ──────────────────
-- Stores the last-seen absolute Prometheus counter value per pod.
-- Each sync reads the current counter, computes delta = current - last (handling
-- resets on pod restart), then adds the delta to the monthly total.
-- This avoids relying on increase() windows that exceed Prometheus retention.

CREATE TABLE IF NOT EXISTS platform_app_bandwidth_pod_counters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
  pod_name TEXT NOT NULL,
  receive_counter BIGINT NOT NULL DEFAULT 0 CHECK (receive_counter >= 0),
  transmit_counter BIGINT NOT NULL DEFAULT 0 CHECK (transmit_counter >= 0),
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id, pod_name)
);

CREATE INDEX IF NOT EXISTS idx_platform_app_bandwidth_pod_counters_app
  ON platform_app_bandwidth_pod_counters(app_id);

ALTER TABLE platform_app_bandwidth_pod_counters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage pod bandwidth counters"
    ON platform_app_bandwidth_pod_counters
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE platform_app_bandwidth_pod_counters IS
  'Last-known absolute Prometheus counter values per pod. Used to compute bandwidth deltas between sync runs without relying on long Prometheus increase() windows.';
