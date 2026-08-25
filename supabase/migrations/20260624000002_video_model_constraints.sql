-- Video model improvements: error_message column + supported_durations UI hints.
--
-- supported_durations is stored in capabilities for the FRONTEND only (populates
-- the duration dropdown). The backend never validates against it — OpenRouter owns
-- all parameter validation and its error messages surface directly to callers.
--
-- Confirmed durations from live OpenRouter testing on 2026-06-24:
--   wan-2.6:        5s, 10s
--   kling-v3.0-std: 5s, 8s, 10s
--   kling-v3.0-pro: 5s, 8s, 10s
--   veo-3.1-lite:   4s, 6s, 8s
--
-- error_message stores the upstream error text (from OR 400 responses) so that
-- watchdog-recovered jobs can still surface a useful message after the fact.

ALTER TABLE inference.media_jobs
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Frontend-only duration hints per model (not enforced by the gateway)
UPDATE inference.models
SET capabilities = capabilities || '{"supported_durations": [5, 10]}'::jsonb
WHERE model_id = 'ahura/video-gen';

UPDATE inference.models
SET capabilities = capabilities || '{"supported_durations": [5, 8, 10]}'::jsonb
WHERE model_id = 'ahura/video-kling-std';

UPDATE inference.models
SET capabilities = capabilities || '{"supported_durations": [5, 8, 10]}'::jsonb
WHERE model_id = 'ahura/video-kling-pro';

UPDATE inference.models
SET capabilities = capabilities || '{"supported_durations": [4, 6, 8]}'::jsonb
WHERE model_id = 'ahura/video-veo-lite';
