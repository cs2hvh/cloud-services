-- Multi-supplier model routing.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every layer of the gateway assumes exactly one place to buy model capacity.
-- `inference.models.upstream_provider` exists and looks like it decides, but the
-- gateway never reads it — it is dead weight. Adding a second supplier needs
-- per-supplier facts (their id for a model, their price, whether they still
-- list it) which one column cannot hold.
--
-- Design: docs/inference/supply-routing-plan.md §9.2.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE WRITER PER COLUMN
-- ─────────────────────────────────────────────────────────────────────────────
--
--   preferred_provider    an operator, via the admin "buy from" dropdown
--   enabled               an operator
--   catalog_*             the catalog sync, and only the catalog sync
--
-- The sync must NEVER write `enabled`, and must NEVER delete a row. If it owned
-- row existence it could erase an operator's veto by deleting and re-inserting:
--
--     operator  wokey + model X -> enabled = false      (a deliberate veto)
--     sync      X vanishes from the supplier catalog  -> row DELETED
--     sync      X returns next week                   -> row re-INSERTED
--     result    the veto is gone, and nobody was told
--
-- So a delisted model sets catalog_present = false and keeps its row. Rows are
-- removed by a human, deliberately, or not at all.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- FAIL CLOSED
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `enabled` defaults FALSE. A route the catalog sync just discovered is off
-- until a human turns it on. Marketplace supply requires a positive answer to
-- every question; silence is a no.

-- ── The supplier vocabulary ──────────────────────────────────────────────────
-- Reuses byok_provider so the catalog, the routes and the BYOK keys cannot
-- drift into three different spellings of the same supplier.
ALTER TYPE inference.byok_provider ADD VALUE IF NOT EXISTS 'wokey';

-- ── Which supplier a model is bought from ────────────────────────────────────
-- NULL = OpenRouter, which is every row today and stays the floor: there is no
-- state in which a model has no route.
ALTER TABLE inference.models
  ADD COLUMN IF NOT EXISTS preferred_provider inference.byok_provider;

COMMENT ON COLUMN inference.models.preferred_provider IS
  'Which supplier this model is bought from. NULL means OpenRouter (the default '
  'and the fallback). Written by the admin "buy from" dropdown — one column, one '
  'write, reversible on the next request.';

-- ── Per-supplier facts about a model ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inference.model_routes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id           TEXT NOT NULL REFERENCES inference.models(model_id) ON DELETE CASCADE,
  provider           inference.byok_provider NOT NULL,

  -- The supplier's own id for this model: 'claude-sonnet-4-6' at Wokey where we
  -- call it 'anthropic/claude-sonnet-4.6'.
  upstream_model_id  TEXT NOT NULL,

  -- What THIS supplier charges us. Same shape as models.upstream_pricing.
  upstream_pricing   JSONB,

  -- OUR policy. Operator-only; the sync must not touch it.
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,

  -- THEIR state. Sync-only.
  catalog_present    BOOLEAN NOT NULL DEFAULT TRUE,
  catalog_available  BOOLEAN NOT NULL DEFAULT TRUE,
  catalog_synced_at  TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (model_id, provider)
);

COMMENT ON TABLE inference.model_routes IS
  'Per-supplier facts about a model. Which supplier is actually USED is '
  'inference.models.preferred_provider; this table says what each supplier '
  'calls the model, charges for it, and whether they still list it.';

COMMENT ON COLUMN inference.model_routes.enabled IS
  'OUR policy — operator-written only. Defaults FALSE so a newly discovered '
  'route is off until a human turns it on. The catalog sync must never write it.';

COMMENT ON COLUMN inference.model_routes.catalog_present IS
  'Does the supplier still list this model at all. FALSE = delisted; the row is '
  'kept so an operator decision survives. Distinct from catalog_available, '
  'which is the supplier having a bad day.';

CREATE INDEX IF NOT EXISTS idx_model_routes_lookup
  ON inference.model_routes(model_id, provider)
  WHERE enabled AND catalog_present AND catalog_available;

-- ── Seed: every existing model keeps buying from OpenRouter ──────────────────
-- enabled = TRUE here and only here. This is not a new route being discovered,
-- it is the route the gateway has always used, written down for the first time.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS IS NOT A PLAIN COALESCE(upstream_model_id, model_id)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Measured against the live catalog on 2026-08-26: 29 of 46 active chat models
-- carry an `upstream_model_id` with NO vendor prefix — 'claude-sonnet-4-6'
-- where OpenRouter expects 'anthropic/claude-sonnet-4.6'. Verified directly
-- against the API:
--
--     claude-sonnet-4-6            -> HTTP 400 "is not a valid model ID"
--     anthropic/claude-sonnet-4.6  -> HTTP 200
--
-- All 29 match Wokey's catalog exactly, so they appear to be Wokey ids sitting
-- in the shared column. Copying them into an OPENROUTER route row would write
-- down a mapping we have proven the supplier rejects, and the whole point of
-- per-supplier routes is that each supplier keeps its own id.
--
-- So: use `upstream_model_id` when it is OpenRouter-shaped, otherwise fall back
-- to `model_id` — which for these rows IS the correct OpenRouter id (that is
-- the 200 above). This corrects the route table without touching
-- inference.models, so nothing that reads the old column changes behaviour.
--
-- THIS DOES NOT ANSWER WHY THE IDS ARE LIKE THAT. If someone deliberately
-- pointed the platform at Wokey by editing this column, that intent is
-- preserved in inference.models and should be moved to a proper wokey route
-- row (scripts/sync-wokey-catalog.ts) before any routing is enabled.
INSERT INTO inference.model_routes
  (model_id, provider, upstream_model_id, upstream_pricing, enabled, catalog_synced_at)
SELECT
  m.model_id,
  'openrouter'::inference.byok_provider,
  CASE
    WHEN m.upstream_model_id LIKE '%/%' THEN m.upstream_model_id
    ELSE m.model_id
  END,
  m.upstream_pricing,
  TRUE,
  NOW()
FROM inference.models m
WHERE m.serving_type = 'proxy'
ON CONFLICT (model_id, provider) DO NOTHING;

-- Say out loud how many were corrected, so this is not a silent rewrite.
DO $$
DECLARE corrected INT;
BEGIN
  SELECT COUNT(*) INTO corrected
  FROM inference.models
  WHERE serving_type = 'proxy'
    AND upstream_model_id IS NOT NULL
    AND upstream_model_id NOT LIKE '%/%';
  IF corrected > 0 THEN
    RAISE NOTICE '% model(s) had a non-OpenRouter upstream_model_id; their OpenRouter route was seeded from model_id instead. inference.models is unchanged — investigate why those ids are in the shared column.', corrected;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PER-ORG POLICY: may this org's traffic touch marketplace supply at all?
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Marketplace capacity is resold subscription quota. The supplier's own privacy
-- terms allow retaining the full request payload for 14 days on failed or
-- abnormal requests, unredacted. That is a decision to make per customer, not a
-- default to inherit.
--
-- DEFAULT FALSE, and read fail-closed at the gateway: if the flag cannot be
-- read, the request serves from OpenRouter. Marketplace supply requires a
-- positive answer to every question; silence is a no.

ALTER TABLE inference.orgs
  ADD COLUMN IF NOT EXISTS allow_marketplace_supply BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN inference.orgs.allow_marketplace_supply IS
  'May this org be served by marketplace supply (resold subscription capacity)? '
  'Default FALSE. Read fail-closed: unreadable means no. Enterprise and '
  'zero-retention customers must stay FALSE.';

-- The supplier kill switch lives with the other capability switches, in the
-- same table and admin screen. ONE DIFFERENCE, deliberate: the other five fail
-- OPEN because they gate whole capabilities and closing them returns 503. This
-- one gates only WHICH UPSTREAM serves the request, so closed means OpenRouter,
-- not an error — and failing open would route to a marketplace at the exact
-- moment we could not verify the org is allowed one.
INSERT INTO public.platform_settings (key, value)
VALUES ('ai_supplier_wokey_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- ATTRIBUTION: which supplier charged us for this request
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `upstream_cost_cents` records HOW MUCH a request cost us and, until now,
-- nothing about WHO charged it. With one supplier that was implicit. With two
-- it makes the number unattributable and per-model margin meaningless — you
-- cannot answer "what did Wokey actually save us" from a column that does not
-- say Wokey.
--
-- Defaults to 'openrouter' because that is what every existing row was.

ALTER TABLE inference.usage
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'openrouter';

COMMENT ON COLUMN inference.usage.provider IS
  'Which supplier served and charged for this request. Defaults to openrouter, '
  'which every row predating multi-supplier routing was.';

CREATE INDEX IF NOT EXISTS idx_usage_provider_created
  ON inference.usage(provider, created_at DESC);
