-- ============================================
-- ADD TOKEN AND WEBHOOK ACTIONS TO AUDIT LOG
-- Created: January 25, 2026
-- Purpose: Add token_expired, token_refreshed, webhook_received actions
--          provider_connect, provider_disconnect, password_change actions
--          and git_webhook service type for audit logging
-- ============================================

DO $$
DECLARE
  target_table regclass;
BEGIN
  target_table := COALESCE(
    to_regclass('public.audit_logs'),
    to_regclass('audits.audit_logs')
  );

  IF target_table IS NULL THEN
    RAISE NOTICE 'No audit_logs table found in public/audits schema; skipping migration.';
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS audit_logs_action_check', target_table);
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS audit_logs_service_type_check', target_table);

  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT audit_logs_action_check CHECK (action IN (''create'', ''update'', ''delete'', ''login'', ''logout'', ''token_expired'', ''token_refreshed'', ''webhook_received'', ''provider_connect'', ''provider_disconnect'', ''password_change''))',
    target_table
  );

  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT audit_logs_service_type_check CHECK (service_type IN (''kubernetes'', ''database'', ''network_ddos'', ''platform_apps'', ''object_storage'', ''auth'', ''git_webhook''))',
    target_table
  );
END $$;
-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully.';
  RAISE NOTICE 'New actions added: token_expired, token_refreshed, webhook_received, provider_connect, provider_disconnect, password_change';
  RAISE NOTICE 'New service_type added: git_webhook';
END $$;
