-- Phase 1 — Rerank + Moderation model catalog
--
-- Each model row uses JSONB for capabilities so:
--   • The gateway reads only the typed columns (upstream_model_id, serving_type)
--   • The frontend model-picker reads capabilities JSONB with safe null-checks
--   • Adding new per-modality fields never requires a schema migration
--
-- capabilities JSONB common keys (all modalities):
--   tier              "standard" | "pro" | "ultra"
--   context_window    integer — upstream context limit (null if N/A)
--   max_output_tokens integer — upstream max output (null if N/A)
--
-- capabilities JSONB modality-specific keys:
--   rerank:     max_documents, max_query_length, max_document_length, multilingual
--   moderation: categories[], max_batch_size, max_input_length, multimodal

-- ── ahura/rerank-m3 ──────────────────────────────────────────────
-- upstream: cohere/rerank-v3.5 via OpenRouter /api/v1/rerank
-- pricing key: cents_per_1k_rerank (consumed by usage worker)
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider, upstream_model_id,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'ahura/rerank-m3',
  'Rerank M3',
  'Multilingual reranker. Send a query and up to 100 candidate chunks; get relevance-ranked indexes. Best used as a second-stage filter after vector search.',
  'rerank', 'proxy', 'openrouter', 'cohere/rerank-v3.5',
  '{
    "tier": "standard",
    "context_window": null,
    "max_output_tokens": null,
    "max_documents": 100,
    "max_query_length": 2000,
    "max_document_length": 4000,
    "multilingual": true
  }'::JSONB,
  '{
    "cents_per_1k_rerank": 1
  }'::JSONB,
  TRUE, TRUE, 300
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  serving_type      = EXCLUDED.serving_type,
  upstream_provider = EXCLUDED.upstream_provider,
  upstream_model_id = EXCLUDED.upstream_model_id,
  capabilities      = EXCLUDED.capabilities,
  pricing           = EXCLUDED.pricing,
  is_active         = EXCLUDED.is_active,
  is_featured       = EXCLUDED.is_featured,
  sort_order        = EXCLUDED.sort_order,
  updated_at        = NOW();

-- ── ahura/moderation-guard ───────────────────────────────────────
-- upstream: meta-llama/llama-guard-4-12b via OpenRouter chat completions
-- pricing key: cents_per_1k_moderation
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider, upstream_model_id,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'ahura/moderation-guard',
  'Moderation Guard',
  'Text and image content safety classifier. Returns per-category harm scores and a flagged boolean. OpenAI moderation-compatible response shape.',
  'moderation', 'proxy', 'openrouter', 'meta-llama/llama-guard-4-12b',
  '{
    "tier": "standard",
    "context_window": 163840,
    "max_output_tokens": 20,
    "max_input_length": 8000,
    "max_batch_size": 8,
    "multimodal": true,
    "categories": [
      "hate", "hate_threatening", "harassment", "harassment_threatening",
      "self_harm", "self_harm_intent", "self_harm_instructions",
      "sexual", "sexual_minors", "violence", "violence_graphic",
      "illicit", "illicit_violent"
    ]
  }'::JSONB,
  '{
    "cents_per_1k_moderation": 1
  }'::JSONB,
  TRUE, TRUE, 301
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  serving_type      = EXCLUDED.serving_type,
  upstream_provider = EXCLUDED.upstream_provider,
  upstream_model_id = EXCLUDED.upstream_model_id,
  capabilities      = EXCLUDED.capabilities,
  pricing           = EXCLUDED.pricing,
  is_active         = EXCLUDED.is_active,
  is_featured       = EXCLUDED.is_featured,
  sort_order        = EXCLUDED.sort_order,
  updated_at        = NOW();
