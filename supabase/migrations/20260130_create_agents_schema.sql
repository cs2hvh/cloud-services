-- ============================================================
-- AI Agents Schema Migration
-- Creates the 'agents' schema with all required tables for
-- AI agent management, knowledge bases, and chat functionality
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Create agents schema
CREATE SCHEMA IF NOT EXISTS agents;
-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE agents.agent_status AS ENUM ('active', 'paused', 'deleted');
CREATE TYPE agents.kb_status AS ENUM ('pending', 'indexing', 'ready', 'error');
CREATE TYPE agents.document_status AS ENUM ('pending', 'processing', 'indexed', 'error');
CREATE TYPE agents.model_provider AS ENUM ('openrouter', 'openai', 'anthropic', 'custom');
-- ============================================================
-- MODEL KEYS TABLE
-- Stores encrypted API keys for LLM providers
-- ============================================================

CREATE TABLE agents.model_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    provider agents.model_provider NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    
    -- Ownership
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Validation
    is_valid BOOLEAN DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, name)
);
-- ============================================================
-- KNOWLEDGE BASES TABLE
-- Stores knowledge base configurations
-- ============================================================

CREATE TABLE agents.knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    
    -- Embedding configuration
    embedding_model TEXT DEFAULT 'text-embedding-3-small',
    chunk_size INTEGER DEFAULT 1000,
    chunk_overlap INTEGER DEFAULT 200,
    
    -- Statistics
    document_count INTEGER DEFAULT 0,
    chunk_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    
    -- Processing status
    status agents.kb_status DEFAULT 'pending',
    last_indexed_at TIMESTAMPTZ,
    error_message TEXT,
    
    -- Ownership
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- ============================================================
-- KNOWLEDGE BASE DOCUMENTS TABLE
-- Stores source documents (files, URLs, text)
-- ============================================================

CREATE TABLE agents.kb_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_base_id UUID NOT NULL REFERENCES agents.knowledge_bases(id) ON DELETE CASCADE,
    
    -- Document info
    name TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('file', 'url', 'text')),
    source_url TEXT,
    content_type TEXT,
    file_size INTEGER,
    
    -- Raw content (for text type or cached content)
    raw_content TEXT,
    
    -- Processing
    status agents.document_status DEFAULT 'pending',
    error_message TEXT,
    chunk_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- ============================================================
-- KNOWLEDGE BASE CHUNKS TABLE
-- Stores text chunks with vector embeddings
-- ============================================================

CREATE TABLE agents.kb_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_base_id UUID NOT NULL REFERENCES agents.knowledge_bases(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES agents.kb_documents(id) ON DELETE CASCADE,
    
    -- Chunk content
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI text-embedding-3-small dimension
    
    -- Metadata
    chunk_index INTEGER NOT NULL,
    token_count INTEGER,
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Create vector similarity search index
CREATE INDEX kb_chunks_embedding_idx ON agents.kb_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- ============================================================
-- AI AGENTS TABLE
-- Main table for AI agent configurations
-- ============================================================

CREATE TABLE agents.ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic info
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    
    -- Agent configuration
    system_prompt TEXT NOT NULL,
    welcome_message TEXT,
    
    -- Model configuration
    model_id TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    model_key_id UUID REFERENCES agents.model_keys(id) ON DELETE SET NULL,
    
    -- Model parameters
    temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
    max_tokens INTEGER DEFAULT 4096 CHECK (max_tokens > 0 AND max_tokens <= 128000),
    top_p DECIMAL(3,2) DEFAULT 1.0 CHECK (top_p >= 0 AND top_p <= 1),
    frequency_penalty DECIMAL(3,2) DEFAULT 0 CHECK (frequency_penalty >= -2 AND frequency_penalty <= 2),
    presence_penalty DECIMAL(3,2) DEFAULT 0 CHECK (presence_penalty >= -2 AND presence_penalty <= 2),
    
    -- RAG configuration
    knowledge_base_ids UUID[] DEFAULT '{}',
    rag_enabled BOOLEAN DEFAULT FALSE,
    similarity_threshold DECIMAL(3,2) DEFAULT 0.7 CHECK (similarity_threshold >= 0 AND similarity_threshold <= 1),
    max_context_chunks INTEGER DEFAULT 5 CHECK (max_context_chunks > 0 AND max_context_chunks <= 20),
    
    -- Deployment settings
    endpoint_id TEXT UNIQUE NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    require_auth BOOLEAN DEFAULT TRUE,
    allowed_origins TEXT[] DEFAULT '{}',
    rate_limit_rpm INTEGER DEFAULT 60 CHECK (rate_limit_rpm > 0),
    
    -- Ownership
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    
    -- Status
    status agents.agent_status DEFAULT 'active',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Index for endpoint lookups
CREATE UNIQUE INDEX ai_agents_endpoint_idx ON agents.ai_agents(endpoint_id);
-- ============================================================
-- CONVERSATIONS TABLE
-- Stores chat sessions
-- ============================================================

CREATE TABLE agents.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents.ai_agents(id) ON DELETE CASCADE,
    
    -- Session info
    title TEXT,
    session_id TEXT, -- External session identifier
    
    -- User (can be authenticated or anonymous)
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    external_user_id TEXT,
    
    -- Stats
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Index for user lookups
CREATE INDEX conversations_user_idx ON agents.conversations(user_id);
CREATE INDEX conversations_agent_idx ON agents.conversations(agent_id);
CREATE INDEX conversations_session_idx ON agents.conversations(session_id);
-- ============================================================
-- MESSAGES TABLE
-- Stores individual chat messages
-- ============================================================

CREATE TABLE agents.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES agents.conversations(id) ON DELETE CASCADE,
    
    -- Message content
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    
    -- Token tracking
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    
    -- RAG context (if used)
    context_chunks JSONB DEFAULT '[]',
    
    -- Model info
    model_used TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Index for conversation lookups
CREATE INDEX messages_conversation_idx ON agents.messages(conversation_id);
-- ============================================================
-- USAGE TRACKING TABLE
-- Tracks daily usage per agent
-- ============================================================

CREATE TABLE agents.usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents.ai_agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Date (for daily aggregation)
    date DATE DEFAULT CURRENT_DATE,
    
    -- Metrics
    request_count INTEGER DEFAULT 0,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    
    -- Cost tracking (in USD)
    estimated_cost DECIMAL(10,6) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(agent_id, date)
);
-- Index for date-based queries
CREATE INDEX usage_date_idx ON agents.usage(date);
CREATE INDEX usage_user_idx ON agents.usage(user_id);
-- ============================================================
-- VECTOR SEARCH FUNCTION
-- Performs semantic similarity search on knowledge base chunks
-- ============================================================

CREATE OR REPLACE FUNCTION agents.search_chunks(
    query_embedding vector(1536),
    kb_ids UUID[],
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    knowledge_base_id UUID,
    document_id UUID,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.knowledge_base_id,
        c.document_id,
        c.content,
        c.metadata,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM agents.kb_chunks c
    WHERE c.knowledge_base_id = ANY(kb_ids)
        AND 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Generate unique endpoint ID
CREATE OR REPLACE FUNCTION agents.generate_endpoint_id()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result TEXT := '';
    i INT;
BEGIN
    FOR i IN 1..12 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;
-- Update usage statistics
CREATE OR REPLACE FUNCTION agents.update_usage(
    p_agent_id UUID,
    p_user_id UUID,
    p_prompt_tokens INT,
    p_completion_tokens INT,
    p_cost DECIMAL(10,6)
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO agents.usage (agent_id, user_id, date, request_count, prompt_tokens, completion_tokens, total_tokens, estimated_cost)
    VALUES (p_agent_id, p_user_id, CURRENT_DATE, 1, p_prompt_tokens, p_completion_tokens, p_prompt_tokens + p_completion_tokens, p_cost)
    ON CONFLICT (agent_id, date) DO UPDATE SET
        request_count = agents.usage.request_count + 1,
        prompt_tokens = agents.usage.prompt_tokens + EXCLUDED.prompt_tokens,
        completion_tokens = agents.usage.completion_tokens + EXCLUDED.completion_tokens,
        total_tokens = agents.usage.total_tokens + EXCLUDED.total_tokens,
        estimated_cost = agents.usage.estimated_cost + EXCLUDED.estimated_cost,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE agents.model_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.usage ENABLE ROW LEVEL SECURITY;
-- Model Keys policies
CREATE POLICY "Users can view own model keys"
    ON agents.model_keys FOR SELECT
    USING (auth.uid() = user_id);
CREATE POLICY "Users can create own model keys"
    ON agents.model_keys FOR INSERT
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own model keys"
    ON agents.model_keys FOR UPDATE
    USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own model keys"
    ON agents.model_keys FOR DELETE
    USING (auth.uid() = user_id);
-- Knowledge Bases policies
CREATE POLICY "Users can view own knowledge bases"
    ON agents.knowledge_bases FOR SELECT
    USING (auth.uid() = user_id);
CREATE POLICY "Users can create own knowledge bases"
    ON agents.knowledge_bases FOR INSERT
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own knowledge bases"
    ON agents.knowledge_bases FOR UPDATE
    USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own knowledge bases"
    ON agents.knowledge_bases FOR DELETE
    USING (auth.uid() = user_id);
-- KB Documents policies
CREATE POLICY "Users can view own kb documents"
    ON agents.kb_documents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM agents.knowledge_bases kb
            WHERE kb.id = knowledge_base_id AND kb.user_id = auth.uid()
        )
    );
CREATE POLICY "Users can create own kb documents"
    ON agents.kb_documents FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM agents.knowledge_bases kb
            WHERE kb.id = knowledge_base_id AND kb.user_id = auth.uid()
        )
    );
CREATE POLICY "Users can delete own kb documents"
    ON agents.kb_documents FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM agents.knowledge_bases kb
            WHERE kb.id = knowledge_base_id AND kb.user_id = auth.uid()
        )
    );
-- KB Chunks policies (read-only for users, system manages chunks)
CREATE POLICY "Users can view own kb chunks"
    ON agents.kb_chunks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM agents.knowledge_bases kb
            WHERE kb.id = knowledge_base_id AND kb.user_id = auth.uid()
        )
    );
-- AI Agents policies
CREATE POLICY "Users can view own agents"
    ON agents.ai_agents FOR SELECT
    USING (auth.uid() = user_id);
CREATE POLICY "Users can create own agents"
    ON agents.ai_agents FOR INSERT
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agents"
    ON agents.ai_agents FOR UPDATE
    USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agents"
    ON agents.ai_agents FOR DELETE
    USING (auth.uid() = user_id);
-- Conversations policies
CREATE POLICY "Users can view own conversations"
    ON agents.conversations FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM agents.ai_agents a
            WHERE a.id = agent_id AND a.user_id = auth.uid()
        )
    );
CREATE POLICY "Users can create conversations"
    ON agents.conversations FOR INSERT
    WITH CHECK (TRUE);
-- Allow API access

CREATE POLICY "Users can update own conversations"
    ON agents.conversations FOR UPDATE
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM agents.ai_agents a
            WHERE a.id = agent_id AND a.user_id = auth.uid()
        )
    );
-- Messages policies
CREATE POLICY "Users can view messages from own conversations"
    ON agents.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM agents.conversations c
            WHERE c.id = conversation_id
            AND (c.user_id = auth.uid() OR EXISTS (
                SELECT 1 FROM agents.ai_agents a
                WHERE a.id = c.agent_id AND a.user_id = auth.uid()
            ))
        )
    );
CREATE POLICY "Users can create messages in conversations"
    ON agents.messages FOR INSERT
    WITH CHECK (TRUE);
-- Allow API access

-- Usage policies
CREATE POLICY "Users can view own usage"
    ON agents.usage FOR SELECT
    USING (auth.uid() = user_id);
-- ============================================================
-- SERVICE ROLE ACCESS (for API operations)
-- ============================================================

-- Grant schema access to service role
GRANT USAGE ON SCHEMA agents TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA agents TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA agents TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA agents TO service_role;
-- Grant access to authenticated users
GRANT USAGE ON SCHEMA agents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agents TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA agents TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA agents TO authenticated;
-- ============================================================
-- TRIGGERS
-- ============================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION agents.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER update_model_keys_updated_at
    BEFORE UPDATE ON agents.model_keys
    FOR EACH ROW EXECUTE FUNCTION agents.update_updated_at();
CREATE TRIGGER update_knowledge_bases_updated_at
    BEFORE UPDATE ON agents.knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION agents.update_updated_at();
CREATE TRIGGER update_kb_documents_updated_at
    BEFORE UPDATE ON agents.kb_documents
    FOR EACH ROW EXECUTE FUNCTION agents.update_updated_at();
CREATE TRIGGER update_ai_agents_updated_at
    BEFORE UPDATE ON agents.ai_agents
    FOR EACH ROW EXECUTE FUNCTION agents.update_updated_at();
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON agents.conversations
    FOR EACH ROW EXECUTE FUNCTION agents.update_updated_at();
CREATE TRIGGER update_usage_updated_at
    BEFORE UPDATE ON agents.usage
    FOR EACH ROW EXECUTE FUNCTION agents.update_updated_at();
-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX idx_ai_agents_user_id ON agents.ai_agents(user_id);
CREATE INDEX idx_ai_agents_project_id ON agents.ai_agents(project_id);
CREATE INDEX idx_ai_agents_status ON agents.ai_agents(status);
CREATE INDEX idx_knowledge_bases_user_id ON agents.knowledge_bases(user_id);
CREATE INDEX idx_knowledge_bases_status ON agents.knowledge_bases(status);
CREATE INDEX idx_kb_documents_kb_id ON agents.kb_documents(knowledge_base_id);
CREATE INDEX idx_kb_documents_status ON agents.kb_documents(status);
CREATE INDEX idx_kb_chunks_kb_id ON agents.kb_chunks(knowledge_base_id);
CREATE INDEX idx_kb_chunks_doc_id ON agents.kb_chunks(document_id);
-- Full text search index on chunk content
CREATE INDEX idx_kb_chunks_content_fts ON agents.kb_chunks 
USING gin(to_tsvector('english', content));
-- ============================================================
-- PRODUCTS FOR BILLING
-- ============================================================

DO $$
BEGIN
  IF to_regtype('public.product_type') IS NOT NULL THEN
    ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'ai-agent';
  END IF;
END $$;

-- NOTE:
-- Seeding products is intentionally deferred to the next migration.
-- PostgreSQL can reject using a newly added enum value in the same transaction
-- (`SQLSTATE 55P04`), which breaks shadow-db replay during `supabase db pull`.
COMMENT ON SCHEMA agents IS 'AI Agents platform schema - stores agents, knowledge bases, conversations, and usage data';
