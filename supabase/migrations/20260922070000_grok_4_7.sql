-- x-ai/grok-4.7: Starimg added Grok 4.7 (bare id "grok-4.7", 500K context,
-- same 0.5 multiplier as 4.6, so the same real cost). Priced and shaped like
-- x-ai/grok-4.6 until the panel sets its own prices; served by Starimg only,
-- like every other chat model there.

insert into inference.models
  (model_id, display_name, modality, serving_type, upstream_provider, upstream_model_id,
   pricing, upstream_pricing, provider_pricing, capabilities, is_active, is_featured, sort_order)
values
  ('x-ai/grok-4.7', 'Grok 4.7', 'chat', 'proxy', 'starimg', 'grok-4.7',
   '{"input_cents_per_mtok": 100, "cached_cents_per_mtok": 25, "output_cents_per_mtok": 300}'::jsonb,
   '{"input_cents_per_mtok": 200, "cached_cents_per_mtok": 50, "output_cents_per_mtok": 600}'::jsonb,
   '{"starimg": {"input_cents_per_mtok": 2.25, "cached_cents_per_mtok": 2.25, "output_cents_per_mtok": 2.25}}'::jsonb,
   '{"tools": true, "vision": false, "json_mode": true, "streaming": true, "max_output": 64000, "context_window": 500000}'::jsonb,
   true, true, 160)
on conflict (model_id) do nothing;
