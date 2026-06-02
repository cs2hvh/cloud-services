-- C4 (CRITICAL) — extend the grace-lifecycle + notification-outbox table allowlists
-- to every metered service table.
--
-- 20260610000001 created service_lifecycle / notification_outbox with a CHECK that
-- only listed the original 5 services. But active_compute, active_gpu_pods,
-- active_inference_vector and active_custom_image are all metered by the cron, so
-- when a customer ran out of credit on one of those the cron's grace-row INSERT hit
-- a 23514 CHECK violation, no grace row was created, and the service ran FREE
-- forever (the grace reminders + auto-delete safety net never engaged on the
-- highest-cost vertical, GPU/compute).
--
-- The TS side already expects these: lib/billing/grace/constants.ts GRACE_SERVICE_TABLES
-- and lib/billing/grace/deletion-executor.ts handle compute/vector/custom_image (and
-- now gpu_pods). The SQL allowlist was the only thing out of sync.

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
      'active_gpu_pods'
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
      'active_gpu_pods'
    )
  );
