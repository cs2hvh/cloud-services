-- Create active_platform_apps table in billing schema for hourly billing tracking
-- This table tracks active platform app deployments for billing purposes

CREATE TABLE IF NOT EXISTS billing.active_platform_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    service_id UUID NOT NULL,
    hourly_rate NUMERIC(12, 6) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'terminated')),
    last_billed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(service_id)
);
-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_active_platform_apps_user_id ON billing.active_platform_apps(user_id);
CREATE INDEX IF NOT EXISTS idx_active_platform_apps_service_id ON billing.active_platform_apps(service_id);
CREATE INDEX IF NOT EXISTS idx_active_platform_apps_status ON billing.active_platform_apps(status);
-- Add comment for documentation
COMMENT ON TABLE billing.active_platform_apps IS 'Tracks active platform app deployments for hourly billing';
COMMENT ON COLUMN billing.active_platform_apps.service_id IS 'References platform_apps.id in public schema';
COMMENT ON COLUMN billing.active_platform_apps.hourly_rate IS 'Hourly billing rate in credits';
COMMENT ON COLUMN billing.active_platform_apps.last_billed_at IS 'Last time this service was billed (for prorated calculations)';
-- Enable RLS
ALTER TABLE billing.active_platform_apps ENABLE ROW LEVEL SECURITY;
-- Grant table permissions
GRANT SELECT ON billing.active_platform_apps TO authenticated;
GRANT ALL ON billing.active_platform_apps TO service_role;
-- Policy: Users can view their own active platform apps
CREATE POLICY "Users can view own active platform apps"
    ON billing.active_platform_apps
    FOR SELECT
    USING (auth.uid() = user_id);
-- Policy: Service role can manage all records (for billing cron)
CREATE POLICY "Service role can manage active platform apps"
    ON billing.active_platform_apps
    FOR ALL
    USING (auth.role() = 'service_role');
