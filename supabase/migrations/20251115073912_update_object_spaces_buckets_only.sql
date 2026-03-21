-- Migration: Update object_spaces table to only support buckets
-- Remove access_key type and related fields
-- Created: 2025-01-04 (Updated)

-- Drop existing constraints
ALTER TABLE IF EXISTS object_spaces DROP CONSTRAINT IF EXISTS valid_access_key;
ALTER TABLE IF EXISTS object_spaces DROP CONSTRAINT IF EXISTS valid_bucket;
ALTER TABLE IF EXISTS object_spaces DROP CONSTRAINT IF EXISTS unique_key_id;
-- Drop access_key related columns
ALTER TABLE IF EXISTS object_spaces DROP COLUMN IF EXISTS key_id;
ALTER TABLE IF EXISTS object_spaces DROP COLUMN IF EXISTS secret_key;
ALTER TABLE IF EXISTS object_spaces DROP COLUMN IF EXISTS parent_access_key_id;
-- Update type constraint to only allow 'bucket'
ALTER TABLE IF EXISTS object_spaces DROP CONSTRAINT IF EXISTS object_spaces_type_check;
ALTER TABLE IF EXISTS object_spaces ADD CONSTRAINT object_spaces_type_check CHECK (type = 'bucket');
-- Update bucket_id to be required
ALTER TABLE IF EXISTS object_spaces ALTER COLUMN bucket_id SET NOT NULL;
ALTER TABLE IF EXISTS object_spaces ALTER COLUMN endpoint SET NOT NULL;
ALTER TABLE IF EXISTS object_spaces ALTER COLUMN acl SET NOT NULL;
ALTER TABLE IF EXISTS object_spaces ALTER COLUMN acl SET DEFAULT 'private';
-- Update valid_bucket constraint
ALTER TABLE IF EXISTS object_spaces ADD CONSTRAINT valid_bucket CHECK (
  bucket_id IS NOT NULL 
  AND endpoint IS NOT NULL
  AND acl IS NOT NULL
);
-- Drop index on parent_access_key_id since it no longer exists
DROP INDEX IF EXISTS idx_object_spaces_parent_key;
-- Comment for clarity
COMMENT ON TABLE object_spaces IS 'Stores DigitalOcean Spaces buckets. Access keys are managed via environment variables.';
