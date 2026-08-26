-- Record cache WRITE tokens on inference.usage.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IS WRONG
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Prompt caching has three token classes, not two:
--
--     fresh input        charged at the input rate
--     cache read         charged at ~0.1x input        ← recorded
--     cache write        charged at 1.25x (5m) or 2x (1h) input   ← NOT recorded
--
-- We stored `cached_tokens` and nothing else, and `upstream_pricing` carried no
-- write rate because scripts/sync-or-model-pricing.ts only ever read the
-- upstream catalog's `input_cache_read` field — `input_cache_write` and
-- `input_cache_write_1h` were published all along and never fetched.
--
-- The consequence is the wrong direction. A cache WRITE costs MORE than not
-- caching at all, so every cached Anthropic request under-stated our upstream
-- cost and over-stated margin. On claude-sonnet-4.6 a 5-minute write is
-- $3.75/Mtok against a $3.00/Mtok input rate.
--
-- The gateway also reported `cache_creation_input_tokens: 0` to every caller of
-- the Anthropic-format /v1/messages endpoint, which was simply untrue.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Adds the column. The usage consumer writes it; computeCost() prices it as a
-- fourth leg; the admin pricing screen gains a "Cache write" rate alongside
-- input / cache read / output.
--
-- NULLABLE and no backfill, deliberately. Existing rows genuinely do not know
-- how many of their input tokens were cache writes — that information was never
-- captured and cannot be reconstructed. NULL reads as "not measured", which is
-- the truth; a 0 default would assert "no cache writes happened", which is a
-- lie in exactly the rows that matter.
--
-- No grant work: customers hold no direct SELECT on the `inference` schema
-- (20260806000002 revoked it), so a new column is not customer-reachable.
--
-- `inference.usage` is RANGE-partitioned on created_at. ADD COLUMN on the
-- parent propagates to every existing and future partition.

ALTER TABLE inference.usage
  ADD COLUMN IF NOT EXISTS cache_write_tokens INTEGER;

COMMENT ON COLUMN inference.usage.cache_write_tokens IS
  'Input tokens written to an upstream prompt cache. A subset of input_tokens, '
  'billed ABOVE the input rate (1.25x for a 5-minute TTL, 2x for an hour). '
  'NULL means the upstream did not report it, or the row predates 2026-08-25 — '
  'not that the request wrote nothing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ALSO: what the supplier SAID it charged
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `upstream_cost_cents` has always been DERIVED — tokens multiplied by a rate
-- table we sync. That table can be stale, and for embeddings, rerank and audio
-- it has no row at all, because the upstream catalog endpoint enumerates chat
-- models only. Those modalities have therefore never had a real cost basis.
--
-- OpenRouter reports `usage.cost` on every response, streaming included. That
-- is authoritative, per-request, and modality-agnostic. It is now preferred
-- over the derived figure, and recorded separately so the two can be told
-- apart: a NULL here means `upstream_cost_cents` was estimated, not measured.

ALTER TABLE inference.usage
  ADD COLUMN IF NOT EXISTS reported_upstream_cost_cents NUMERIC;

COMMENT ON COLUMN inference.usage.reported_upstream_cost_cents IS
  'What the supplier said this request cost us, in cents, when it said so. '
  'NULL means upstream_cost_cents was derived from the rate table instead — '
  'the difference between a measured margin and an estimated one. '
  'USE THIS COLUMN FOR MARGIN AGGREGATES, not upstream_cost_cents: that one is '
  'BIGINT and rounds UP, so an embedding costing 0.004 cents is stored as 1. '
  'Harmless per request, but on high-volume cheap modalities it overstates cost '
  'by orders of magnitude. This column is NUMERIC and keeps the real figure.';
