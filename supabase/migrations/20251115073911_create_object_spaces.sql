-- Migration: Create unified object_spaces table for access keys and buckets
-- Created: 2025-01-04

-- Create the unified object_spaces table
CREATE TABLE IF NOT EXISTS object_spaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Common fields
  type TEXT NOT NULL CHECK (type IN ('access_key', 'bucket')),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'creating', 'deleting', 'revoked', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Access Key specific fields (NULL for buckets)
  key_id TEXT,                           -- DO Spaces Key ID
  secret_key TEXT,                       -- Encrypted secret key
  
  -- Bucket specific fields (NULL for access keys)
  bucket_id TEXT,                        -- DO Spaces Bucket Name (unique identifier)
  parent_access_key_id UUID REFERENCES object_spaces(id) ON DELETE CASCADE,
  endpoint TEXT,                         -- Full bucket endpoint URL
  acl TEXT DEFAULT 'private' CHECK (acl IN ('private', 'public-read') OR acl IS NULL),
  cors_enabled BOOLEAN DEFAULT false,
  versioning_enabled BOOLEAN DEFAULT false,
  size_bytes BIGINT DEFAULT 0,
  object_count INTEGER DEFAULT 0,
  
  -- Ensure key_id is unique when not null
  CONSTRAINT unique_key_id UNIQUE (key_id),
  
  -- Ensure bucket_id is unique when not null
  CONSTRAINT unique_bucket_id UNIQUE (bucket_id),
  
  -- Validate access key has required fields
  CONSTRAINT valid_access_key CHECK (
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
  ),
  
  -- Validate bucket has required fields
  CONSTRAINT valid_bucket CHECK (
    type != 'bucket' OR (
      bucket_id IS NOT NULL 
      AND parent_access_key_id IS NOT NULL
      AND endpoint IS NOT NULL
      AND acl IS NOT NULL
      AND key_id IS NULL 
      AND secret_key IS NULL
    )
  )
);

-- Table may already exist from an earlier shape; backfill expected column for replay safety.
ALTER TABLE object_spaces
  ADD COLUMN IF NOT EXISTS parent_access_key_id UUID REFERENCES object_spaces(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_object_spaces_type ON object_spaces(type);
CREATE INDEX IF NOT EXISTS idx_object_spaces_owner_id ON object_spaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_object_spaces_parent_key ON object_spaces(parent_access_key_id);
CREATE INDEX IF NOT EXISTS idx_object_spaces_project_id ON object_spaces(project_id);
CREATE INDEX IF NOT EXISTS idx_object_spaces_status ON object_spaces(status);
CREATE INDEX IF NOT EXISTS idx_object_spaces_type_owner ON object_spaces(type, owner_id);
-- Enable Row Level Security
ALTER TABLE object_spaces ENABLE ROW LEVEL SECURITY;
-- RLS Policies
DO $$ BEGIN CREATE POLICY "Users can view their own object spaces" ON object_spaces FOR SELECT USING (auth.uid() = owner_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create their own object spaces" ON object_spaces FOR INSERT WITH CHECK (auth.uid() = owner_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update their own object spaces" ON object_spaces FOR UPDATE USING (auth.uid() = owner_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete their own object spaces" ON object_spaces FOR DELETE USING (auth.uid() = owner_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_object_spaces_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_object_spaces_updated_at ON object_spaces;
CREATE TRIGGER trigger_update_object_spaces_updated_at
  BEFORE UPDATE ON object_spaces
  FOR EACH ROW
  EXECUTE FUNCTION update_object_spaces_updated_at();
-- Add comment to table
COMMENT ON TABLE object_spaces IS 'Unified table for DigitalOcean Spaces access keys and buckets';
COMMENT ON COLUMN object_spaces.type IS 'Type of object space: access_key or bucket';
COMMENT ON COLUMN object_spaces.key_id IS 'DigitalOcean Spaces access key ID (for access_key type only)';
COMMENT ON COLUMN object_spaces.secret_key IS 'Encrypted secret key (for access_key type only)';
COMMENT ON COLUMN object_spaces.bucket_id IS 'Bucket name/identifier (for bucket type only)';
COMMENT ON COLUMN object_spaces.parent_access_key_id IS 'Reference to parent access key (for bucket type only)';
