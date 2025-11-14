-- Migration: Update spectrum_apps table structure
-- Created: 2025-11-14
-- Updates the spectrum_apps table to match new schema requirements

-- Drop the old table (careful: this will delete existing data)
-- If you need to preserve data, you should create a backup first
DROP TABLE IF EXISTS spectrum_apps CASCADE;

-- Create the updated spectrum_apps table
CREATE TABLE spectrum_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spectrum_id TEXT NOT NULL UNIQUE,
  dns JSONB NOT NULL,                                -- {name: encrypted string, type: "A" | "CNAME"}
  tls TEXT NOT NULL DEFAULT 'off' CHECK (tls IN ('off', 'full')),
  edge_ips JSONB NOT NULL,                           -- {type: string, connectivity: string}
  ip_firewall BOOLEAN NOT NULL DEFAULT false,
  traffic_type TEXT NOT NULL DEFAULT 'direct',
  origin_direct TEXT[] NOT NULL DEFAULT '{}',        -- array of origin IPs/hostnames
  proxy_protocol TEXT NOT NULL DEFAULT 'off',
  protocol TEXT NOT NULL,                            -- e.g., tcp/22, udp/27015
  owner_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_spectrum_apps_spectrum_id ON spectrum_apps(spectrum_id);
CREATE INDEX idx_spectrum_apps_owner ON spectrum_apps(owner_id);
CREATE INDEX idx_spectrum_apps_project ON spectrum_apps(project_id);
CREATE INDEX idx_spectrum_apps_status ON spectrum_apps(status);

-- Enable Row Level Security
ALTER TABLE spectrum_apps ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their spectrum apps" ON spectrum_apps
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their spectrum apps" ON spectrum_apps
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their spectrum apps" ON spectrum_apps
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their spectrum apps" ON spectrum_apps
  FOR DELETE USING (auth.uid() = owner_id);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_spectrum_apps_updated_at
  BEFORE UPDATE ON spectrum_apps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE spectrum_apps IS 'Cloudflare Spectrum application metadata with encrypted DNS names';
COMMENT ON COLUMN spectrum_apps.dns IS 'DNS configuration with encrypted hostname: {name: encrypted, type: A/CNAME}';
COMMENT ON COLUMN spectrum_apps.edge_ips IS 'Edge IP configuration: {type: string, connectivity: string}';
COMMENT ON COLUMN spectrum_apps.origin_direct IS 'Array of origin IPs/hostnames with ports (e.g., ["192.168.1.1:22"])';
