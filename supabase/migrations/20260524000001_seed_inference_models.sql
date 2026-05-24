-- ============================================================
-- Seed inference.models with Phase 1 frontier model catalog.
--
-- All six entries proxy through OpenRouter. Pricing is in cents
-- per million tokens (per the schema convention). Off-peak
-- discount left null at launch — applied selectively in Phase 2.
--
-- The model_id column doubles as the OpenRouter request id, so
-- callers using the OpenAI SDK can pass these IDs directly.
-- ============================================================

INSERT INTO inference.models (
  model_id, display_name, description, modality, serving_type,
  upstream_provider, upstream_model_id,
  capabilities, pricing,
  is_active, is_featured, sort_order
) VALUES
-- ─── Anthropic Claude 4.x ───────────────────────────────────
(
  'anthropic/claude-opus-4.7',
  'Claude Opus 4.7',
  'Anthropic''s flagship — top coding, agentic reasoning, and long-context performance. 1M-token context, adaptive thinking.',
  'chat', 'proxy',
  'anthropic', 'anthropic/claude-opus-4.7',
  '{"streaming": true, "tools": true, "json_mode": true, "vision": true, "context_window": 1000000, "max_output": 128000, "thinking": true}'::JSONB,
  '{"input_cents_per_mtok": 1500, "output_cents_per_mtok": 7500, "cached_cents_per_mtok": 150}'::JSONB,
  TRUE, TRUE, 10
),
(
  'anthropic/claude-sonnet-4.6',
  'Claude Sonnet 4.6',
  'Best-of-class balance: 99% of Opus coding performance at 40% the cost. 1M context window.',
  'chat', 'proxy',
  'anthropic', 'anthropic/claude-sonnet-4.6',
  '{"streaming": true, "tools": true, "json_mode": true, "vision": true, "context_window": 1000000, "max_output": 64000, "thinking": true}'::JSONB,
  '{"input_cents_per_mtok": 300, "output_cents_per_mtok": 1500, "cached_cents_per_mtok": 30}'::JSONB,
  TRUE, TRUE, 20
),
(
  'anthropic/claude-haiku-4.5',
  'Claude Haiku 4.5',
  'Fast tier — 97 tokens/sec, 200K context. Optimal for high-volume light tasks and agent fan-out.',
  'chat', 'proxy',
  'anthropic', 'anthropic/claude-haiku-4.5',
  '{"streaming": true, "tools": true, "json_mode": true, "vision": true, "context_window": 200000, "max_output": 16000}'::JSONB,
  '{"input_cents_per_mtok": 100, "output_cents_per_mtok": 500, "cached_cents_per_mtok": 10}'::JSONB,
  TRUE, TRUE, 30
),
-- ─── OpenAI GPT-5.x ─────────────────────────────────────────
(
  'openai/gpt-5.5',
  'GPT-5.5',
  'OpenAI''s flagship for complex reasoning and coding. Multimodal input (text, image, audio).',
  'chat', 'proxy',
  'openai', 'openai/gpt-5.5',
  '{"streaming": true, "tools": true, "json_mode": true, "vision": true, "context_window": 400000, "max_output": 100000}'::JSONB,
  '{"input_cents_per_mtok": 500, "output_cents_per_mtok": 3000, "cached_cents_per_mtok": 50}'::JSONB,
  TRUE, TRUE, 40
),
(
  'openai/gpt-5.2',
  'GPT-5.2',
  'Best-of-recents — folds in 5.3-Codex coding strength. Five reasoning-effort tiers including xhigh.',
  'chat', 'proxy',
  'openai', 'openai/gpt-5.2',
  '{"streaming": true, "tools": true, "json_mode": true, "vision": true, "context_window": 400000, "max_output": 100000, "reasoning_effort": ["low","medium","high","xhigh"]}'::JSONB,
  '{"input_cents_per_mtok": 175, "output_cents_per_mtok": 1400, "cached_cents_per_mtok": 17}'::JSONB,
  TRUE, TRUE, 50
),
-- ─── Google Gemini 3.x ──────────────────────────────────────
(
  'google/gemini-3-pro',
  'Gemini 3 Pro',
  'Google''s flagship multimodal. Native text/image/audio/video/PDF I/O, 2M context window, dynamic thinking.',
  'chat', 'proxy',
  'google', 'google/gemini-3-pro',
  '{"streaming": true, "tools": true, "json_mode": true, "vision": true, "audio_in": true, "context_window": 2000000, "max_output": 64000, "thinking": true}'::JSONB,
  '{"input_cents_per_mtok": 125, "output_cents_per_mtok": 1000, "cached_cents_per_mtok": 12}'::JSONB,
  TRUE, TRUE, 60
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  pricing      = EXCLUDED.pricing,
  is_featured  = EXCLUDED.is_featured,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
