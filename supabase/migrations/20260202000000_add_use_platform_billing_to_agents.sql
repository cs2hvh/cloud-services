-- Migration: Add use_platform_billing column to ai_agents
-- This column indicates whether the agent uses platform billing (OpenRouter with our key)
-- or uses the user's own API key via model_key_id

-- Add the use_platform_billing column
ALTER TABLE agents.ai_agents 
ADD COLUMN IF NOT EXISTS use_platform_billing BOOLEAN DEFAULT FALSE;
-- Add a comment explaining the column
COMMENT ON COLUMN agents.ai_agents.use_platform_billing IS 
'When true, the agent uses platform billing through OpenRouter. When false, uses the user''s own API key via model_key_id.';
-- Add check constraint: if use_platform_billing is false, model_key_id should be set
-- (This is a soft constraint - we allow null model_key_id for backwards compatibility)
-- The application logic will enforce this at the API level;
