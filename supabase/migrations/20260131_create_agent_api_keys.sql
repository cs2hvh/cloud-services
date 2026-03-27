-- ============================================================
-- Agent API Keys Migration
-- Creates table for API keys used to authenticate agent endpoints
-- ============================================================

-- ============================================================
-- AGENT API KEYS TABLE
-- Stores API keys for authenticating agent endpoint requests
-- ============================================================

CREATE TABLE agents.agent_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Key info
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL, -- SHA256 hash of the API key (we don't store the raw key)
    key_prefix TEXT NOT NULL, -- First 8 chars for display (e.g., "ak_xxxx...")
    
    -- Scope
    agent_id UUID REFERENCES agents.ai_agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- If agent_id is NULL, key works for ALL agents owned by user
    -- If agent_id is set, key only works for that specific agent
    
    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    request_count BIGINT DEFAULT 0,
    
    -- Validity
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ, -- NULL means no expiration
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(key_hash)
);
-- Index for quick key lookup
CREATE INDEX agent_api_keys_hash_idx ON agents.agent_api_keys(key_hash) WHERE is_active = TRUE;
CREATE INDEX agent_api_keys_user_idx ON agents.agent_api_keys(user_id);
CREATE INDEX agent_api_keys_agent_idx ON agents.agent_api_keys(agent_id) WHERE agent_id IS NOT NULL;
-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================

-- Grant table permissions to roles
GRANT ALL ON agents.agent_api_keys TO service_role;
GRANT ALL ON agents.agent_api_keys TO authenticated;
GRANT USAGE ON SCHEMA agents TO service_role;
GRANT USAGE ON SCHEMA agents TO authenticated;
-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE agents.agent_api_keys ENABLE ROW LEVEL SECURITY;
-- Allow service role to bypass RLS (for API operations)
CREATE POLICY agent_api_keys_service_all ON agents.agent_api_keys
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
-- Users can only see their own API keys
CREATE POLICY agent_api_keys_select_policy ON agents.agent_api_keys
    FOR SELECT 
    TO authenticated
    USING (auth.uid() = user_id);
-- Users can only insert their own API keys
CREATE POLICY agent_api_keys_insert_policy ON agents.agent_api_keys
    FOR INSERT 
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
-- Users can only update their own API keys
CREATE POLICY agent_api_keys_update_policy ON agents.agent_api_keys
    FOR UPDATE 
    TO authenticated
    USING (auth.uid() = user_id);
-- Users can only delete their own API keys
CREATE POLICY agent_api_keys_delete_policy ON agents.agent_api_keys
    FOR DELETE 
    TO authenticated
    USING (auth.uid() = user_id);
-- ============================================================
-- HELPER FUNCTION: INCREMENT API KEY USAGE
-- ============================================================

-- Internal function in agents schema
CREATE OR REPLACE FUNCTION agents.increment_api_key_usage(p_key_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE agents.agent_api_keys
    SET 
        request_count = request_count + 1,
        last_used_at = NOW()
    WHERE id = p_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Public wrapper for RPC access
CREATE OR REPLACE FUNCTION public.increment_api_key_usage(p_key_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM agents.increment_api_key_usage(p_key_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed AI agent product plans after the enum value is committed in a prior migration.
DO $$
BEGIN
    IF to_regclass('public.products') IS NULL OR to_regtype('public.product_type') IS NULL THEN
        RAISE NOTICE 'Skipping AI agent product seed: products table or product_type enum missing.';
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname = 'public'
          AND t.typname = 'product_type'
          AND e.enumlabel = 'ai-agent'
    ) THEN
        RAISE NOTICE 'Skipping AI agent product seed: enum value ai-agent missing.';
        RETURN;
    END IF;

    INSERT INTO public.products (name, description, type, sub, resources, price, fixed_price, slug)
    VALUES
        (
            'AI Agent - Basic',
            'Basic AI agent with 100K tokens/month',
            'ai-agent'::public.product_type,
            'basic',
            '{"tokens_per_month": 100000, "max_agents": 3, "max_knowledge_bases": 2, "max_documents_per_kb": 50}',
            5.00,
            0,
            'ai-agent-basic'
        ),
        (
            'AI Agent - Pro',
            'Pro AI agent with 500K tokens/month',
            'ai-agent'::public.product_type,
            'pro',
            '{"tokens_per_month": 500000, "max_agents": 10, "max_knowledge_bases": 10, "max_documents_per_kb": 200}',
            19.00,
            0,
            'ai-agent-pro'
        ),
        (
            'AI Agent - Enterprise',
            'Enterprise AI agent with unlimited tokens',
            'ai-agent'::public.product_type,
            'enterprise',
            '{"tokens_per_month": -1, "max_agents": -1, "max_knowledge_bases": -1, "max_documents_per_kb": -1}',
            99.00,
            0,
            'ai-agent-enterprise'
        )
    ON CONFLICT DO NOTHING;
END $$;
