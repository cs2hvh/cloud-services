-- Second self-served model: Qwen3.8 Flash Next on an AhuraSense-rented pod.
-- Served id qwen3.8-flash-next (the pod's /v1/models), context 262,144 as
-- the pod reports; max_output is a placeholder pending a measured value.
-- PRICING IS A PLACEHOLDER, the same one the hosted GLM started with, to be
-- set from the admin panel; upstream_pricing null because the pod is hourly.
-- The endpoint row with its credential is operator data, inserted with the
-- service role, never in a migration.
insert into inference.models
  (model_id, display_name, description, modality, serving_type, upstream_provider,
   upstream_model_id, capabilities, pricing, upstream_pricing, is_active, is_featured,
   sort_order, is_managed)
values
  ('qwen/qwen3.8-flash-next',
   'Qwen / Qwen3.8 Flash Next',
   'Qwen3.8 Flash Next, served on AhuraSense GPU pods.',
   'chat',
   'runpod_byo',
   'custom',
   'qwen3.8-flash-next',
   '{"tools": true, "vision": false, "json_mode": true, "streaming": true, "max_output": 65536, "context_window": 262144}'::jsonb,
   '{"input_cents_per_mtok": 70, "cached_cents_per_mtok": 13, "output_cents_per_mtok": 220}'::jsonb,
   null,
   true,
   false,
   237,
   true)
on conflict (model_id) do nothing;
