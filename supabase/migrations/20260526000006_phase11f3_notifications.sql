-- ============================================================
-- Phase 11.F.3 — notification config + outbound webhook delivery log
--
-- Customer no longer has to babysit the dashboard waiting for an FT to
-- finish. When inference events fire (FT succeeded / FT failed / batch
-- completed / managed-serving started), the platform fans out to the
-- org's configured channels:
--
--   • In-app notification    (existing notifications table)
--   • Email                  (existing Resend integration)
--   • Outbound HMAC webhook  (new — customer's URL receives the event)
--
-- Schema added:
--   1. inference.notification_settings  — per-org channel config
--   2. inference.webhook_deliveries     — outbound delivery audit log
--                                          (status + retry counter,
--                                           useful for debugging
--                                           customer-side issues)
--   3. inference.notification_event enum — typed list of events we emit
--   4. Audit enum extensions for the new mutating actions
-- ============================================================

-- ─── 1. Events we emit ──────────────────────────────────────────
CREATE TYPE inference.notification_event AS ENUM (
  'finetune.succeeded',
  'finetune.failed',
  'batch.completed',
  'batch.failed',
  'serving_pod.ready',
  'serving_pod.stopped'
);

-- ─── 2. Per-org notification config ─────────────────────────────
--
-- One row per org. NULL channels = that channel is disabled.
-- events_subscribed empty = no events fire (acts as a global mute).
-- ALL fields nullable so partial config (e.g. only email, no webhook)
-- works without a sentinel value.
CREATE TABLE inference.notification_settings (
  org_id              UUID PRIMARY KEY REFERENCES inference.orgs(id) ON DELETE CASCADE,

  /** Events the org wants to be notified about. Defaults cover the
   *  most-common "tell me when my training is done" case. */
  events_subscribed   inference.notification_event[] NOT NULL DEFAULT
    ARRAY['finetune.succeeded', 'finetune.failed', 'batch.completed']::inference.notification_event[],

  /** Channel 1: email recipients. Max 5 addresses to keep blast radius
   *  bounded. Empty array = no email. */
  email_recipients    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  /** Channel 2: in-app notification. Always emitted regardless of this
   *  flag (cheap, no fan-out cost) UNLESS the user explicitly disables
   *  it here. */
  in_app_enabled      BOOLEAN NOT NULL DEFAULT TRUE,

  /** Channel 3: outbound HMAC-signed webhook to the customer's URL.
   *  webhook_secret is used to sign every payload so the receiver
   *  verifies authenticity (X-Ahura-Signature: sha256=<hex>).
   *  Stored as plaintext for v1; rotate via the API endpoint. */
  webhook_url         TEXT,
  webhook_secret      TEXT,
  webhook_enabled     BOOLEAN NOT NULL DEFAULT FALSE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_recipients_max_5 CHECK (cardinality(email_recipients) <= 5),
  CONSTRAINT webhook_url_when_enabled CHECK (
    webhook_enabled = FALSE OR (webhook_url IS NOT NULL AND length(webhook_url) > 0)
  )
);

CREATE TRIGGER trg_notification_settings_updated_at
  BEFORE UPDATE ON inference.notification_settings
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

-- ─── 3. Outbound webhook delivery log ───────────────────────────
--
-- One row per delivery attempt (NOT per event). Lets the dashboard show
-- "delivered" / "failed (will retry)" / "permanently failed" per call.
-- Helps customers debug their own receiver without us having to dig
-- through Cloudflare logs.
--
-- Bounded — old rows reaped by a maintenance cron (or LRU as we exceed
-- a per-org cap). For v1 we just keep the last N per org via the
-- dashboard read filter; no aggressive deletion.
CREATE TABLE inference.webhook_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  event               inference.notification_event NOT NULL,
  /** The full payload posted to the customer's URL — JSON for replay /
   *  debugging. Capped at ~16KB at the application level. */
  payload             JSONB NOT NULL,
  /** customer's URL at the time of delivery (snapshot — they might
   *  have changed it since). */
  webhook_url         TEXT NOT NULL,
  attempt             INTEGER NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed', 'gave_up')),
  http_status         INTEGER,
  response_excerpt    TEXT,
  delivered_at        TIMESTAMPTZ,
  next_retry_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_org_created
  ON inference.webhook_deliveries(org_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_pending
  ON inference.webhook_deliveries(next_retry_at)
  WHERE status = 'pending' AND next_retry_at IS NOT NULL;

-- ─── 4. RLS ─────────────────────────────────────────────────────
ALTER TABLE inference.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.webhook_deliveries    ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_settings_member_select
  ON inference.notification_settings FOR SELECT
  USING (inference.is_org_member(org_id));
CREATE POLICY notification_settings_admin_write
  ON inference.notification_settings FOR ALL
  USING (inference.is_org_admin(org_id))
  WITH CHECK (inference.is_org_admin(org_id));

CREATE POLICY webhook_deliveries_member_select
  ON inference.webhook_deliveries FOR SELECT
  USING (inference.is_org_member(org_id));
-- No client-side writes — only the server emits delivery rows.

-- ─── 5. Audit enum extensions ───────────────────────────────────
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'notifications.config_updated';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'notifications.webhook_rotated';
