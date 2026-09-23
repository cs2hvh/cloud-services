-- Starimg added GPT 6 Sol and GPT 6 Luna (bare ids gpt-6-sol, gpt-6-luna;
-- 1,050,000 context; multipliers 2 and 0.25). Starimg's real cost on the
-- OpenAI family is 4.5 c/Mtok per multiplier unit (astra 7.5 → 33.75,
-- 5.6 sol 3 → 13.5, 5.6 terra 1.5 → 6.75), so 9 and 1.125 here. Sell prices
-- follow the same shape as gpt-6-astra (40 in / 200 out per unit) until the
-- panel sets them. Served by Starimg only, like the rest of the family.
-- (muse-spark-1.3 left Starimg's list at the same time; we never carried it.)

insert into inference.models
  (model_id, display_name, modality, serving_type, upstream_provider, upstream_model_id,
   pricing, upstream_pricing, provider_pricing, capabilities, is_active, is_featured, sort_order)
values
  ('openai/gpt-6-sol', 'GPT 6 Sol', 'chat', 'proxy', 'starimg', 'gpt-6-sol',
   '{"input_cents_per_mtok": 80, "cached_cents_per_mtok": 20, "output_cents_per_mtok": 400}'::jsonb,
   '{"input_cents_per_mtok": 9, "cached_cents_per_mtok": 9, "output_cents_per_mtok": 9}'::jsonb,
   '{"starimg": {"input_cents_per_mtok": 9, "cached_cents_per_mtok": 9, "output_cents_per_mtok": 9}}'::jsonb,
   '{"tools": true, "vision": false, "json_mode": true, "streaming": true, "max_output": 128000, "context_window": 1050000}'::jsonb,
   true, false, 96),
  ('openai/gpt-6-luna', 'GPT 6 Luna', 'chat', 'proxy', 'starimg', 'gpt-6-luna',
   '{"input_cents_per_mtok": 10, "cached_cents_per_mtok": 2.5, "output_cents_per_mtok": 50}'::jsonb,
   '{"input_cents_per_mtok": 1.125, "cached_cents_per_mtok": 1.125, "output_cents_per_mtok": 1.125}'::jsonb,
   '{"starimg": {"input_cents_per_mtok": 1.125, "cached_cents_per_mtok": 1.125, "output_cents_per_mtok": 1.125}}'::jsonb,
   '{"tools": true, "vision": false, "json_mode": true, "streaming": true, "max_output": 128000, "context_window": 1050000}'::jsonb,
   true, false, 97)
on conflict (model_id) do nothing;
