-- Rollback migration for platform_apps tables
-- Run this ONLY if you want to undo the platform_apps creation

-- Drop policies first
DROP POLICY IF EXISTS "Users can manage env vars for their platform apps" ON platform_app_env_vars;
DROP POLICY IF EXISTS "Users can delete their own platform apps" ON platform_apps;
DROP POLICY IF EXISTS "Users can update their own platform apps" ON platform_apps;
DROP POLICY IF EXISTS "Users can create platform apps" ON platform_apps;
DROP POLICY IF EXISTS "Users can view their own platform apps" ON platform_apps;

-- Drop triggers
DROP TRIGGER IF EXISTS update_platform_apps_updated_at ON platform_apps;

-- Drop indexes
DROP INDEX IF EXISTS idx_platform_app_env_vars_app;
DROP INDEX IF EXISTS idx_platform_apps_status;
DROP INDEX IF EXISTS idx_platform_apps_slug;
DROP INDEX IF EXISTS idx_platform_apps_project;
DROP INDEX IF EXISTS idx_platform_apps_user;

-- Drop tables (env_vars first due to foreign key)
DROP TABLE IF EXISTS platform_app_env_vars;
DROP TABLE IF EXISTS platform_apps;
