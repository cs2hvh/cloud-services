-- Add current-generation OpenAI chat models that are missing from the catalog.
-- These are gated through OpenRouter; pricing is in cents per million tokens (mtok).
-- Without catalog rows, cost_cents stays 0 in both inference.usage and inference.trace_spans.

INSERT INTO inference.models (model_id, serving_type, modality, display_name, description, pricing)
VALUES
  (
    'openai/gpt-4o-mini',
    'proxy',
    'chat',
    'GPT-4o Mini',
    'OpenAI''s small, affordable model for fast tasks.',
    '{"input_cents_per_mtok": 15, "cached_cents_per_mtok": 8, "output_cents_per_mtok": 60}'
  ),
  (
    'openai/gpt-4o',
    'proxy',
    'chat',
    'GPT-4o',
    'OpenAI''s flagship multimodal model.',
    '{"input_cents_per_mtok": 250, "cached_cents_per_mtok": 125, "output_cents_per_mtok": 1000}'
  ),
  (
    'openai/gpt-4.1',
    'proxy',
    'chat',
    'GPT-4.1',
    'OpenAI GPT-4.1 — strong reasoning and long-context.',
    '{"input_cents_per_mtok": 200, "cached_cents_per_mtok": 50, "output_cents_per_mtok": 800}'
  ),
  (
    'openai/gpt-4.1-mini',
    'proxy',
    'chat',
    'GPT-4.1 Mini',
    'Efficient mid-tier from OpenAI.',
    '{"input_cents_per_mtok": 40, "cached_cents_per_mtok": 10, "output_cents_per_mtok": 160}'
  )
ON CONFLICT (model_id) DO NOTHING;
