-- Create apps table for Jenkins deployments
CREATE TABLE apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    github_url TEXT NOT NULL,
    port INTEGER NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'building',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on apps table
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;

-- Apps policies
CREATE POLICY "Users can view their own apps" ON apps
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create apps" ON apps
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own apps" ON apps
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own apps" ON apps
    FOR DELETE USING (auth.uid() = user_id);

-- Create index for port lookups
CREATE INDEX idx_apps_port ON apps(port);

-- Trigger for apps updated_at
CREATE TRIGGER update_apps_updated_at
    BEFORE UPDATE ON apps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();