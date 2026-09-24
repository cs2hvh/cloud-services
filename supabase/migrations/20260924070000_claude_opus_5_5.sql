-- Starimg added Claude Opus 5.5 (bare id claude-opus-5-5; 1,000,000 context,
-- 128,000 max output; multiplier 6, the same as Opus 5). Starimg's real cost
-- on the Claude family is 3 c/Mtok per multiplier unit (Fable 12 → 36,
-- Opus 5 6 → 18, Sonnet 3 → 9), so 18 here, the same as Opus 5. Sell price
-- copies Opus 5 (350/75/1750) until the panel sets it. Served by Starimg
-- only, like the rest of the family. Sorted above Opus 5.

insert into inference.models
  (model_id, display_name, modality, serving_type, upstream_provider, upstream_model_id,
   pricing, upstream_pricing, provider_pricing, capabilities, is_active, is_featured, sort_order)
values
  ('anthropic/claude-opus-5.5', 'Claude Opus 5.5', 'chat', 'proxy', 'starimg', 'claude-opus-5-5',
   '{"input_cents_per_mtok": 350, "cached_cents_per_mtok": 75, "output_cents_per_mtok": 1750}'::jsonb,
   '{"input_cents_per_mtok": 18, "cached_cents_per_mtok": 18, "output_cents_per_mtok": 18}'::jsonb,
   '{"starimg": {"input_cents_per_mtok": 18, "cached_cents_per_mtok": 18, "output_cents_per_mtok": 18}}'::jsonb,
   '{"tools": true, "vision": false, "json_mode": true, "streaming": true, "max_output": 128000, "context_window": 1000000}'::jsonb,
   true, true, 5)
on conflict (model_id) do nothing;
