-- Add refresh token and expiration fields to github_tokens table
ALTER TABLE github_tokens 
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Add index for expires_at for faster queries
CREATE INDEX IF NOT EXISTS idx_github_tokens_expires_at ON github_tokens(expires_at);