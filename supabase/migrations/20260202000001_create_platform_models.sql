-- ============================================================
-- Platform AI Models (OpenRouter)
-- Dynamic models available for AI Agents when using platform billing
-- ============================================================

-- Table for platform-provided AI models
CREATE TABLE IF NOT EXISTS agents.platform_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Model identification
  model_id TEXT NOT NULL UNIQUE,           -- e.g., "openai/gpt-5-nano"
  display_name TEXT NOT NULL,              -- e.g., "GPT-5 Nano"
  provider TEXT NOT NULL,                  -- e.g., "openai", "anthropic", "google"
  description TEXT,                        -- Model description
  
  -- Pricing (per million tokens)
  input_cost_per_million DECIMAL(10, 4) NOT NULL,   -- Cost per 1M input tokens
  output_cost_per_million DECIMAL(10, 4) NOT NULL,  -- Cost per 1M output tokens
  
  -- Model capabilities
  context_window INTEGER DEFAULT 128000,   -- Context window size
  supports_vision BOOLEAN DEFAULT false,
  supports_function_calling BOOLEAN DEFAULT false,
  supports_streaming BOOLEAN DEFAULT true,
  
  -- Status
  is_active BOOLEAN DEFAULT true,          -- Whether model is available for selection
  is_free BOOLEAN DEFAULT false,           -- Free tier model
  sort_order INTEGER DEFAULT 100,          -- Display order in UI
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Indexes
CREATE INDEX idx_platform_models_provider ON agents.platform_models(provider);
CREATE INDEX idx_platform_models_active ON agents.platform_models(is_active);
CREATE INDEX idx_platform_models_sort ON agents.platform_models(sort_order);
-- Enable RLS
ALTER TABLE agents.platform_models ENABLE ROW LEVEL SECURITY;
-- Policies: Anyone can read active models, only admins can modify
CREATE POLICY "Anyone can view active platform models"
  ON agents.platform_models FOR SELECT
  USING (is_active = true);
CREATE POLICY "Service role can manage platform models"
  ON agents.platform_models FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
-- Grant permissions
GRANT SELECT ON agents.platform_models TO authenticated;
GRANT ALL ON agents.platform_models TO service_role;
-- Updated at trigger
CREATE TRIGGER update_platform_models_updated_at
  BEFORE UPDATE ON agents.platform_models
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
-- ============================================================
-- Insert default OpenRouter models
-- ============================================================

INSERT INTO agents.platform_models (
  model_id,
  display_name,
  provider,
  description,
  input_cost_per_million,
  output_cost_per_million,
  context_window,
  supports_vision,
  supports_function_calling,
  supports_streaming,
  is_free,
  sort_order
) VALUES
  -- OpenAI Models
  (
    'openai/gpt-5-nano',
    'GPT-5 Nano',
    'openai',
    'Fastest and most affordable GPT-5 variant. Great for simple tasks.',
    0.05,
    0.40,
    128000,
    false,
    true,
    true,
    false,
    10
  ),
  (
    'openai/gpt-5.2',
    'GPT-5.2',
    'openai',
    'Most capable GPT model. Best for complex reasoning and coding.',
    1.75,
    14.00,
    128000,
    true,
    true,
    true,
    false,
    20
  ),
  (
    'openai/gpt-oss-120b:free',
    'GPT OSS 120B (Free)',
    'openai',
    'Open-source GPT variant. Free tier with rate limits.',
    0.039,
    0.19,
    32000,
    false,
    false,
    true,
    true,
    5
  ),
  
  -- Anthropic Models
  (
    'anthropic/claude-sonnet-4.5',
    'Claude Sonnet 4.5',
    'anthropic',
    'Balanced performance and cost. Excellent for most tasks.',
    3.00,
    15.00,
    200000,
    true,
    true,
    true,
    false,
    30
  ),
  (
    'anthropic/claude-haiku-4.5',
    'Claude Haiku 4.5',
    'anthropic',
    'Fast and efficient. Great for quick responses.',
    1.00,
    5.00,
    200000,
    true,
    true,
    true,
    false,
    25
  ),
  
  -- Google Models
  (
    'google/gemini-3-flash-preview',
    'Gemini 3 Flash',
    'google',
    'Ultra-fast multimodal model from Google.',
    0.50,
    3.00,
    1000000,
    true,
    true,
    true,
    false,
    40
  ),
  
  -- DeepSeek Models
  (
    'deepseek/deepseek-v3.2',
    'DeepSeek V3.2',
    'deepseek',
    'Powerful open-source model with excellent performance.',
    0.25,
    0.38,
    128000,
    false,
    true,
    true,
    false,
    50
  )
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  updated_at = now();
-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE agents.platform_models IS 'AI models available through platform billing (OpenRouter)';
COMMENT ON COLUMN agents.platform_models.model_id IS 'OpenRouter model identifier (e.g., openai/gpt-5-nano)';
COMMENT ON COLUMN agents.platform_models.input_cost_per_million IS 'Cost in USD per 1 million input tokens';
COMMENT ON COLUMN agents.platform_models.output_cost_per_million IS 'Cost in USD per 1 million output tokens';
