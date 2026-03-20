-- ============================================
-- SETUP AUDITS SCHEMA - Quick Commands
-- Purpose: Create audits schema and grant necessary permissions
-- Run this BEFORE running the full migration if schema doesn't exist
-- ============================================

-- Create audits schema
CREATE SCHEMA IF NOT EXISTS audits;

-- Grant usage on schema
GRANT USAGE ON SCHEMA audits TO authenticated, service_role, anon;
GRANT ALL ON SCHEMA audits TO postgres;

-- Grant permissions on all current tables
GRANT SELECT ON ALL TABLES IN SCHEMA audits TO authenticated;
GRANT INSERT ON ALL TABLES IN SCHEMA audits TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA audits TO postgres;

-- Grant permissions on all current functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA audits TO authenticated, service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA audits
  GRANT SELECT ON TABLES TO authenticated;
  
ALTER DEFAULT PRIVILEGES IN SCHEMA audits
  GRANT INSERT ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA audits
  GRANT ALL ON TABLES TO postgres;

-- Set default privileges for future functions
ALTER DEFAULT PRIVILEGES IN SCHEMA audits
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- Verify schema creation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'audits') THEN
    RAISE NOTICE 'Audits schema created and configured successfully';
  ELSE
    RAISE EXCEPTION 'Failed to create audits schema';
  END IF;
END $$;
