-- Create table for storing GitHub access tokens
CREATE TABLE github_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    github_username TEXT NOT NULL,
    github_user_id BIGINT NOT NULL,
    scopes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE github_tokens ENABLE ROW LEVEL SECURITY;

-- Create policy so users can only access their own tokens
CREATE POLICY "Users can only access their own GitHub tokens" ON github_tokens
    FOR ALL USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_github_tokens_user_id ON github_tokens(user_id);
CREATE INDEX idx_github_tokens_github_user_id ON github_tokens(github_user_id);
