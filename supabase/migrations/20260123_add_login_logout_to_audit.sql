-- ============================================
-- ADD LOGIN/LOGOUT TO EXISTING AUDIT LOG TABLE
-- Created: January 23, 2026
-- Purpose: Add authentication tracking (login/logout) to existing audit_logs
-- ============================================

-- Step 1: Drop existing CHECK constraints
ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS audit_logs_action_check;

ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS audit_logs_service_type_check;

-- Step 2: Add new CHECK constraints with login/logout and auth
ALTER TABLE public.audit_logs 
  ADD CONSTRAINT audit_logs_action_check 
  CHECK (action IN ('create', 'update', 'delete', 'login', 'logout'));

ALTER TABLE public.audit_logs 
  ADD CONSTRAINT audit_logs_service_type_check 
  CHECK (service_type IN (
    'kubernetes', 
    'database', 
    'network_ddos', 
    'platform_apps', 
    'object_storage',
    'auth'
  ));

-- Step 3: Make service_type nullable for auth actions (if it's NOT NULL)
ALTER TABLE public.audit_logs 
  ALTER COLUMN service_type DROP NOT NULL;

-- Step 4: Make service_id nullable for auth actions (if it's NOT NULL)
ALTER TABLE public.audit_logs 
  ALTER COLUMN service_id DROP NOT NULL;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Migration completed. Login/logout actions added to audit log system.';
  RAISE NOTICE 'You can now log authentication events with action=login or action=logout';
END $$;
