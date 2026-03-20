-- Add 'deleting' status to platform_apps
-- This prevents health-check syncStatus from interfering during app deletion
-- Status lifecycle: pending → building → running | failed → deleting (terminal)

ALTER TABLE platform_apps
  DROP CONSTRAINT IF EXISTS platform_apps_status_check;

ALTER TABLE platform_apps
  ADD CONSTRAINT platform_apps_status_check
    CHECK (status IN ('pending', 'building', 'running', 'failed', 'stopped', 'deleting'));
