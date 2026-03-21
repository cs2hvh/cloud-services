-- Create api_keys table for Personal Access Tokens (PATs)
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 100),
  key_prefix TEXT NOT NULL, -- First 15 chars + "..." for display (e.g. "sk_live_abc1234...")
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash (64 hex chars) of the full key
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- NULL = never expires
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used ON public.api_keys(last_used_at) WHERE last_used_at IS NOT NULL;
-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Trigger to update updated_at on row modification
CREATE TRIGGER api_keys_updated_at_trigger
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_api_keys_updated_at();
-- RLS Policies
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
-- Users can only see their own keys
CREATE POLICY "Users can view own API keys"
  ON public.api_keys FOR SELECT
  USING (auth.uid() = user_id);
-- Users can create their own keys
CREATE POLICY "Users can create own API keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);
-- Users can delete their own keys
CREATE POLICY "Users can delete own API keys"
  ON public.api_keys FOR DELETE
  USING (auth.uid() = user_id);
-- Users can update their own keys (last_used_at)
CREATE POLICY "Users can update own API keys"
  ON public.api_keys FOR UPDATE
  USING (auth.uid() = user_id);
-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT SELECT, UPDATE ON public.api_keys TO service_role;
COMMENT ON TABLE public.api_keys IS 'Personal Access Tokens (PATs) for API authentication. Max 10 keys per user (enforced in application layer).';
COMMENT ON COLUMN public.api_keys.name IS 'User-defined name for the key (3-100 chars): "Production CI", "Dev Server"';
COMMENT ON COLUMN public.api_keys.key_prefix IS 'Display prefix (15 chars + "..."): "sk_live_xyz1234..."';
COMMENT ON COLUMN public.api_keys.key_hash IS 'SHA-256 one-way hash (64 hex chars) of the full key for authentication';
COMMENT ON COLUMN public.api_keys.plan IS 'Rate limit tier: free (30/min), pro (100/min), enterprise (500/min)';
COMMENT ON COLUMN public.api_keys.last_used_at IS 'Timestamp of last successful authentication (updated async)';
COMMENT ON COLUMN public.api_keys.expires_at IS 'Optional expiration date. NULL means never expires.';
