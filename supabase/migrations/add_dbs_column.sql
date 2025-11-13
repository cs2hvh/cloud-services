-- Migration: Add dbs column to database_cluster table
-- Date: 2025-10-24
-- Purpose: Store databases in the database_cluster table

-- Add dbs column as JSONB array
ALTER TABLE database_cluster 
ADD COLUMN IF NOT EXISTS dbs JSONB DEFAULT '[]'::jsonb;

-- Add comment to describe the column
COMMENT ON COLUMN database_cluster.dbs IS 'Array of databases with their metadata';

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_database_cluster_dbs 
ON database_cluster USING GIN (dbs);

-- Verify the column was added successfully
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: dbs column added to database_cluster table';
END $$;
