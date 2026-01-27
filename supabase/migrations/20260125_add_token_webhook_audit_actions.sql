-- ============================================
-- ADD TOKEN AND WEBHOOK ACTIONS TO AUDIT LOG
-- Created: January 25, 2026
-- Purpose: Add token_expired, token_refreshed, webhook_received actions
--          provider_connect, provider_disconnect, password_change actions
--          and git_webhook service type for audit logging
-- ============================================

-- Step 1: Drop existing CHECK constraints
ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS audit_logs_action_check;

ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS audit_logs_service_type_check;

-- Step 2: Add new CHECK constraint for actions (includes new token, webhook, and auth actions)
ALTER TABLE public.audit_logs 
  ADD CONSTRAINT audit_logs_action_check 
  CHECK (action IN (
    'create', 
    'update', 
    'delete', 
    'login', 
    'logout',
    'token_expired',
    'token_refreshed',
    'webhook_received',
    'provider_connect',
    'provider_disconnect',
    'password_change'
  ));

-- Step 3: Add new CHECK constraint for service_type (includes git_webhook)
ALTER TABLE public.audit_logs 
  ADD CONSTRAINT audit_logs_service_type_check 
  CHECK (service_type IN (
    'kubernetes', 
    'database', 
    'network_ddos', 
    'platform_apps', 
    'object_storage',
    'auth',
    'git_webhook'
  ));

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully.';
  RAISE NOTICE 'New actions added: token_expired, token_refreshed, webhook_received, provider_connect, provider_disconnect, password_change';
  RAISE NOTICE 'New service_type added: git_webhook';
END $$;
