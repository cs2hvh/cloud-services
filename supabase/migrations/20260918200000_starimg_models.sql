-- Thirteen chat models from Harshit's Starimg cost table that were not in
-- the catalog. Context and output limits are what Starimg reports for each.
--
-- upstream_provider says who carries the model:
--   'starimg'  only Starimg carries it; the gateway chain is Starimg alone
--   'wokey'    both partners carry it under the same bare id; the chain
--              applies (Starimg first, Wokey fallback)
-- deepseek-v4.1-flash is on Wokey too, but as "deepseek-flash", a different
-- bare id; one model has one upstream id here, so it is Starimg-only.
--
-- provider_pricing.starimg is Harshit's figure (cents per million tokens,
-- his per-million-output figure applied to input and cached as well).
-- upstream_pricing is Wokey's rate where Wokey carries the model.
-- Customer prices are PLACEHOLDERS at five times Starimg's cost, cached at a
-- tenth of input, to be set from the admin panel.
--
-- Note zhipu/glm-5.3-flash: this is Z.AI's official GLM 5.3 Flash, partner
-- served. The hosted uncensored build is zhipu/glm-5.3-flash-derisked (its
-- 2026-09-08 id was zhipu/glm-5.3-flash, never aliased).

begin;

insert into inference.models
  (model_id, display_name, description, modality, serving_type, upstream_provider,
   upstream_model_id, capabilities, pricing, upstream_pricing, provider_pricing,
   is_active, is_featured, sort_order, is_managed)
values
  ('google/gemini-3.8-flash', 'Google / Gemini 3.8 Flash', 'Gemini 3.8 Flash. 1M context.', 'chat', 'proxy', 'starimg', 'gemini-3.8-flash',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1048576,"max_output":65536}'::jsonb,
   '{"input_cents_per_mtok":45,"cached_cents_per_mtok":4.5,"output_cents_per_mtok":45}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":9,"cached_cents_per_mtok":9,"output_cents_per_mtok":9}}'::jsonb, true, false, 300, false),
  ('google/gemini-3.7-flash', 'Google / Gemini 3.7 Flash', 'Gemini 3.7 Flash. 1M context.', 'chat', 'proxy', 'starimg', 'gemini-3.7-flash',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1048576,"max_output":65536}'::jsonb,
   '{"input_cents_per_mtok":45,"cached_cents_per_mtok":4.5,"output_cents_per_mtok":45}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":9,"cached_cents_per_mtok":9,"output_cents_per_mtok":9}}'::jsonb, true, false, 301, false),
  ('google/gemini-3.6-flash', 'Google / Gemini 3.6 Flash', 'Gemini 3.6 Flash. 1M context.', 'chat', 'proxy', 'starimg', 'gemini-3.6-flash',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1048576,"max_output":65536}'::jsonb,
   '{"input_cents_per_mtok":45,"cached_cents_per_mtok":4.5,"output_cents_per_mtok":45}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":9,"cached_cents_per_mtok":9,"output_cents_per_mtok":9}}'::jsonb, true, false, 302, false),
  ('google/gemini-3.1-pro', 'Google / Gemini 3.1 Pro', 'Gemini 3.1 Pro. 1M context.', 'chat', 'proxy', 'starimg', 'gemini-3.1-pro',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1048576,"max_output":65536}'::jsonb,
   '{"input_cents_per_mtok":45,"cached_cents_per_mtok":4.5,"output_cents_per_mtok":45}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":9,"cached_cents_per_mtok":9,"output_cents_per_mtok":9}}'::jsonb, true, false, 303, false),
  ('cursor/composer-2.5-fast', 'Cursor / Composer 2.5 Fast', 'Composer 2.5 Fast. 200K context, built for coding agents.', 'chat', 'proxy', 'starimg', 'composer-2.5-fast',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":200000}'::jsonb,
   '{"input_cents_per_mtok":6.75,"cached_cents_per_mtok":0.68,"output_cents_per_mtok":6.75}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":1.35,"cached_cents_per_mtok":1.35,"output_cents_per_mtok":1.35}}'::jsonb, true, false, 304, false),
  ('qwen/qwen3.8-max', 'Qwen / Qwen3.8 Max', 'Qwen3.8 Max. 1M context.', 'chat', 'proxy', 'starimg', 'qwen3.8-max',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":131072}'::jsonb,
   '{"input_cents_per_mtok":67.5,"cached_cents_per_mtok":6.75,"output_cents_per_mtok":67.5}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":13.5,"cached_cents_per_mtok":13.5,"output_cents_per_mtok":13.5}}'::jsonb, true, false, 305, false),
  ('qwen/qwen3.8-flash', 'Qwen / Qwen3.8 Flash', 'Qwen3.8 Flash. 1M context.', 'chat', 'proxy', 'starimg', 'qwen3.8-flash',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":131072}'::jsonb,
   '{"input_cents_per_mtok":22.5,"cached_cents_per_mtok":2.25,"output_cents_per_mtok":22.5}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":4.5,"cached_cents_per_mtok":4.5,"output_cents_per_mtok":4.5}}'::jsonb, true, false, 306, false),
  ('tencent/hy4-preview', 'Tencent / Hy4 Preview', 'Hunyuan 4 preview. 1M context.', 'chat', 'proxy', 'wokey', 'hy4-preview',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1048576,"max_output":64000}'::jsonb,
   '{"input_cents_per_mtok":22.5,"cached_cents_per_mtok":2.25,"output_cents_per_mtok":22.5}'::jsonb,
   '{"input_cents_per_mtok":41.7,"cached_cents_per_mtok":2.1,"output_cents_per_mtok":125.05}'::jsonb,
   '{"starimg":{"input_cents_per_mtok":4.5,"cached_cents_per_mtok":4.5,"output_cents_per_mtok":4.5}}'::jsonb, true, false, 307, false),
  ('xiaomi/mimo-v2.5-pro', 'Xiaomi / MiMo V2.5 Pro', 'MiMo V2.5 Pro. 1M context.', 'chat', 'proxy', 'starimg', 'mimo-v2.5-pro',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1048576,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":6.75,"cached_cents_per_mtok":0.68,"output_cents_per_mtok":6.75}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":1.35,"cached_cents_per_mtok":1.35,"output_cents_per_mtok":1.35}}'::jsonb, true, false, 308, false),
  ('xiaomi/mimo-v2.5', 'Xiaomi / MiMo V2.5', 'MiMo V2.5. 1M context, the economical tier.', 'chat', 'proxy', 'starimg', 'mimo-v2.5',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":32000}'::jsonb,
   '{"input_cents_per_mtok":1.13,"cached_cents_per_mtok":0.11,"output_cents_per_mtok":1.13}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":0.225,"cached_cents_per_mtok":0.225,"output_cents_per_mtok":0.225}}'::jsonb, true, false, 309, false),
  ('zhipu/glm-5-turbo', 'Z.AI / GLM 5 Turbo', 'GLM 5 Turbo. 200K context.', 'chat', 'proxy', 'starimg', 'glm-5-turbo',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":202752,"max_output":131072}'::jsonb,
   '{"input_cents_per_mtok":22.5,"cached_cents_per_mtok":2.25,"output_cents_per_mtok":22.5}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":4.5,"cached_cents_per_mtok":4.5,"output_cents_per_mtok":4.5}}'::jsonb, true, false, 310, false),
  ('deepseek/deepseek-v4.1-flash', 'DeepSeek / DeepSeek V4.1 Flash', 'DeepSeek V4.1 Flash. 1M context, very long outputs.', 'chat', 'proxy', 'starimg', 'deepseek-v4.1-flash',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1048576,"max_output":393216}'::jsonb,
   '{"input_cents_per_mtok":6.75,"cached_cents_per_mtok":0.68,"output_cents_per_mtok":6.75}'::jsonb, null,
   '{"starimg":{"input_cents_per_mtok":1.35,"cached_cents_per_mtok":1.35,"output_cents_per_mtok":1.35}}'::jsonb, true, false, 311, false),
  ('zhipu/glm-5.3-flash', 'Z.AI / GLM 5.3 Flash', 'GLM 5.3 Flash, the official build. 1M context.', 'chat', 'proxy', 'wokey', 'glm-5.3-flash',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1048576,"max_output":131072}'::jsonb,
   '{"input_cents_per_mtok":6.75,"cached_cents_per_mtok":0.68,"output_cents_per_mtok":6.75}'::jsonb,
   '{"input_cents_per_mtok":7.5,"cached_cents_per_mtok":1.5,"output_cents_per_mtok":25}'::jsonb,
   '{"starimg":{"input_cents_per_mtok":1.35,"cached_cents_per_mtok":1.35,"output_cents_per_mtok":1.35}}'::jsonb, true, false, 312, false)
on conflict (model_id) do nothing;

commit;
