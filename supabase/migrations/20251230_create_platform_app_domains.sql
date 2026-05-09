-- Custom Domains table for platform apps
-- Allows users to connect their own domains to deployed applications

-- Create domain status enum
DO $$ BEGIN
    CREATE TYPE domain_status AS ENUM ('pending', 'verified', 'active', 'failed', 'removed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
    CREATE TYPE ssl_status AS ENUM ('pending', 'issuing', 'active', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
-- Create platform_app_domains table
CREATE TABLE IF NOT EXISTS platform_app_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relationships
    app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Domain info
    domain TEXT NOT NULL,
    status domain_status NOT NULL DEFAULT 'pending',
    
    -- Verification
    verification_token TEXT NOT NULL,
    verification_method TEXT NOT NULL DEFAULT 'txt' CHECK (verification_method IN ('txt', 'cname')),
    verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Activation (Ingress/SSL)
    activated_at TIMESTAMP WITH TIME ZONE,
    ssl_status ssl_status NOT NULL DEFAULT 'pending',
    
    -- Primary domain flag
    is_primary BOOLEAN DEFAULT FALSE,
    redirect_to_primary BOOLEAN DEFAULT FALSE,
    
    -- Error tracking
    last_error TEXT,
    last_check_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(domain) -- Only one record per domain (excluding removed)
);
-- Add has_custom_domains flag to platform_apps
ALTER TABLE platform_apps ADD COLUMN IF NOT EXISTS has_custom_domains BOOLEAN DEFAULT FALSE;
-- Add custom_domain column for primary custom domain reference
ALTER TABLE platform_apps ADD COLUMN IF NOT EXISTS custom_domain TEXT;
-- Enable RLS
ALTER TABLE platform_app_domains ENABLE ROW LEVEL SECURITY;
-- RLS Policies for platform_app_domains
CREATE POLICY "Users can view their own domains" ON platform_app_domains
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create domains" ON platform_app_domains
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own domains" ON platform_app_domains
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own domains" ON platform_app_domains
    FOR DELETE USING (auth.uid() = user_id);
-- Admin policies (assuming admins can see all)
CREATE POLICY "Admins can view all domains" ON platform_app_domains
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() 
            AND 'admin' = ANY(roles)
        )
    );
-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_platform_app_domains_app ON platform_app_domains(app_id);
CREATE INDEX IF NOT EXISTS idx_platform_app_domains_user ON platform_app_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_app_domains_domain ON platform_app_domains(domain);
CREATE INDEX IF NOT EXISTS idx_platform_app_domains_status ON platform_app_domains(status);
-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_platform_app_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
DROP TRIGGER IF EXISTS update_platform_app_domains_updated_at ON platform_app_domains;
CREATE TRIGGER update_platform_app_domains_updated_at
    BEFORE UPDATE ON platform_app_domains
    FOR EACH ROW
    EXECUTE FUNCTION update_platform_app_domains_updated_at();
-- Function to ensure only one primary domain per app
CREATE OR REPLACE FUNCTION ensure_single_primary_domain()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_primary = TRUE THEN
        UPDATE platform_app_domains
        SET is_primary = FALSE
        WHERE app_id = NEW.app_id AND id != NEW.id AND is_primary = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ensure_single_primary_domain_trigger ON platform_app_domains;
CREATE TRIGGER ensure_single_primary_domain_trigger
    BEFORE INSERT OR UPDATE OF is_primary ON platform_app_domains
    FOR EACH ROW
    WHEN (NEW.is_primary = TRUE)
    EXECUTE FUNCTION ensure_single_primary_domain();
