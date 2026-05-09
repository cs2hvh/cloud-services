-- Add Proxmox infrastructure tables for VPS/VM management

-- Proxmox hosts table
CREATE TABLE IF NOT EXISTS proxmox_hosts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    host_url TEXT NOT NULL,
    allow_insecure_tls BOOLEAN DEFAULT FALSE,
    token_id TEXT,
    token_secret TEXT,
    username TEXT,
    password TEXT,
    node TEXT NOT NULL,
    storage TEXT NOT NULL,
    bridge TEXT NOT NULL DEFAULT 'vmbr0',
    gateway_ip INET,
    dns_primary INET,
    dns_secondary INET,
    template_vmid INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Public IP pools table (for tracking MAC addresses and their assigned IPs)
CREATE TABLE IF NOT EXISTS public_ip_pools (
    id BIGSERIAL PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES proxmox_hosts(id) ON DELETE CASCADE,
    mac TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(host_id, mac)
);
-- Public IP pool IPs table (individual IPs per pool)
CREATE TABLE IF NOT EXISTS public_ip_pool_ips (
    id BIGSERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL REFERENCES public_ip_pools(id) ON DELETE CASCADE,
    ip TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pool_id, ip)
);
-- Proxmox templates table (for OS/Image management)
CREATE TABLE IF NOT EXISTS proxmox_templates (
    id BIGSERIAL PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES proxmox_hosts(id) ON DELETE CASCADE,
    vmid INTEGER NOT NULL,
    name TEXT NOT NULL,
    os_type TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(host_id, vmid)
);
-- Servers (VMs) table - extended with Proxmox fields
CREATE TABLE IF NOT EXISTS servers (
    id BIGSERIAL PRIMARY KEY,
    vmid INTEGER,
    node TEXT,
    name TEXT NOT NULL,
    ip INET NOT NULL UNIQUE,
    os TEXT,
    location TEXT NOT NULL REFERENCES proxmox_hosts(id),
    cpu_cores INTEGER NOT NULL CHECK (cpu_cores >= 1),
    memory_mb INTEGER NOT NULL CHECK (memory_mb >= 512),
    disk_gb INTEGER NOT NULL CHECK (disk_gb >= 10),
    status TEXT DEFAULT 'provisioning' CHECK (status IN (
        'provisioning', 'running', 'stopped', 'suspended', 'failed', 'error'
    )),
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_email TEXT,
    hourly_cost DECIMAL(10, 4) DEFAULT 0,
    monthly_cost DECIMAL(10, 4) DEFAULT 0,
    billing_start TIMESTAMP WITH TIME ZONE,
    billing_end TIMESTAMP WITH TIME ZONE,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Server backups table
CREATE TABLE IF NOT EXISTS server_backups (
    id BIGSERIAL PRIMARY KEY,
    server_id BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    backup_id TEXT,
    size_bytes BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);
-- Server snapshots table
CREATE TABLE IF NOT EXISTS server_snapshots (
    id BIGSERIAL PRIMARY KEY,
    server_id BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    size_bytes BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Enable RLS
ALTER TABLE proxmox_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_ip_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_ip_pool_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE proxmox_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_snapshots ENABLE ROW LEVEL SECURITY;
-- RLS Policies for proxmox_hosts (admin only)
DO $$ BEGIN CREATE POLICY "Admins can view proxmox hosts" ON proxmox_hosts FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can create proxmox hosts" ON proxmox_hosts FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can update proxmox hosts" ON proxmox_hosts FOR UPDATE USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can delete proxmox hosts" ON proxmox_hosts FOR DELETE USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view public ip pools" ON public_ip_pools FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage public ip pools" ON public_ip_pools FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can update public ip pools" ON public_ip_pools FOR UPDATE USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can delete public ip pools" ON public_ip_pools FOR DELETE USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view public ip pool ips" ON public_ip_pool_ips FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage public ip pool ips" ON public_ip_pool_ips FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can update public ip pool ips" ON public_ip_pool_ips FOR UPDATE USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can delete public ip pool ips" ON public_ip_pool_ips FOR DELETE USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view proxmox templates" ON proxmox_templates FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage proxmox templates" ON proxmox_templates FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can delete proxmox templates" ON proxmox_templates FOR DELETE USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can update proxmox templates" ON proxmox_templates FOR UPDATE USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can view their own servers" ON servers FOR SELECT USING (auth.uid()::text = owner_id::text); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view all servers" ON servers FOR SELECT USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND 'admin' = ANY(user_profiles.roles))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create servers" ON servers FOR INSERT WITH CHECK (auth.uid()::text = owner_id::text); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update their own servers" ON servers FOR UPDATE USING (auth.uid()::text = owner_id::text); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete their own servers" ON servers FOR DELETE USING (auth.uid()::text = owner_id::text); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can view backups of their servers" ON server_backups FOR SELECT USING (EXISTS (SELECT 1 FROM servers WHERE servers.id = server_backups.server_id AND auth.uid()::text = servers.owner_id::text)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can view snapshots of their servers" ON server_snapshots FOR SELECT USING (EXISTS (SELECT 1 FROM servers WHERE servers.id = server_snapshots.server_id AND auth.uid()::text = servers.owner_id::text)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_servers_owner_id ON servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_servers_location ON servers(location);
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_servers_vmid ON servers(vmid, node);
CREATE INDEX IF NOT EXISTS idx_public_ip_pools_host_id ON public_ip_pools(host_id);
CREATE INDEX IF NOT EXISTS idx_public_ip_pool_ips_pool_id ON public_ip_pool_ips(pool_id);
CREATE INDEX IF NOT EXISTS idx_proxmox_templates_host_id ON proxmox_templates(host_id);
CREATE INDEX IF NOT EXISTS idx_server_backups_server_id ON server_backups(server_id);
CREATE INDEX IF NOT EXISTS idx_server_snapshots_server_id ON server_snapshots(server_id);

COMMENT ON COLUMN proxmox_templates.os_type IS 'e.g., ubuntu-22.04, debian-12';
