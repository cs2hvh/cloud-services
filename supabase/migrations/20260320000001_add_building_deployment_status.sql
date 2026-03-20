-- Add 'building' as a valid status for platform_app_deployments.
-- Deployment rows are now created at build START (status='building')
-- and updated to 'success' or 'failed' on completion.
-- This gives the UI a single source of truth through Supabase Realtime.

ALTER TABLE platform_app_deployments
    DROP CONSTRAINT IF EXISTS platform_app_deployments_status_check;

ALTER TABLE platform_app_deployments
    ADD CONSTRAINT platform_app_deployments_status_check
    CHECK (status IN ('building', 'success', 'failed'));

COMMENT ON CONSTRAINT platform_app_deployments_status_check ON platform_app_deployments IS
    'Deployment lifecycle: building (in-progress) → success | failed';
