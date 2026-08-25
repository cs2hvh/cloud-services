-- Phase 1 — Image generation model catalog
--
-- Image generation is proxied via OpenRouter chat/completions with
-- modalities=["image","text"]. The gateway translates the OpenAI-compatible
-- /v1/images/generations surface; upstream model slugs never leave the gateway.
--
-- Two models with different quality/cost tradeoffs give users a picker:
--   ahura/image-gen     → google/gemini-2.5-flash-image (fast, low cost)
--   ahura/image-gen-pro → google/gemini-3.1-flash-image (higher res, richer detail)
--
-- capabilities JSONB:
--   tier              "standard" | "pro"
--   context_window    upstream context limit
--   max_output_tokens upstream max output tokens
--   input_modalities  what the model can receive (["text"] for pure text-to-image)
--   output_modalities what the model produces  (["image","text"])
--   max_images        max n per request
--   aspect_ratios     supported aspect ratio strings
--   response_formats  ["url","b64_json"]
--
-- pricing JSONB key consumed by usage worker: cents_per_image

-- ── ahura/image-gen (standard) ───────────────────────────────────
-- upstream: google/gemini-2.5-flash-image
-- ctx=32768, max_out=8192
-- OR pricing: prompt=$0.30/Mtok, completion=$2.50/Mtok
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider, upstream_model_id,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'ahura/image-gen',
  'Image Gen',
  'Fast, cost-efficient image generation. Great for iteration, prototyping, and high-volume workloads.',
  'image', 'proxy', 'openrouter', 'google/gemini-2.5-flash-image',
  '{
    "tier": "standard",
    "context_window": 32768,
    "max_output_tokens": 8192,
    "input_modalities": ["text", "image"],
    "output_modalities": ["image", "text"],
    "max_images": 4,
    "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    "response_formats": ["url", "b64_json"],
    "max_prompt_length": 4000
  }'::JSONB,
  '{
    "cents_per_image": 3
  }'::JSONB,
  TRUE, TRUE, 310
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

-- ── ahura/image-gen-pro ──────────────────────────────────────────
-- upstream: google/gemini-3.1-flash-image
-- ctx=131072, max_out=32768
-- OR pricing: prompt=$0.50/Mtok, completion=$3.00/Mtok
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider, upstream_model_id,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'ahura/image-gen-pro',
  'Image Gen Pro',
  'Higher resolution with richer detail and stronger contextual understanding. Best for creative work and production outputs.',
  'image', 'proxy', 'openrouter', 'google/gemini-3.1-flash-image',
  '{
    "tier": "pro",
    "context_window": 131072,
    "max_output_tokens": 32768,
    "input_modalities": ["text", "image"],
    "output_modalities": ["image", "text"],
    "max_images": 4,
    "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    "response_formats": ["url", "b64_json"],
    "max_prompt_length": 4000
  }'::JSONB,
  '{
    "cents_per_image": 5
  }'::JSONB,
  TRUE, FALSE, 311
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

-- ── Legacy alias cleanup ─────────────────────────────────────────
-- The old model_id 'ahura/image-flux-pro' never made it to prod (migration
-- not yet run). This guard ensures a clean conflict-free insert above if
-- by any chance it was applied early.
DELETE FROM inference.models WHERE model_id = 'ahura/image-flux-pro';
