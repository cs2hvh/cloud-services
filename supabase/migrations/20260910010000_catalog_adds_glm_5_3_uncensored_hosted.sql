-- Third self-served model: the full GLM 5.3, uncensored, on an AhuraSense-
-- rented pod. Served id glm-5.3-uncensored, context 1,048,576 as the pod
-- reports. PRICING IS A PLACEHOLDER equal to the partner-served GLM-5.3's
-- list price, to be set from the admin panel; upstream_pricing null because
-- the pod is hourly. The endpoint row with its credential is operator data,
-- inserted with the service role, never in a migration.
insert into inference.models
  (model_id, display_name, description, modality, serving_type, upstream_provider,
   upstream_model_id, capabilities, pricing, upstream_pricing, is_active, is_featured,
   sort_order, is_managed)
values
  ('zhipu/glm-5.3-uncensored',
   'Z.AI / GLM 5.3 Uncensored',
   'GLM 5.3 by Z.AI, uncensored, served on AhuraSense GPU pods.',
   'chat',
   'runpod_byo',
   'custom',
   'glm-5.3-uncensored',
   '{"tools": true, "vision": false, "json_mode": true, "streaming": true, "max_output": 131072, "context_window": 1048576}'::jsonb,
   '{"input_cents_per_mtok": 140, "cached_cents_per_mtok": 26, "output_cents_per_mtok": 440}'::jsonb,
   null,
   true,
   false,
   231,
   true)
on conflict (model_id) do nothing;
