-- Migration: Update object_spaces to allow buckets to store access keys
-- Created: 2025-11-06
-- Description: Modify constraints to allow buckets to optionally store encrypted access_key and secret_key

-- Drop the existing constraints
ALTER TABLE object_spaces DROP CONSTRAINT IF EXISTS valid_access_key;
ALTER TABLE object_spaces DROP CONSTRAINT IF EXISTS valid_bucket;

-- Add new constraints that allow buckets to have access keys
ALTER TABLE object_spaces ADD CONSTRAINT valid_access_key CHECK (
  type != 'access_key' OR (
    key_id IS NOT NULL 
    AND secret_key IS NOT NULL
    AND bucket_id IS NULL 
    AND parent_access_key_id IS NULL
    AND endpoint IS NULL
    AND acl IS NULL
    AND size_bytes = 0
    AND object_count = 0
  )
);

-- Updated constraint: Buckets can now have access_key and secret_key fields
-- parent_access_key_id is now optional since keys are stored directly
ALTER TABLE object_spaces ADD CONSTRAINT valid_bucket CHECK (
  type != 'bucket' OR (
    bucket_id IS NOT NULL 
    AND endpoint IS NOT NULL
    AND acl IS NOT NULL
    -- key_id and secret_key are now optional for buckets
    -- parent_access_key_id is now optional
  )
);

-- Add comments
COMMENT ON COLUMN object_spaces.key_id IS 'Access key ID - for access_key type, or optionally stored with bucket type';
COMMENT ON COLUMN object_spaces.secret_key IS 'Encrypted secret key - for access_key type, or optionally stored with bucket type';
COMMENT ON COLUMN object_spaces.parent_access_key_id IS 'Reference to parent access key (optional for bucket type if storing keys directly)';
