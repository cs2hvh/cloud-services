-- ============================================
-- QUICK REFERENCE: Audits Schema Commands
-- Copy and paste these into Supabase SQL Editor
-- 
-- IMPORTANT NOTE FOR DEVELOPERS:
-- When using Supabase JS client to access audits schema tables:
-- ✅ CORRECT: supabase.schema('audits').from('audit_logs')
-- ❌ WRONG:   supabase.from('audits.audit_logs')
-- ============================================

-- ==========================================
-- 1. CREATE SCHEMA (Run this first)
-- ==========================================
CREATE SCHEMA IF NOT EXISTS audits;
GRANT USAGE ON SCHEMA audits TO authenticated, service_role, anon;
GRANT ALL ON SCHEMA audits TO postgres;


-- ==========================================
-- 2. SET DEFAULT PERMISSIONS
-- ==========================================
ALTER DEFAULT PRIVILEGES IN SCHEMA audits GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA audits GRANT INSERT ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA audits GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA audits GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;


-- ==========================================
-- 3. VERIFY SCHEMA CREATION
-- ==========================================
SELECT 
    schema_name,
    schema_owner
FROM information_schema.schemata 
WHERE schema_name = 'audits';


-- ==========================================
-- 4. CHECK PERMISSIONS
-- ==========================================
SELECT 
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.schema_privileges 
WHERE table_schema = 'audits'
ORDER BY grantee, privilege_type;


-- ==========================================
-- 5. AFTER MIGRATION: VERIFY TABLES
-- ==========================================
-- List all tables in audits schema
SELECT 
    tablename,
    hasindexes,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'audits';


-- ==========================================
-- 6. CHECK PARTITIONS
-- ==========================================
SELECT 
    parent.relname AS parent_table,
    child.relname AS partition_name,
    pg_get_expr(child.relpartbound, child.oid) AS partition_bounds
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
JOIN pg_namespace nmsp_parent ON nmsp_parent.oid = parent.relnamespace
WHERE nmsp_parent.nspname = 'audits' 
AND parent.relname = 'audit_logs'
ORDER BY child.relname;


-- ==========================================
-- 7. COUNT RECORDS (After migration)
-- ==========================================
SELECT COUNT(*) as total_audit_logs FROM audits.audit_logs;


-- ==========================================
-- 8. CHECK RLS POLICIES
-- ==========================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'audits';


-- ==========================================
-- 9. CHECK TRIGGERS
-- ==========================================
SELECT 
    trigger_schema,
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'audits';


-- ==========================================
-- 10. CHECK INDEXES
-- ==========================================
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'audits'
ORDER BY tablename, indexname;


-- ==========================================
-- 11. TEST IMMUTABILITY (Should fail)
-- ==========================================
-- This should return an error: "Audit logs are immutable"
-- DO NOT RUN THIS unless testing!
-- UPDATE audits.audit_logs SET action = 'test' WHERE id = 'some-id';


-- ==========================================
-- 12. VIEW RECENT AUDIT LOGS
-- ==========================================
SELECT 
    id,
    user_email,
    action,
    service_type,
    service_name,
    created_at
FROM audits.audit_logs
ORDER BY created_at DESC
LIMIT 10;


-- ==========================================
-- 13. GRANT ADDITIONAL PERMISSIONS (if needed)
-- ==========================================
-- Grant permissions on existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA audits TO authenticated;
GRANT INSERT ON ALL TABLES IN SCHEMA audits TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA audits TO postgres;

-- Grant permissions on existing functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA audits TO authenticated, service_role;


-- ==========================================
-- 14. CREATE FUTURE PARTITION (Manual)
-- ==========================================
-- If you need to create a partition for a future month:
SELECT audits.create_audit_monthly_partition('2027-01-01'::DATE);


-- ==========================================
-- 15. CLEANUP OLD PUBLIC SCHEMA (After successful migration)
-- ==========================================
-- ⚠️ WARNING: Only run this after verifying audits schema works!
-- ⚠️ Make sure you have a backup!

-- DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
-- DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;
-- DROP TRIGGER IF EXISTS audit_logs_immutable ON public.audit_logs;
-- DROP FUNCTION IF EXISTS public.prevent_audit_modification();
-- DROP FUNCTION IF EXISTS public.create_audit_monthly_partition(DATE);
-- DROP TABLE IF EXISTS public.audit_logs CASCADE;
