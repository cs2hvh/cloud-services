# Audit Logs Schema Migration Guide

## Overview
This guide explains how to migrate the `audit_logs` table from the `public` schema to the new `audits` schema.

## Changes Made

### 1. Migration File Updated
- **File**: `supabase/migrations/20260122_create_audit_logs.sql`
- Changed all references from `public.audit_logs` to `audits.audit_logs`
- Added schema creation and permission grants
- Updated all functions, triggers, indexes, and policies

### 2. Code Files Updated
- **`lib/audit/service.ts`**: Updated all table references to use `.schema('audits').from('audit_logs')`
- **`lib/supabase/queries/audit_logs.ts`**: Updated all table references to use `.schema('audits').from('audit_logs')`

**Important**: Supabase JS client requires using `.schema('schema_name')` method before `.from('table_name')` to access tables in custom schemas. Using `"schema.table"` notation doesn't work.

## Migration Steps

### Option 1: Fresh Setup (Recommended for new installations)

If you haven't deployed the audit_logs table yet, simply run:

```bash
# Using Supabase CLI
supabase db push

# Or apply migrations manually
psql -h <your-db-host> -U postgres -d <your-db-name> -f supabase/migrations/setup_audits_schema.sql
psql -h <your-db-host> -U postgres -d <your-db-name> -f supabase/migrations/20260122_create_audit_logs.sql
```

### Option 2: Migrate Existing Data

If you already have data in `public.audit_logs`, follow these steps:

#### Step 1: Create audits schema
```sql
-- Run this in Supabase SQL Editor or via psql
CREATE SCHEMA IF NOT EXISTS audits;
GRANT USAGE ON SCHEMA audits TO authenticated, service_role, anon;
GRANT ALL ON SCHEMA audits TO postgres;
```

#### Step 2: Backup existing data (IMPORTANT!)
```sql
-- Create a backup table
CREATE TABLE public.audit_logs_backup AS SELECT * FROM public.audit_logs;
```

#### Step 3: Drop old table and constraints
```sql
-- Drop existing policies
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;

-- Drop trigger
DROP TRIGGER IF EXISTS audit_logs_immutable ON public.audit_logs;
DROP FUNCTION IF EXISTS public.prevent_audit_modification();

-- Drop indexes
DROP INDEX IF EXISTS public.idx_audit_user_id;
DROP INDEX IF EXISTS public.idx_audit_service_type;
DROP INDEX IF EXISTS public.idx_audit_action;
DROP INDEX IF EXISTS public.idx_audit_created_at;
DROP INDEX IF EXISTS public.idx_audit_service_id;
DROP INDEX IF EXISTS public.idx_audit_admin_query;
DROP INDEX IF EXISTS public.idx_audit_user_timeline;
DROP INDEX IF EXISTS public.idx_audit_changes_gin;
DROP INDEX IF EXISTS public.idx_audit_metadata_gin;

-- Drop old partitions
DROP TABLE IF EXISTS public.audit_logs_2026_01 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_02 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_03 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_04 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_05 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_06 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_07 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_08 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_09 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_10 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_11 CASCADE;
DROP TABLE IF EXISTS public.audit_logs_2026_12 CASCADE;

-- Drop main table
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP FUNCTION IF EXISTS public.create_audit_monthly_partition(DATE);
```

#### Step 4: Run the new migration
```bash
# Apply the migration file
psql -h <your-db-host> -U postgres -d <your-db-name> -f supabase/migrations/20260122_create_audit_logs.sql
```

#### Step 5: Restore data
```sql
-- Insert data back into new table
INSERT INTO audits.audit_logs 
SELECT * FROM public.audit_logs_backup;

-- Verify count matches
SELECT COUNT(*) FROM audits.audit_logs;
SELECT COUNT(*) FROM public.audit_logs_backup;

-- Once verified, drop backup
-- DROP TABLE public.audit_logs_backup;
```

## Quick Commands for Supabase Dashboard

### Via Supabase SQL Editor

**1. Create Schema and Set Permissions:**
```sql
-- Run setup_audits_schema.sql content
CREATE SCHEMA IF NOT EXISTS audits;
GRANT USAGE ON SCHEMA audits TO authenticated, service_role, anon;
GRANT ALL ON SCHEMA audits TO postgres;

ALTER DEFAULT PRIVILEGES IN SCHEMA audits GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA audits GRANT INSERT ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA audits GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA audits GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
```

**2. Verify Schema:**
```sql
-- Check if schema exists
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'audits';

-- Check schema permissions
SELECT * FROM information_schema.schema_privileges WHERE table_schema = 'audits';
```

**3. After Migration, Verify Tables:**
```sql
-- List all tables in audits schema
SELECT tablename FROM pg_tables WHERE schemaname = 'audits';

-- Check audit_logs table structure
\d audits.audit_logs

-- Verify partitions
SELECT 
  parent.relname AS parent,
  child.relname AS partition,
  pg_get_expr(child.relpartbound, child.oid) AS bounds
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
WHERE parent.relname = 'audit_logs'
ORDER BY child.relname;
```

## Using Supabase CLI

```bash
# Link to your project
supabase link --project-ref <your-project-ref>

# Pull remote changes (if any)
supabase db pull

# Apply all pending migrations
supabase db push

# Or apply specific migration
supabase migration up --file 20260122_create_audit_logs.sql
```

## Verification Checklist

After migration, verify:

- [ ] Schema `audits` exists
- [ ] Table `audits.audit_logs` exists
- [ ] All 12 monthly partitions exist (2026-01 through 2026-12)
- [ ] RLS policies are active
- [ ] Indexes are created
- [ ] Trigger `audit_logs_immutable` exists
- [ ] Functions are in `audits` schema
- [ ] Application can write audit logs
- [ ] Admin dashboard can read audit logs

```sql
-- Quick verification query
SELECT 
  schemaname,
  tablename,
  hasindexes,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'audits';
```

## Rollback (if needed)

If something goes wrong:

```sql
-- 1. Restore from backup (if you created one)
DROP SCHEMA audits CASCADE;
-- Then restore public.audit_logs_backup

-- 2. Update code back to use public.audit_logs
-- Revert changes in:
-- - lib/audit/service.ts
-- - lib/supabase/queries/audit_logs.ts
```

## Testing

After migration, test:

1. **Create audit log:**
```bash
# Trigger any API that creates audit logs
# e.g., create a Kubernetes cluster, database, etc.
```

2. **View audit logs:**
```bash
# Visit: /dashboard/admin/audit-logs
# Should display logs without errors
```

3. **Test immutability:**
```sql
-- This should fail:
UPDATE audits.audit_logs SET action = 'test' WHERE id = '<some-id>';
-- Expected: ERROR: Audit logs are immutable
```

## Support

If you encounter issues:
1. Check Supabase logs
2. Verify schema permissions
3. Ensure RLS policies are correct
4. Check that service role has insert permissions
