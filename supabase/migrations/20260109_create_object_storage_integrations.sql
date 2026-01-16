-- ============================================
-- Object Storage Integrations Table
-- Tracks links between platform apps and object storage buckets
-- Created: 2026-01-09
-- ============================================

-- Create table
CREATE TABLE IF NOT EXISTS object_storage_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Foreign keys
    object_space_id UUID NOT NULL,  -- References object_spaces.id
    platform_app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'linked', 'failed', 'unlinked')),
    
    -- Environment variables injected
    injected_env_keys TEXT[] DEFAULT '{}',
    env_prefix TEXT DEFAULT 'S3',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unlinked_at TIMESTAMP WITH TIME ZONE,
    unlinked_by UUID REFERENCES auth.users(id),
    
    -- Error tracking
    error_message TEXT
);

-- Enable RLS
ALTER TABLE object_storage_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own object storage integrations" 
ON object_storage_integrations FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create object storage integrations" 
ON object_storage_integrations FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own object storage integrations" 
ON object_storage_integrations FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own object storage integrations" 
ON object_storage_integrations FOR DELETE 
USING (auth.uid() = user_id);

-- Service role bypass for backend operations
CREATE POLICY "Service role can manage all object storage integrations"
ON object_storage_integrations FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Indexes for performance
CREATE INDEX idx_os_integrations_app ON object_storage_integrations(platform_app_id);
CREATE INDEX idx_os_integrations_bucket ON object_storage_integrations(object_space_id);
CREATE INDEX idx_os_integrations_user ON object_storage_integrations(user_id);
CREATE INDEX idx_os_integrations_status ON object_storage_integrations(status);
CREATE INDEX idx_os_integrations_active ON object_storage_integrations(object_space_id, platform_app_id) 
    WHERE status IN ('pending', 'linked');

-- Updated_at trigger
CREATE TRIGGER update_object_storage_integrations_updated_at
    BEFORE UPDATE ON object_storage_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE object_storage_integrations IS 'Tracks links between platform apps and object storage buckets';
COMMENT ON COLUMN object_storage_integrations.object_space_id IS 'References object_spaces.id (UUID)';
COMMENT ON COLUMN object_storage_integrations.injected_env_keys IS 'Array of env var keys injected into the app';
COMMENT ON COLUMN object_storage_integrations.env_prefix IS 'Prefix for generated env vars (default: S3)';
