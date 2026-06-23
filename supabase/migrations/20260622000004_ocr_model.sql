-- Phase 1 — OCR / Document AI model catalog
--
-- OCR uses google/gemini-2.5-flash via OpenRouter chat completions.
-- Documents (PDF, image) are sent as data-URI image_url content blocks.
-- PAGE_N: markers in the response are parsed into per-page markdown.
-- Customer surface is /v1/ocr (own verb — no OpenAI standard exists).
--
-- Gemini 2.5 Flash's 1M context window means a 500-page PDF fits in one call.
--
-- capabilities JSONB:
--   tier             "standard"
--   context_window   1_048_576 — key advantage for large docs
--   max_output_tokens 65535
--   input_formats    accepted MIME/extensions
--   max_file_mb      hard limit enforced in route
--   output_format    always "markdown"
--   supports_url     can fetch documents from a URL (no upload needed)
--   supports_base64  accepts raw base64 / data-URI
--
-- pricing JSONB key consumed by usage worker: cents_per_page

INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider, upstream_model_id,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'ahura/ocr-doc',
  'OCR Doc',
  'Layout-aware text extraction from PDFs and images. Returns per-page markdown with preserved headings, tables, and lists. 1M-token context handles large multi-page documents in a single call.',
  'ocr', 'proxy', 'openrouter', 'google/gemini-2.5-flash',
  '{
    "tier": "standard",
    "context_window": 1048576,
    "max_output_tokens": 65535,
    "input_formats": ["pdf", "png", "jpeg", "webp", "gif"],
    "max_file_mb": 20,
    "output_format": "markdown",
    "supports_url": true,
    "supports_base64": true
  }'::JSONB,
  '{
    "cents_per_page": 2
  }'::JSONB,
  TRUE, TRUE, 340
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
