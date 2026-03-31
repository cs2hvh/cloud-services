-- Platform App Deployments table (deployment history for rollback)
-- Enables rollback to a previous successful deployment without rebuilding.

-- 1) Create deployment history table
CREATE TABLE IF NOT EXISTS platform_app_deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- CI metadata
    build_number INTEGER,
    commit_sha TEXT,

    -- Image identity (prefer digest when available)
    image_tag TEXT,
    image_digest TEXT,

    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'webhook', 'rollback'))
);
-- 2) Optional pointer to the currently-active deployment
-- NOTE: this is optional but simplifies UI + rollback queries.
ALTER TABLE platform_apps
    ADD COLUMN IF NOT EXISTS active_deployment_id UUID;
-- Postgres does not support `ADD CONSTRAINT IF NOT EXISTS`, so we gate it manually.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_platform_apps_active_deployment'
    ) THEN
        ALTER TABLE platform_apps
            ADD CONSTRAINT fk_platform_apps_active_deployment
            FOREIGN KEY (active_deployment_id)
            REFERENCES platform_app_deployments(id)
            ON DELETE SET NULL;
    END IF;
END $$;
-- 2b) Allow rollback to be recorded in platform_apps.last_deploy_trigger
-- Existing migration limited this to ('manual', 'webhook', 'scheduled').
-- We extend to include 'rollback'.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'platform_apps_last_deploy_trigger_check'
    ) THEN
        ALTER TABLE platform_apps DROP CONSTRAINT platform_apps_last_deploy_trigger_check;
    END IF;

    ALTER TABLE platform_apps
        ADD CONSTRAINT platform_apps_last_deploy_trigger_check
        CHECK (last_deploy_trigger IN ('manual', 'webhook', 'scheduled', 'rollback'));
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;
-- 3) RLS
ALTER TABLE platform_app_deployments ENABLE ROW LEVEL SECURITY;
-- Allow users to view deployment history for apps they own
DROP POLICY IF EXISTS "Users can view deployments for their platform apps" ON platform_app_deployments;
CREATE POLICY "Users can view deployments for their platform apps" ON platform_app_deployments
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM platform_apps
            WHERE platform_apps.id = platform_app_deployments.app_id
              AND platform_apps.user_id = auth.uid()
        )
    );
-- 4) Indexes
CREATE INDEX IF NOT EXISTS idx_platform_app_deployments_app_created_at
    ON platform_app_deployments(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_app_deployments_app_success_created_at
    ON platform_app_deployments(app_id, created_at DESC)
    WHERE status = 'success';
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_app_deployments_app_build_number
    ON platform_app_deployments(app_id, build_number)
    WHERE build_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_apps_active_deployment
    ON platform_apps(active_deployment_id);
