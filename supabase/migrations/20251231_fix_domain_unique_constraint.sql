-- Fix UNIQUE constraint on platform_app_domains
-- Problem: UNIQUE(domain) prevents re-adding a domain that was previously removed (soft-deleted)
-- Solution: Use a partial unique index that only applies to non-removed domains

-- Drop the existing unique constraint
ALTER TABLE platform_app_domains DROP CONSTRAINT IF EXISTS platform_app_domains_domain_key;

-- Create a partial unique index that excludes 'removed' status
-- This allows the same domain to be added again after it's been removed
CREATE UNIQUE INDEX IF NOT EXISTS platform_app_domains_domain_active_unique 
ON platform_app_domains (domain) 
WHERE status != 'removed';

-- Add an index on status for faster queries filtering by status
CREATE INDEX IF NOT EXISTS platform_app_domains_status_idx 
ON platform_app_domains (status);

-- Add comment explaining the constraint
COMMENT ON INDEX platform_app_domains_domain_active_unique IS 
'Ensures each domain can only be active once, but allows re-adding after removal';
