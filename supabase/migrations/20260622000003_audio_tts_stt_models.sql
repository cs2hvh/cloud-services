-- Phase 1 — TTS + STT model catalog
--
-- TTS: two quality tiers via OpenRouter chat/completions with audio modality.
--   Upstream streams PCM16 chunks over SSE; gateway reassembles into WAV.
--   Both use the same voice names; the upstream voice may differ per tier.
--
-- STT: one model — google/gemini-2.5-flash supports the input_audio content
--   type that the gateway uses. Voxtral (mistral) does NOT support this format.
--
-- capabilities JSONB common keys:
--   tier              "standard" | "pro"
--   context_window    upstream context limit
--   max_output_tokens upstream max output
--
-- TTS-specific:
--   voices            customer-facing voice names (mapped to upstream in gateway)
--   formats           response formats: "wav" | "b64_json"
--   max_input_chars   per request character limit
--
-- STT-specific:
--   input_formats     accepted MIME / extension list
--   max_file_mb       maximum upload size
--   multilingual      whether language detection is automatic
--   context_window    large = better for long audio files
--
-- pricing JSONB keys consumed by usage worker:
--   tts: cents_per_1k_chars
--   stt: cents_per_audio_minute

-- ── ahura/voice-aria (TTS standard) ─────────────────────────────
-- upstream: openai/gpt-audio-mini via OR chat completions (stream:true)
-- ctx=128000, max_out=16384
-- OR pricing: prompt=$0.60/Mtok, completion=$2.40/Mtok, audio=$0.60/Mtok
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider, upstream_model_id,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'ahura/voice-aria',
  'Voice Aria',
  'Natural, expressive text-to-speech. Returns audio/wav or base64 JSON. Six voices available.',
  'tts', 'proxy', 'openrouter', 'openai/gpt-audio-mini',
  '{
    "tier": "standard",
    "context_window": 128000,
    "max_output_tokens": 16384,
    "voices": ["aria", "echo", "nova", "onyx", "shimmer", "fable"],
    "formats": ["wav", "b64_json"],
    "max_input_chars": 4096
  }'::JSONB,
  '{
    "cents_per_1k_chars": 3
  }'::JSONB,
  TRUE, TRUE, 320
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

-- ── ahura/voice-pro (TTS pro) ────────────────────────────────────
-- upstream: openai/gpt-audio via OR chat completions (stream:true)
-- ctx=128000, max_out=16384
-- OR pricing: prompt=$2.50/Mtok, completion=$10.00/Mtok, audio=$32.00/Mtok
-- Higher quality decoder: richer prosody, better consistency on long text.
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider, upstream_model_id,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'ahura/voice-pro',
  'Voice Pro',
  'Studio-quality text-to-speech with an upgraded decoder for richer prosody and better voice consistency. Best for production content and accessibility.',
  'tts', 'proxy', 'openrouter', 'openai/gpt-audio',
  '{
    "tier": "pro",
    "context_window": 128000,
    "max_output_tokens": 16384,
    "voices": ["aria", "echo", "nova", "onyx", "shimmer", "fable"],
    "formats": ["wav", "b64_json"],
    "max_input_chars": 4096
  }'::JSONB,
  '{
    "cents_per_1k_chars": 12
  }'::JSONB,
  TRUE, FALSE, 321
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

-- ── ahura/stt-whisper (STT) ──────────────────────────────────────
-- upstream: google/gemini-2.5-flash via OR chat completions
-- Uses input_audio content type (base64 audio in message content).
-- ctx=1_048_576 — handles hour-long recordings in a single call.
-- OR pricing: prompt=$0.30/Mtok, audio=$1.00/Mtok
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider, upstream_model_id,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'ahura/stt-whisper',
  'STT Whisper',
  'Speech-to-text supporting MP3, WAV, M4A, WebM, FLAC, and OGG. Multilingual with automatic language detection.',
  'stt', 'proxy', 'openrouter', 'google/gemini-2.5-flash',
  '{
    "tier": "standard",
    "context_window": 1048576,
    "max_output_tokens": 65535,
    "input_formats": ["mp3", "wav", "m4a", "mp4", "webm", "ogg", "flac"],
    "max_file_mb": 25,
    "multilingual": true
  }'::JSONB,
  '{
    "cents_per_audio_minute": 2
  }'::JSONB,
  TRUE, TRUE, 330
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
