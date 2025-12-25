-- ============================================
-- Migration: Add Webhook Support for Auto-Deploy
-- Date: 2025-12-05
-- Purpose: Enable automatic deployments on git push
-- ============================================

-- 1. Add auto_deploy columns to platform_apps
ALTER TABLE platform_apps 
ADD COLUMN IF NOT EXISTS auto_deploy BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS deploy_branch TEXT,
ADD COLUMN IF NOT EXISTS last_deploy_trigger TEXT CHECK (last_deploy_trigger IN ('manual', 'webhook', 'scheduled')),
ADD COLUMN IF NOT EXISTS last_deploy_commit TEXT;

-- 2. Create webhooks table
CREATE TABLE IF NOT EXISTS platform_app_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to app
    app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
    
    -- Provider info
    provider TEXT NOT NULL CHECK (provider IN ('github', 'gitlab', 'bitbucket')),
    
    -- Webhook details from provider
    webhook_id TEXT NOT NULL,           -- Provider's webhook ID (for deletion)
    webhook_secret TEXT NOT NULL,       -- HMAC secret for signature validation
    webhook_url TEXT NOT NULL,          -- Our endpoint URL
    
    -- Configuration
    events TEXT[] DEFAULT ARRAY['push'],
    auto_deploy_enabled BOOLEAN DEFAULT true,
    
    -- Status tracking
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    trigger_count INTEGER DEFAULT 0,
    last_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One webhook per app per provider
    UNIQUE(app_id, provider)
);

-- 3. Enable RLS
ALTER TABLE platform_app_webhooks ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies - Users can manage webhooks for their own apps
CREATE POLICY "Users can view webhooks for their apps" ON platform_app_webhooks
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM platform_apps WHERE id = app_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can create webhooks for their apps" ON platform_app_webhooks
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM platform_apps WHERE id = app_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can update webhooks for their apps" ON platform_app_webhooks
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM platform_apps WHERE id = app_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can delete webhooks for their apps" ON platform_app_webhooks
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM platform_apps WHERE id = app_id AND user_id = auth.uid())
    );

-- 5. Service role policy for webhook endpoint (needs to query without user context)
CREATE POLICY "Service role can access all webhooks" ON platform_app_webhooks
    FOR ALL USING (auth.role() = 'service_role');

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_platform_app_webhooks_app ON platform_app_webhooks(app_id);
CREATE INDEX IF NOT EXISTS idx_platform_app_webhooks_provider ON platform_app_webhooks(provider);

-- 7. Trigger for updated_at
CREATE TRIGGER update_platform_app_webhooks_updated_at
    BEFORE UPDATE ON platform_app_webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Add index on platform_apps for repository lookups (used by webhook handler)
CREATE INDEX IF NOT EXISTS idx_platform_apps_repository ON platform_apps(repository_id, git_provider);

