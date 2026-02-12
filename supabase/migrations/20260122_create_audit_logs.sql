-- ============================================
-- AUDIT LOG SCHEMA - Migration
-- Created: January 22, 2026
-- Purpose: Create immutable audit log system for admin monitoring
-- ============================================

-- Create audits schema
CREATE SCHEMA IF NOT EXISTS audits;

-- Grant usage on schema to authenticated users and service role
GRANT USAGE ON SCHEMA audits TO authenticated, service_role;
GRANT ALL ON SCHEMA audits TO postgres;

-- Main audit log table (partitioned by date)
CREATE TABLE audits.audit_logs (
  -- Primary Key
  id UUID DEFAULT gen_random_uuid(),
  
  -- ====== ACTOR INFORMATION ======
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL CHECK (user_role IN ('user', 'admin', 'system')),
  user_email TEXT,
  user_username TEXT,
  
  -- ====== ACTION INFORMATION ======
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'login', 'logout')),
  service_type TEXT CHECK (service_type IN (
    'kubernetes', 
    'database', 
    'network_ddos', 
    'platform_apps', 
    'object_storage',
    'auth'
  )),
  service_id TEXT,
  service_name TEXT,
  
  -- ====== STATE CAPTURE ======
  before_state JSONB,           -- State before action (update/delete)
  after_state JSONB,            -- State after action (create/update)
  changes JSONB,                -- Computed diff for updates
  
  -- ====== REQUEST CONTEXT ======
  ip_address INET,
  user_agent TEXT,
  request_id UUID,              -- Correlation ID for tracing
  
  -- ====== METADATA ======
  metadata JSONB,               -- Additional context
  
  -- ====== TIMESTAMPS ======
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- ====== INTEGRITY ======
  checksum TEXT,                -- SHA-256 hash computed by application
  
  -- ====== PARTITION KEY ======
  created_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Composite primary key including partition key
  PRIMARY KEY (id, created_date)
  
) PARTITION BY RANGE (created_date);

-- ============================================
-- MONTHLY PARTITIONS (2026)
-- ============================================

CREATE TABLE audits.audit_logs_2026_01 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE audits.audit_logs_2026_02 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE audits.audit_logs_2026_03 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE audits.audit_logs_2026_04 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audits.audit_logs_2026_05 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE audits.audit_logs_2026_06 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE audits.audit_logs_2026_07 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE audits.audit_logs_2026_08 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE audits.audit_logs_2026_09 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE audits.audit_logs_2026_10 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE audits.audit_logs_2026_11 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE audits.audit_logs_2026_12 PARTITION OF audits.audit_logs
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Primary query patterns
CREATE INDEX idx_audit_user_id ON audits.audit_logs(user_id);
CREATE INDEX idx_audit_service_type ON audits.audit_logs(service_type);
CREATE INDEX idx_audit_action ON audits.audit_logs(action);
CREATE INDEX idx_audit_created_at ON audits.audit_logs(created_at DESC);
CREATE INDEX idx_audit_service_id ON audits.audit_logs(service_id);

-- Composite indexes for common admin queries
CREATE INDEX idx_audit_admin_query 
  ON audits.audit_logs(service_type, action, created_at DESC);

CREATE INDEX idx_audit_user_timeline 
  ON audits.audit_logs(user_id, created_at DESC);

-- Full-text search on changes (optional but recommended)
CREATE INDEX idx_audit_changes_gin ON audits.audit_logs USING GIN(changes);
CREATE INDEX idx_audit_metadata_gin ON audits.audit_logs USING GIN(metadata);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE audits.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs
CREATE POLICY "Admins can read audit logs" ON audits.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'admin' = ANY(roles)
    )
  );

-- Service role can insert (server-side only)
CREATE POLICY "Service role can insert audit logs" ON audits.audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- NO UPDATE POLICY - prevents any updates
-- NO DELETE POLICY - prevents any deletes

-- ============================================
-- TAMPER PREVENTION TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION audits.prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. Modifications are not allowed.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audits.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audits.prevent_audit_modification();

-- ============================================
-- HELPER FUNCTION: Auto-create future partitions
-- ============================================

CREATE OR REPLACE FUNCTION audits.create_audit_monthly_partition(target_date DATE)
RETURNS TEXT AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  start_date := date_trunc('month', target_date);
  end_date := start_date + INTERVAL '1 month';
  partition_name := 'audit_logs_' || to_char(start_date, 'YYYY_MM');
  
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS audits.%I PARTITION OF audits.audit_logs
     FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );
  
  RETURN partition_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GRANT PERMISSIONS ON TABLES
-- ============================================

-- Grant table permissions
GRANT SELECT ON audits.audit_logs TO authenticated;
GRANT INSERT ON audits.audit_logs TO service_role;
GRANT ALL ON audits.audit_logs TO postgres;

-- Grant permissions on all tables in audits schema
GRANT SELECT ON ALL TABLES IN SCHEMA audits TO authenticated;
GRANT INSERT ON ALL TABLES IN SCHEMA audits TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA audits TO postgres;

-- Grant default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA audits
  GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA audits
  GRANT INSERT ON TABLES TO service_role;

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify table creation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'audits' AND tablename = 'audit_logs') THEN
    RAISE NOTICE 'Audit logs table created successfully in audits schema';
  END IF;
  
  RAISE NOTICE 'Migration completed. Audit log system is ready in audits schema.';
END $$;
