-- Add failure_reason to deployment history
-- This stores WHY a deployment failed (build error, health check, etc.)
-- Follows the "store outcomes, not raw logs" pattern

-- 1) Add failure_reason to deployment history table
ALTER TABLE platform_app_deployments
    ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- 2) Add last_failure_reason to platform_apps for quick access
-- This is updated whenever a deployment fails, without needing to join
ALTER TABLE platform_apps
    ADD COLUMN IF NOT EXISTS last_failure_reason TEXT;

-- 3) Add index for querying failed deployments
CREATE INDEX IF NOT EXISTS idx_platform_app_deployments_failed
    ON platform_app_deployments(app_id, created_at DESC)
    WHERE status = 'failed';

-- 4) Comment for documentation
COMMENT ON COLUMN platform_app_deployments.failure_reason IS 
    'Human-readable reason for deployment failure (e.g., "Build failed: npm install error", "Health check timeout")';

COMMENT ON COLUMN platform_apps.last_failure_reason IS 
    'Cached failure reason from most recent failed deployment for quick UI display';
