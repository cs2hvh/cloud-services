-- Inference catalog: make it match what Wokey actually serves.
--
-- Verified against the live upstream on 2026-08-26 by calling
-- GET  https://api.wokey.ai/v1/models          -> 32 chat models
-- POST https://api.wokey.ai/v1/chat/completions -> one probe per catalog row
--
-- Two problems this fixes.
--
-- 1. WRONG UPSTREAM IDS. Wokey names models with bare, hyphenated ids
--    ("claude-opus-4-8", "gpt-5.6-sol", "MiniMax-M3"). Our catalog ids are
--    namespaced from the OpenRouter era ("anthropic/claude-opus-4.8"), and
--    upstream_model_id was left holding that same namespaced string for most
--    rows. Wokey aliases a few of them — anthropic/claude-opus-4.6 resolves,
--    anthropic/claude-fable-5 does not — so the breakage was invisible in
--    spot checks. Probing every row: 18 of 29 active chat models returned
--    404 model_not_found.
--
--    Every one of those 18 exists on Wokey under a different spelling, so
--    this is a mapping fix, not a removal. Public model ids are unchanged —
--    customer integrations that name a model keep working.
--
-- 2. MODALITIES WITH NO UPSTREAM. image, video, tts, music, ocr, stt, rerank
--    and moderation rows still point at openrouter, which is no longer the
--    upstream. Wokey exposes no endpoint for any of them (workers/inference/
--    src/lib/wokey.ts restricts the path union to /chat/completions and
--    /completions), and the gateway has no route to serve them either. They
--    are listed in the dashboard as if they were buyable. Deactivated rather
--    than deleted, so re-enabling is a one-line update if Wokey adds them.
--
-- Embeddings were already inactive and stay that way — Wokey serves none.
-- The three private runpod_ft fine-tunes are untouched: they are org-scoped
-- and never routed through Wokey.

-- ── 1. Point every chat model at the id Wokey answers to ──────────────
update inference.models m
set upstream_model_id = v.wokey_id,
    upstream_provider = 'wokey',
    updated_at = now()
from (values
  ('anthropic/claude-opus-5',          'claude-opus-5'),
  ('anthropic/claude-opus-4.8',        'claude-opus-4-8'),
  ('anthropic/claude-opus-4.7',        'claude-opus-4-7'),
  ('anthropic/claude-opus-4.6',        'claude-opus-4-6'),
  ('anthropic/claude-sonnet-5',        'claude-sonnet-5'),
  ('anthropic/claude-sonnet-4.6',      'claude-sonnet-4-6'),
  ('anthropic/claude-sonnet-4.5',      'claude-sonnet-4-5'),
  ('anthropic/claude-haiku-4.5',       'claude-haiku-4-5'),
  ('anthropic/claude-fable-5',         'claude-fable-5'),
  ('openai/gpt-5.6-sol',               'gpt-5.6-sol'),
  ('openai/gpt-5.6-terra',             'gpt-5.6-terra'),
  ('openai/gpt-5.6-luna',              'gpt-5.6-luna'),
  ('openai/gpt-5.5',                   'gpt-5.5'),
  ('openai/gpt-5.4',                   'gpt-5.4'),
  ('openai/gpt-5.4-mini',              'gpt-5.4-mini'),
  ('openai/gpt-5.3-codex',             'gpt-5.3-codex'),
  ('x-ai/grok-4.6',                    'grok-4.6'),
  ('x-ai/grok-4.5',                    'grok-4.5'),
  ('x-ai/grok-4.3',                    'grok-4.3'),
  ('moonshotai/kimi-k3',               'kimi-k3'),
  ('moonshotai/kimi-k2.7-code',        'kimi-k2.7-code'),
  ('moonshotai/kimi-k2.6',             'kimi-k2.6'),
  ('zhipu/glm-5.3',                    'glm-5.3'),
  ('zhipu/glm-5.2',                    'glm-5.2'),
  ('zhipu/glm-5.1',                    'glm-5.1'),
  ('deepseek/deepseek-v4-pro',         'deepseek-v4-pro'),
  ('deepseek/deepseek-v4-flash',       'deepseek-v4-flash'),
  ('bytedance/doubao-seed-2.1-turbo',  'doubao-seed-2.1-turbo'),
  ('minimax/minimax-m3',               'MiniMax-M3')
) as v(public_id, wokey_id)
where m.model_id = v.public_id
  and m.serving_type = 'proxy'
  and m.modality = 'chat';

-- ── 2. Retire modalities Wokey cannot serve ───────────────────────────
update inference.models
set is_active = false,
    updated_at = now()
where is_active = true
  and serving_type = 'proxy'
  and modality in ('image', 'video', 'tts', 'stt', 'music', 'ocr', 'rerank',
                   'moderation', 'audio_stt', 'audio_tts', 'realtime',
                   'completion', 'embedding');
