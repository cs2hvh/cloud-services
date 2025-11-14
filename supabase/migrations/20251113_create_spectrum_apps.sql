-- Migration: Create spectrum_apps table for Cloudflare Spectrum application metadata
-- Created: 2025-11-13

-- Table holds a lightweight normalized view plus raw Cloudflare result (cf_app)
CREATE TABLE IF NOT EXISTS spectrum_apps (
  id TEXT PRIMARY KEY,                               -- Cloudflare Spectrum app id
  zone_id TEXT NOT NULL,                             -- Cloudflare zone id
  name TEXT NOT NULL,                                -- DNS name (hostname)
  dns_type TEXT NOT NULL CHECK (dns_type IN ('A','CNAME')),
  protocol TEXT NOT NULL,                            -- e.g. tcp/22
  owner_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT,                                       -- lifecycle marker (created, updated, deleted, etc.)
  cf_app JSONB,                                      -- full Cloudflare configuration snapshot
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT spectrum_apps_zone_name_unique UNIQUE(zone_id, name)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_spectrum_apps_owner ON spectrum_apps(owner_id);
CREATE INDEX IF NOT EXISTS idx_spectrum_apps_project ON spectrum_apps(project_id);
CREATE INDEX IF NOT EXISTS idx_spectrum_apps_zone ON spectrum_apps(zone_id);
CREATE INDEX IF NOT EXISTS idx_spectrum_apps_status ON spectrum_apps(status);

-- Enable Row Level Security
ALTER TABLE spectrum_apps ENABLE ROW LEVEL SECURITY;

-- RLS Policies (owner-scoped similar to apps/object_spaces)
CREATE POLICY "Users can view their spectrum apps" ON spectrum_apps
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their spectrum apps" ON spectrum_apps
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their spectrum apps" ON spectrum_apps
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their spectrum apps" ON spectrum_apps
  FOR DELETE USING (auth.uid() = owner_id);

-- Trigger to keep updated_at current (uses existing shared function)
CREATE TRIGGER update_spectrum_apps_updated_at
  BEFORE UPDATE ON spectrum_apps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional comments
COMMENT ON TABLE spectrum_apps IS 'Cloudflare Spectrum application metadata and cached configuration';
COMMENT ON COLUMN spectrum_apps.cf_app IS 'Raw Cloudflare API result (configuration snapshot)';
COMMENT ON COLUMN spectrum_apps.status IS 'Local lifecycle state flag (created/updated/etc.)';
