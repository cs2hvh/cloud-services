-- Brand-scrub: remove the upstream provider's name from customer-visible
-- model descriptions.
--
-- The platform rule (docs/inference/STATUS.md) is that upstream provider names
-- never appear in user-visible UI, API responses, or error messages. Found
-- 2026-07-28 while auditing GET /v1/models: the catalog row for
-- openai/gpt-oss-120b carries
--
--   "OpenAI's flagship open-weights model. Apache 2.0, hosted via OpenRouter
--    free + paid tiers."
--
-- and that `description` is returned verbatim by the public /v1/models
-- endpoint. The route-level leak (owned_by: "openrouter" on 77 of 80 entries)
-- was a code bug and is fixed separately; this is the data half.
--
-- Deliberately a targeted UPDATE, not a blanket regex over every description:
-- rewriting arbitrary marketing copy by pattern risks mangling sentences into
-- something worse than the leak. This is the only row that matches today —
-- re-run the audit query at the bottom after any catalog sync.

UPDATE inference.models
SET description = 'OpenAI''s flagship open-weights model. Apache 2.0, available on free and paid tiers.',
    updated_at = now()
WHERE model_id = 'openai/gpt-oss-120b'
  AND description ILIKE '%openrouter%';

-- Audit: must return zero rows. Run after catalog syncs, since upstream
-- descriptions are re-imported and can reintroduce the name.
--
--   SELECT model_id, description
--   FROM inference.models
--   WHERE description ILIKE '%openrouter%'
--      OR description ILIKE '%runpod%';
