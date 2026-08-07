-- AI Phase 1: media model catalog + watchdog support column.
-- Applies on top of 20260623000001_media_jobs.sql (already run).
-- All model upstreams confirmed live-tested against OpenRouter on 2026-06-24.
--
-- What this does:
--   1. Adds upstream_job_id to media_jobs for watchdog recovery
--   2. Upserts all video models with correct upstream IDs + capabilities
--   3. Seeds music models (Lyria 3 Clip + Pro)

-- ── Schema addition ────────────────────────────────────────────────────────────

ALTER TABLE inference.media_jobs
  ADD COLUMN IF NOT EXISTS upstream_job_id TEXT;

CREATE INDEX IF NOT EXISTS idx_media_jobs_upstream_job
  ON inference.media_jobs (upstream_job_id)
  WHERE upstream_job_id IS NOT NULL;

-- ── Video models ───────────────────────────────────────────────────────────────
-- supports_i2v = true → model accepts frame_images for image-to-video mode

INSERT INTO inference.models (
  model_id, display_name, modality, serving_type, upstream_provider, upstream_model_id,
  is_active, is_featured, sort_order, capabilities, pricing
) VALUES
  -- wan-2.6: text-to-video + image-to-video, 720p/1080p
  (
    'ahura/video-gen', 'Video Gen (Wan 2.6)',
    'video', 'proxy', 'openrouter', 'alibaba/wan-2.6',
    true, true, 10,
    '{"async": true, "supports_i2v": true, "supported_resolutions": ["720p","1080p"], "supported_aspect_ratios": ["16:9","9:16"]}'::jsonb,
    '{"cents_per_media_second": 10}'::jsonb
  ),
  -- Kling v3 Standard: high-quality i2v + t2v, 720p
  (
    'ahura/video-kling-std', 'Kling v3 Standard',
    'video', 'proxy', 'openrouter', 'kwaivgi/kling-v3.0-std',
    true, true, 20,
    '{"async": true, "supports_i2v": true, "supported_resolutions": ["720p"], "supported_aspect_ratios": ["16:9","9:16","1:1"]}'::jsonb,
    '{"cents_per_media_second": 10}'::jsonb
  ),
  -- Kling v3 Pro: highest quality i2v + t2v, 720p
  (
    'ahura/video-kling-pro', 'Kling v3 Pro',
    'video', 'proxy', 'openrouter', 'kwaivgi/kling-v3.0-pro',
    true, false, 30,
    '{"async": true, "supports_i2v": true, "supported_resolutions": ["720p"], "supported_aspect_ratios": ["16:9","9:16","1:1"]}'::jsonb,
    '{"cents_per_media_second": 15}'::jsonb
  ),
  -- Veo 3.1 Lite: text-to-video only, 720p/1080p
  (
    'ahura/video-veo-lite', 'Veo 3.1 Lite',
    'video', 'proxy', 'openrouter', 'google/veo-3.1-lite',
    true, true, 40,
    '{"async": true, "supports_i2v": false, "supported_resolutions": ["720p","1080p"], "supported_aspect_ratios": ["16:9","9:16"]}'::jsonb,
    '{"cents_per_media_second": 8}'::jsonb
  )
ON CONFLICT (model_id) DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  upstream_model_id = EXCLUDED.upstream_model_id,
  is_active         = EXCLUDED.is_active,
  capabilities      = EXCLUDED.capabilities,
  pricing           = EXCLUDED.pricing,
  sort_order        = EXCLUDED.sort_order,
  updated_at        = now();

-- ── Music models ───────────────────────────────────────────────────────────────
-- Both Lyria models use synchronous streaming chat completions (modalities:["audio"]).
-- Both support text-to-music and image-to-music (multimodal content array).

INSERT INTO inference.models (
  model_id, display_name, modality, serving_type, upstream_provider, upstream_model_id,
  is_active, is_featured, sort_order, capabilities, pricing
) VALUES
  -- Lyria 3 Clip: ~30s clips, $0.04/clip upstream
  (
    'ahura/music-gen', 'Music Gen',
    'music', 'proxy', 'openrouter', 'google/lyria-3-clip-preview',
    true, true, 10,
    '{"synchronous": true}'::jsonb,
    '{"cents_per_media_second": 5}'::jsonb
  ),
  -- Lyria 3 Pro: full-length songs, $0.08/song upstream
  (
    'ahura/music-pro', 'Music Pro',
    'music', 'proxy', 'openrouter', 'google/lyria-3-pro-preview',
    true, false, 20,
    '{"synchronous": true}'::jsonb,
    '{"cents_per_media_second": 10}'::jsonb
  )
ON CONFLICT (model_id) DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  upstream_model_id = EXCLUDED.upstream_model_id,
  is_active         = EXCLUDED.is_active,
  capabilities      = EXCLUDED.capabilities,
  pricing           = EXCLUDED.pricing,
  sort_order        = EXCLUDED.sort_order,
  updated_at        = now();
