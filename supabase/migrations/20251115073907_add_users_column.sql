-- Migration: Add users column to database_cluster table
-- Date: 2025-10-24
-- Purpose: Store database users in the database_clusters table

-- Add users column as JSONB array
ALTER TABLE database_cluster 
ADD COLUMN IF NOT EXISTS users JSONB DEFAULT '[]'::jsonb;
-- Add a comment to document the column
COMMENT ON COLUMN database_cluster.users IS 'Array of database users with their credentials and roles';
-- Optional: Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_database_cluster_users 
ON database_cluster USING GIN (users);
-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'database_cluster' AND column_name = 'users';
