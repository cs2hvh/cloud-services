-- ============================================
-- ADD LOGIN/LOGOUT TO EXISTING AUDIT LOG TABLE
-- Created: January 23, 2026
-- Purpose: Add authentication tracking (login/logout) to existing audit_logs
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
    'ALTER TABLE %s ADD CONSTRAINT audit_logs_action_check CHECK (action IN (''create'', ''update'', ''delete'', ''login'', ''logout''))',
    target_table
  );

  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT audit_logs_service_type_check CHECK (service_type IN (''kubernetes'', ''database'', ''network_ddos'', ''platform_apps'', ''object_storage'', ''auth''))',
    target_table
  );

  EXECUTE format('ALTER TABLE %s ALTER COLUMN service_type DROP NOT NULL', target_table);
  EXECUTE format('ALTER TABLE %s ALTER COLUMN service_id DROP NOT NULL', target_table);
END $$;
-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Migration completed. Login/logout actions added to audit log system.';
  RAISE NOTICE 'You can now log authentication events with action=login or action=logout';
END $$;
