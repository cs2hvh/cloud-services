-- Wokey migration, part 2 of 2: chat model mapping, delisting, BYOK.
--
-- Context
-- -------
-- The inference upstream moved from OpenRouter to Wokey
-- (https://api.wokey.ai/v1). Verified live against Wokey on 2026-08-25:
--
--   1. Model ids are NOT uniformly transformable. Anthropic replaces dots
--      with dashes ("anthropic/claude-opus-4.7" -> "claude-opus-4-7"); OpenAI
--      keeps them ("openai/gpt-5.5" -> "gpt-5.5"). A blind split_part() would
--      404 every Anthropic model while appearing to work for OpenAI. Every id
--      in the map below was confirmed with a real request returning HTTP 200.
--      An untranslated id returns 404 model_not_found, so this mapping is
--      load-bearing, not cosmetic.
--
--   2. Wokey serves no embeddings endpoint and no embedding model.
--
-- SCOPE -- deliberately narrow
-- ----------------------------
-- Touches ONLY what the edge gateway actually forwards to the shared upstream:
-- modality 'chat' and 'embedding'.
--
-- It does NOT touch image / video / music / tts / stt / ocr / rerank /
-- moderation. Those rows are also serving_type='proxy', so an earlier draft of
-- this migration would have delisted all 14 of them. That would have been
-- wrong twice over: this branch has no route serving any of them (the worker
-- exposes chat/completions, embeddings, messages, models, key -- nothing
-- else), and their upstream_model_id values are meaningful product mappings
-- (ahura/video-gen -> alibaba/wan-2.6) owned by code that is not on this
-- branch.
--
-- KNOWN GAP, not fixed here: those media rows still point at OpenRouter model
-- ids. Whatever serves them will break when the OpenRouter account is closed.
-- Resolving that needs the media-generation code from
-- ai-admin-workphase-7, and a decision about which of Wokey's media endpoints
-- (POST /v1/videos exists; images are priced but undocumented) replaces them.
--
-- REVERSIBILITY: only is_active and upstream_model_id change. No deletes.

BEGIN;

-- 1. Confirmed Wokey equivalents (each verified HTTP 200)
CREATE TEMP TABLE _wokey_map (public_id TEXT PRIMARY KEY, wokey_id TEXT NOT NULL)
  ON COMMIT DROP;

INSERT INTO _wokey_map (public_id, wokey_id) VALUES
  ('anthropic/claude-haiku-4.5',  'claude-haiku-4-5'),
  ('anthropic/claude-opus-4.7',   'claude-opus-4-7'),
  ('anthropic/claude-sonnet-4.6', 'claude-sonnet-4-6'),
  ('openai/gpt-5.5',              'gpt-5.5'),
  ('moonshotai/kimi-k2.6',        'kimi-k2.6');

UPDATE inference.models m
   SET upstream_model_id = w.wokey_id,
       is_active         = TRUE
  FROM _wokey_map w
 WHERE m.model_id = w.public_id
   AND m.serving_type = 'proxy'
   AND m.modality = 'chat';

-- 2. Unmapped CHAT models on the shared upstream: delist.
-- Fail-safe: a model absent from the catalog is a visible, reportable
-- problem; one that 404s mid-conversation is a support ticket and a refund.
UPDATE inference.models
   SET is_active = FALSE
 WHERE serving_type = 'proxy'
   AND modality = 'chat'
   AND model_id NOT IN (SELECT public_id FROM _wokey_map);

-- 3. Embedding models: delist.
-- /v1/embeddings now returns 503 and the semantic cache is off, because the
-- upstream serves neither. Leaving these listed would advertise a product
-- that cannot be called.
UPDATE inference.models
   SET is_active = FALSE
 WHERE modality = 'embedding';

-- 4. Invalidate OpenRouter BYOK keys.
-- A customer's OpenRouter key is worthless against Wokey. Marking the rows
-- invalid produces the gateway's clear "No valid BYOK key configured" error
-- instead of forwarding a doomed credential for an opaque upstream 401.
-- Ciphertext is retained, not dropped.
UPDATE inference.byok_keys
   SET is_valid = FALSE
 WHERE provider = 'openrouter'
   AND is_valid = TRUE;

COMMENT ON COLUMN inference.models.upstream_model_id IS
  'What the upstream calls this model, when it differs from the public '
  'model_id. Read by the gateway at forward time so public ids stay stable '
  'across upstream changes. For media modalities it also carries the '
  'product-to-provider mapping (e.g. ahura/video-gen -> alibaba/wan-2.6).';

COMMIT;
