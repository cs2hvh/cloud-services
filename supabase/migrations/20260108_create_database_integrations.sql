-- Migration: Create database_integrations table
-- Purpose: Track links between databases and platform apps
-- Date: 2026-01-08

-- ============================================
-- TABLE: database_integrations
-- ============================================
CREATE TABLE IF NOT EXISTS database_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core relationships (NOT FK to allow flexibility)
    database_cluster_id TEXT NOT NULL,  -- References database_cluster.cluster_id
    platform_app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
    
    -- Ownership (for RLS)
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'linked', 'failed', 'unlinked')),
    
    -- What was injected (for cleanup)
    injected_env_keys TEXT[] DEFAULT '{}',
    env_prefix TEXT DEFAULT 'DATABASE',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unlinked_at TIMESTAMP WITH TIME ZONE,
    unlinked_by UUID REFERENCES auth.users(id),
    
    -- Error tracking
    error_message TEXT
);

-- ============================================
-- UNIQUE CONSTRAINT: Prevent duplicate active links
-- Only one active (pending/linked) integration per app+database combo
-- ============================================
CREATE UNIQUE INDEX idx_db_integrations_unique_active 
ON database_integrations (database_cluster_id, platform_app_id) 
WHERE status IN ('pending', 'linked');

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_db_integrations_app ON database_integrations(platform_app_id);
CREATE INDEX idx_db_integrations_db ON database_integrations(database_cluster_id);
CREATE INDEX idx_db_integrations_user ON database_integrations(user_id);
CREATE INDEX idx_db_integrations_status ON database_integrations(status);
CREATE INDEX idx_db_integrations_project ON database_integrations(project_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE database_integrations ENABLE ROW LEVEL SECURITY;

-- Users can view integrations they created
CREATE POLICY "Users can view their integrations" ON database_integrations
    FOR SELECT USING (auth.uid() = user_id);

-- Users can create integrations (ownership verified in application layer)
CREATE POLICY "Users can create integrations" ON database_integrations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update integrations they own OR if they own the app
-- (This allows both app owner and database owner to manage)
CREATE POLICY "Users can update their integrations" ON database_integrations
    FOR UPDATE USING (
        auth.uid() = user_id 
        OR EXISTS (
            SELECT 1 FROM platform_apps 
            WHERE id = platform_app_id AND user_id = auth.uid()
        )
    );

-- Users can delete integrations they own
CREATE POLICY "Users can delete their integrations" ON database_integrations
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================
CREATE TRIGGER update_database_integrations_updated_at
    BEFORE UPDATE ON database_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: database_integrations table created';
END $$;
