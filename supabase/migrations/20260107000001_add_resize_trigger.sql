-- Add 'resize' as a valid trigger type for platform app deployments
-- This allows tracking when a deployment was triggered by a resize operation

-- 1) Alter the check constraint on platform_app_deployments.trigger
-- Drop old constraint and add new one with 'resize'
ALTER TABLE platform_app_deployments
    DROP CONSTRAINT IF EXISTS platform_app_deployments_trigger_check;
ALTER TABLE platform_app_deployments
    ADD CONSTRAINT platform_app_deployments_trigger_check
    CHECK (trigger IN ('manual', 'webhook', 'rollback', 'resize'));
-- 2) Extend platform_apps.last_deploy_trigger if it has a check constraint
DO $$
BEGIN
    -- Check if the constraint exists before trying to modify
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'platform_apps_last_deploy_trigger_check'
    ) THEN
        ALTER TABLE platform_apps
            DROP CONSTRAINT platform_apps_last_deploy_trigger_check;
        
        ALTER TABLE platform_apps
            ADD CONSTRAINT platform_apps_last_deploy_trigger_check
            CHECK (last_deploy_trigger IN ('manual', 'webhook', 'scheduled', 'rollback', 'resize'));
    END IF;
END $$;
-- 3) Add comment for documentation
COMMENT ON CONSTRAINT platform_app_deployments_trigger_check ON platform_app_deployments IS 
    'Valid deployment triggers: manual (user-initiated), webhook (git push), rollback (restore previous), resize (instance size change)';
