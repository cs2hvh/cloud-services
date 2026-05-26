-- ============================================================
-- Phase 11.B — per-customer dedicated serving pods (Tier 1)
--
-- Replaces the Phase 11.A "operator pastes a URL" flow with a real
-- customer-facing button that provisions a GPU pod on demand, holds
-- the customer's adapter, and routes gateway traffic to it. One pod
-- per fine-tune, dedicated to one customer, on-demand lifecycle.
--
-- This migration only adds tracking columns + audit enum values.
-- The actual provision/stop logic lives in lib/inference/serving-pod.ts.
--
-- Schema additions to inference.finetunes:
--   serving_pod_id           — opaque upstream compute provider id
--                              (operator-facing only, not surfaced to
--                              the customer)
--   serving_pod_state        — provisioning | running | stopped | failed
--                              drives the dashboard status pill
--   serving_pod_gpu_sku      — internal SKU the customer picked (a40 /
--                              a100_80 / h100 / ...) for billing display
--   serving_pod_started_at   — set when provision returns; null until then
--   serving_pod_stopped_at   — set on customer Stop click or auto-stop;
--                              null while running
--   serving_pod_hourly_cents — recorded at provision; used for the live
--                              cost meter and final session bill
--   serving_pod_auto_stop_at — when the auto-stop watchdog should kill
--                              the pod (defaults to provision + N hours
--                              of no-request grace). Updated on every
--                              request via the gateway's usage event.
--
-- serving_url + is_managed (added in 20260526000004) are populated
-- automatically by the provision flow — customers never touch them
-- directly anymore.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE inference.serving_pod_state AS ENUM (
    'provisioning',
    'running',
    'stopped',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE inference.finetunes
  ADD COLUMN IF NOT EXISTS serving_pod_id           TEXT,
  ADD COLUMN IF NOT EXISTS serving_pod_state        inference.serving_pod_state,
  ADD COLUMN IF NOT EXISTS serving_pod_gpu_sku      TEXT,
  ADD COLUMN IF NOT EXISTS serving_pod_started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS serving_pod_stopped_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS serving_pod_hourly_cents INTEGER,
  ADD COLUMN IF NOT EXISTS serving_pod_auto_stop_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS serving_pod_error_message TEXT;

-- Lookup index for the scheduler that auto-stops idle pods.
CREATE INDEX IF NOT EXISTS idx_finetunes_serving_pod_running
  ON inference.finetunes(serving_pod_auto_stop_at)
  WHERE serving_pod_state = 'running';

-- Audit log enum extensions for the new lifecycle events.
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'serving_pod.provisioned';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'serving_pod.stopped';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'serving_pod.failed';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'serving_pod.auto_stopped';
