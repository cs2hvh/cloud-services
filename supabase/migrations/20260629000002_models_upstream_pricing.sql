-- Add upstream_pricing to inference.models to separate cost basis from customer pricing.
--
-- pricing          = what WE charge the customer (curated, includes markup, manually set)
-- upstream_pricing = what OR charges us          (synced by scripts/sync-or-model-pricing.ts)
--
-- The usage consumer will use upstream_pricing to compute upstream_cost_cents,
-- enabling margin reporting (cost_cents - upstream_cost_cents = gross margin per request).
-- Until the script is run, upstream_pricing is NULL and upstream_cost_cents stays 0.

ALTER TABLE inference.models
  ADD COLUMN IF NOT EXISTS upstream_pricing JSONB;
