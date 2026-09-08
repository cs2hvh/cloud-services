-- Catalog sync against the upstream on 2026-09-08.
--
-- Two models the upstream now serves that we did not list, one it no longer
-- serves that we did. Prices from the same two site endpoints the 08-26 sync
-- used (see 20260826000001_wokey_full_catalog.sql): pricing is the vendor's
-- list price, upstream_pricing is what we pay, cents per million tokens.
-- Limits from the upstream's model metadata. vision=false because the
-- upstream declares text-only input for both.
--
--   claude-fable-5-1  list $10 / $50 / cache read $0.25   cost $2.30 / $11.50 / $0.0575
--   gpt-6-astra       list $10 / $50 / cache read $1.00   cost $0.90 / $4.50 / $0.09
--
-- gpt-5.4 is gone from the upstream's list and pricing; a request for it now
-- 404s upstream, so it is switched off here rather than left as a model
-- customers can pick and cannot use. gpt-5.4-mini stays.
BEGIN;

INSERT INTO inference.models (
  model_id, display_name, description, modality, serving_type, upstream_provider, upstream_model_id,
  capabilities, pricing, upstream_pricing, is_active, is_featured, sort_order
) VALUES
  ('anthropic/claude-fable-5.1', 'Claude Fable 5.1', 'Anthropic''s newest flagship. 1M context.',
   'chat', 'proxy', 'wokey', 'claude-fable-5-1',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":1000,"output_cents_per_mtok":5000,"cached_cents_per_mtok":25}'::jsonb,
   '{"input_cents_per_mtok":230,"output_cents_per_mtok":1150,"cached_cents_per_mtok":5.75,"cache_write_cents_per_mtok":460,"cache_write_1h_cents_per_mtok":460}'::jsonb,
   TRUE, FALSE, 88),
  ('openai/gpt-6-astra', 'GPT-6 Astra', 'OpenAI''s newest flagship. 1M context.',
   'chat', 'proxy', 'wokey', 'gpt-6-astra',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1050000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":1000,"output_cents_per_mtok":5000,"cached_cents_per_mtok":100}'::jsonb,
   '{"input_cents_per_mtok":90,"output_cents_per_mtok":450,"cached_cents_per_mtok":9,"cache_write_cents_per_mtok":112.5}'::jsonb,
   TRUE, TRUE, 95)
ON CONFLICT (model_id) DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  upstream_model_id = EXCLUDED.upstream_model_id,
  capabilities      = EXCLUDED.capabilities,
  upstream_pricing  = EXCLUDED.upstream_pricing,
  is_active         = TRUE;

UPDATE inference.models SET is_active = FALSE WHERE model_id = 'openai/gpt-5.4';

COMMIT;
