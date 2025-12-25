-- Create table for storing Bitbucket OAuth access tokens
-- Bitbucket tokens expire after ~1 hour and require refresh
CREATE TABLE IF NOT EXISTS bitbucket_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT, -- Required for token refresh (tokens expire in ~1 hour)
    bitbucket_username TEXT NOT NULL,
    bitbucket_user_id TEXT NOT NULL, -- Bitbucket uses UUID strings like {uuid}
    scopes TEXT,
    expires_at TIMESTAMP WITH TIME ZONE, -- Bitbucket tokens expire (typically 1 hour)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE bitbucket_tokens ENABLE ROW LEVEL SECURITY;

-- Create policy so users can only access their own tokens
CREATE POLICY "Users can only access their own Bitbucket tokens" ON bitbucket_tokens
    FOR ALL USING (auth.uid() = user_id);

-- Create indexes for faster lookups
CREATE INDEX idx_bitbucket_tokens_user_id ON bitbucket_tokens(user_id);
CREATE INDEX idx_bitbucket_tokens_bitbucket_user_id ON bitbucket_tokens(bitbucket_user_id);

-- Add comment explaining the table
COMMENT ON TABLE bitbucket_tokens IS 'Stores Bitbucket OAuth tokens for repository access. Tokens expire in ~1 hour and require refresh using the refresh_token.';
COMMENT ON COLUMN bitbucket_tokens.refresh_token IS 'Used to refresh expired access tokens. Critical for maintaining long-term access.';
COMMENT ON COLUMN bitbucket_tokens.expires_at IS 'When the access_token expires. Bitbucket tokens typically expire in 1 hour (3600 seconds).';

-- ============================================
-- ROLLBACK COMMANDS (Run to remove this table)
-- ============================================
-- DROP INDEX IF EXISTS idx_bitbucket_tokens_user_id;
-- DROP INDEX IF EXISTS idx_bitbucket_tokens_bitbucket_user_id;
-- DROP POLICY IF EXISTS "Users can only access their own Bitbucket tokens" ON bitbucket_tokens;
-- DROP TABLE IF EXISTS bitbucket_tokens;
