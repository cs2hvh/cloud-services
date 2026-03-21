-- Platform Applications table (Git-based app deployment platform)
CREATE TABLE platform_apps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic Info
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE, -- URL-friendly name like "my-app-abc123"
    
    -- Git Source
    git_provider TEXT NOT NULL CHECK (git_provider IN ('github', 'gitlab', 'bitbucket')),
    repository_id TEXT NOT NULL,
    repository_name TEXT NOT NULL,
    repository_url TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    
    -- Build Configuration
    framework TEXT NOT NULL,
    build_command TEXT,
    output_directory TEXT,
    
    -- Deployment Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'running', 'failed', 'stopped')),
    deployment_url TEXT,
    
    -- Relationships
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- App Environment Variables table
CREATE TABLE platform_app_env_vars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(app_id, key)
);
-- Enable RLS
ALTER TABLE platform_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_app_env_vars ENABLE ROW LEVEL SECURITY;
-- RLS Policies for platform_apps
CREATE POLICY "Users can view their own platform apps" ON platform_apps
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create platform apps" ON platform_apps
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own platform apps" ON platform_apps
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own platform apps" ON platform_apps
    FOR DELETE USING (auth.uid() = user_id);
-- RLS Policies for platform_app_env_vars
CREATE POLICY "Users can manage env vars for their platform apps" ON platform_app_env_vars
    FOR ALL USING (
        EXISTS (SELECT 1 FROM platform_apps WHERE id = app_id AND user_id = auth.uid())
    );
-- Triggers for updated_at
CREATE TRIGGER update_platform_apps_updated_at
    BEFORE UPDATE ON platform_apps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
-- Indexes for performance
CREATE INDEX idx_platform_apps_user ON platform_apps(user_id);
CREATE INDEX idx_platform_apps_project ON platform_apps(project_id);
CREATE INDEX idx_platform_apps_slug ON platform_apps(slug);
CREATE INDEX idx_platform_apps_status ON platform_apps(status);
CREATE INDEX idx_platform_app_env_vars_app ON platform_app_env_vars(app_id);
