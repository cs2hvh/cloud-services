-- Add auth_source column to track where OAuth tokens came from
-- This is critical for knowing how to refresh them:
-- - 'direct': Token from direct OAuth flow (/api/gitlab/callback) - we can refresh with our credentials
-- - 'supabase': Token from Supabase Auth flow (/api/auth/callback) - only Supabase can refresh

-- Add auth_source to gitlab_tokens
ALTER TABLE IF EXISTS gitlab_tokens 
ADD COLUMN IF NOT EXISTS auth_source TEXT DEFAULT 'direct';
-- Add auth_source to bitbucket_tokens
ALTER TABLE IF EXISTS bitbucket_tokens 
ADD COLUMN IF NOT EXISTS auth_source TEXT DEFAULT 'direct';
-- Update existing tokens - assume they're from the direct flow if we don't know
-- (This is a safe assumption for existing deployments)
DO $$
BEGIN
  IF to_regclass('public.gitlab_tokens') IS NOT NULL THEN
    UPDATE gitlab_tokens SET auth_source = 'direct' WHERE auth_source IS NULL;
    COMMENT ON COLUMN gitlab_tokens.auth_source IS 'Source of OAuth token: direct (our OAuth app) or supabase (Supabase Auth). Only direct tokens can be refreshed with our credentials.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.bitbucket_tokens') IS NOT NULL THEN
    UPDATE bitbucket_tokens SET auth_source = 'direct' WHERE auth_source IS NULL;
    COMMENT ON COLUMN bitbucket_tokens.auth_source IS 'Source of OAuth token: direct (our OAuth app) or supabase (Supabase Auth). Only direct tokens can be refreshed with our credentials.';
  END IF;
END $$;
