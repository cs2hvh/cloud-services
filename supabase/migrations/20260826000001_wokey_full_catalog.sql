-- Wokey migration, part 3: full catalog sync.
--
-- Replaces the chat catalog with Wokey's complete available model set, taken
-- from two live endpoints on 2026-08-26:
--
--   GET /api/models                                  -> ids, display names,
--                                                       context windows, max
--                                                       output tokens
--   GET /api/models/pricing?output_modalities=text,image
--                                                    -> per-SKU prices, both
--                                                       Wokey's own price and
--                                                       the vendor list price
--
-- NOTE on those endpoints: they are the Wokey *site's* internal API, not the
-- documented /v1 surface. /v1/models carries no pricing at all. They may
-- change without notice, so the admin sync built on them must fail loudly
-- rather than silently write nulls.
--
-- WHAT IS SET, AND WHY
-- --------------------
-- upstream_pricing = what Wokey charges us. Previously these rows carried
--   OpenRouter's rates (claude-haiku-4.5 recorded 100/500 cents when Wokey
--   charges 20/100), which would have understated cost and overstated margin
--   in every report built on inference.usage.upstream_cost_cents.
--
-- pricing = the vendor's official list price (reference_price_usd), NOT a
--   markup on Wokey's cost. This is a deliberate placeholder chosen because
--   it is the one defensible number available without a pricing policy: a
--   customer pays what they would pay OpenAI/Anthropic/xAI directly, and the
--   margin is exactly Wokey's discount. Operators set the real price per
--   model from the admin panel; this is the starting point, not the answer.
--
-- Public model_id keeps the namespaced convention (anthropic/claude-opus-5)
-- and upstream_model_id carries Wokey's bare id (claude-opus-5). Verified:
-- sending a namespaced id upstream returns 404 model_not_found.
--
-- vision=false throughout because Wokey reports input_modalities:["text"] for
-- every one of these. That is their declaration, not an assumption of ours.
--
-- Two cache-read list prices (grok-4.3, grok-4.5) are absent upstream; they
-- are derived at that model's own input list/cost ratio (5x) and flagged
-- below. Everything else is verbatim.
--
-- gpt-5.5-pro, gpt-5.4-pro and gpt-5.4-nano are deliberately EXCLUDED: they
-- appear in /v1/models but have no pricing entry, and listing a model that
-- cannot be billed correctly is a revenue hole.

BEGIN;

INSERT INTO inference.models (
  model_id, display_name, modality, serving_type, upstream_model_id,
  capabilities, pricing, upstream_pricing, is_active, is_featured, sort_order
) VALUES
  ('anthropic/claude-opus-5', 'Claude Opus 5', 'chat', 'proxy', 'claude-opus-5',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":500,"output_cents_per_mtok":2500,"cached_cents_per_mtok":50}'::jsonb,
   '{"input_cents_per_mtok":110,"output_cents_per_mtok":550,"cached_cents_per_mtok":11}'::jsonb,
   TRUE, TRUE, 10),
  ('anthropic/claude-opus-4.8', 'Claude Opus 4.8', 'chat', 'proxy', 'claude-opus-4-8',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":500,"output_cents_per_mtok":2500,"cached_cents_per_mtok":50}'::jsonb,
   '{"input_cents_per_mtok":110,"output_cents_per_mtok":550,"cached_cents_per_mtok":11}'::jsonb,
   TRUE, FALSE, 20),
  ('anthropic/claude-opus-4.7', 'Claude Opus 4.7', 'chat', 'proxy', 'claude-opus-4-7',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":500,"output_cents_per_mtok":2500,"cached_cents_per_mtok":50}'::jsonb,
   '{"input_cents_per_mtok":110,"output_cents_per_mtok":550,"cached_cents_per_mtok":11}'::jsonb,
   TRUE, FALSE, 30),
  ('anthropic/claude-opus-4.6', 'Claude Opus 4.6', 'chat', 'proxy', 'claude-opus-4-6',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":500,"output_cents_per_mtok":2500,"cached_cents_per_mtok":50}'::jsonb,
   '{"input_cents_per_mtok":110,"output_cents_per_mtok":550,"cached_cents_per_mtok":11}'::jsonb,
   TRUE, FALSE, 40),
  ('anthropic/claude-sonnet-5', 'Claude Sonnet 5', 'chat', 'proxy', 'claude-sonnet-5',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":200,"output_cents_per_mtok":1000,"cached_cents_per_mtok":20}'::jsonb,
   '{"input_cents_per_mtok":36,"output_cents_per_mtok":180,"cached_cents_per_mtok":3.6}'::jsonb,
   TRUE, TRUE, 50),
  ('anthropic/claude-sonnet-4.6', 'Claude Sonnet 4.6', 'chat', 'proxy', 'claude-sonnet-4-6',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":64000}'::jsonb,
   '{"input_cents_per_mtok":300,"output_cents_per_mtok":1500,"cached_cents_per_mtok":30}'::jsonb,
   '{"input_cents_per_mtok":54,"output_cents_per_mtok":270,"cached_cents_per_mtok":5.4}'::jsonb,
   TRUE, FALSE, 60),
  ('anthropic/claude-sonnet-4.5', 'Claude Sonnet 4.5', 'chat', 'proxy', 'claude-sonnet-4-5',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":200000,"max_output":64000}'::jsonb,
   '{"input_cents_per_mtok":300,"output_cents_per_mtok":1500,"cached_cents_per_mtok":30}'::jsonb,
   '{"input_cents_per_mtok":54,"output_cents_per_mtok":270,"cached_cents_per_mtok":5.4}'::jsonb,
   TRUE, FALSE, 70),
  ('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5', 'chat', 'proxy', 'claude-haiku-4-5',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":200000,"max_output":64000}'::jsonb,
   '{"input_cents_per_mtok":100,"output_cents_per_mtok":500,"cached_cents_per_mtok":10}'::jsonb,
   '{"input_cents_per_mtok":20,"output_cents_per_mtok":100,"cached_cents_per_mtok":2}'::jsonb,
   TRUE, TRUE, 80),
  ('anthropic/claude-fable-5', 'Claude Fable 5', 'chat', 'proxy', 'claude-fable-5',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":1000,"output_cents_per_mtok":5000,"cached_cents_per_mtok":100}'::jsonb,
   '{"input_cents_per_mtok":230,"output_cents_per_mtok":1150,"cached_cents_per_mtok":23}'::jsonb,
   TRUE, FALSE, 90),
  ('openai/gpt-5.6-sol', 'GPT-5.6 Sol', 'chat', 'proxy', 'gpt-5.6-sol',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1050000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":500,"output_cents_per_mtok":3000,"cached_cents_per_mtok":50}'::jsonb,
   '{"input_cents_per_mtok":50,"output_cents_per_mtok":300,"cached_cents_per_mtok":5}'::jsonb,
   TRUE, TRUE, 100),
  ('openai/gpt-5.6-terra', 'GPT-5.6 Terra', 'chat', 'proxy', 'gpt-5.6-terra',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1050000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":200,"output_cents_per_mtok":1200,"cached_cents_per_mtok":20}'::jsonb,
   '{"input_cents_per_mtok":20,"output_cents_per_mtok":120,"cached_cents_per_mtok":2}'::jsonb,
   TRUE, FALSE, 110),
  ('openai/gpt-5.6-luna', 'GPT-5.6 Luna', 'chat', 'proxy', 'gpt-5.6-luna',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1050000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":20,"output_cents_per_mtok":120,"cached_cents_per_mtok":2}'::jsonb,
   '{"input_cents_per_mtok":12,"output_cents_per_mtok":72,"cached_cents_per_mtok":1.2}'::jsonb,
   TRUE, FALSE, 120),
  ('openai/gpt-5.5', 'GPT-5.5', 'chat', 'proxy', 'gpt-5.5',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1050000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":500,"output_cents_per_mtok":3000,"cached_cents_per_mtok":50}'::jsonb,
   '{"input_cents_per_mtok":50,"output_cents_per_mtok":300,"cached_cents_per_mtok":5}'::jsonb,
   TRUE, FALSE, 130),
  ('openai/gpt-5.4', 'GPT-5.4', 'chat', 'proxy', 'gpt-5.4',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1050000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":250,"output_cents_per_mtok":1500,"cached_cents_per_mtok":25}'::jsonb,
   '{"input_cents_per_mtok":25,"output_cents_per_mtok":150,"cached_cents_per_mtok":2.5}'::jsonb,
   TRUE, FALSE, 140),
  ('openai/gpt-5.4-mini', 'GPT-5.4 mini', 'chat', 'proxy', 'gpt-5.4-mini',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":400000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":75,"output_cents_per_mtok":450,"cached_cents_per_mtok":7.5}'::jsonb,
   '{"input_cents_per_mtok":15,"output_cents_per_mtok":90,"cached_cents_per_mtok":1.5}'::jsonb,
   TRUE, FALSE, 150),
  ('openai/gpt-5.3-codex', 'GPT-5.3 Codex', 'chat', 'proxy', 'gpt-5.3-codex',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":400000,"max_output":128000}'::jsonb,
   '{"input_cents_per_mtok":175,"output_cents_per_mtok":1400,"cached_cents_per_mtok":17.5}'::jsonb,
   '{"input_cents_per_mtok":8.75,"output_cents_per_mtok":70,"cached_cents_per_mtok":0.875}'::jsonb,
   TRUE, FALSE, 160),
  ('x-ai/grok-4.6', 'Grok 4.6', 'chat', 'proxy', 'grok-4.6',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":500000,"max_output":500000}'::jsonb,
   '{"input_cents_per_mtok":200,"output_cents_per_mtok":600,"cached_cents_per_mtok":50}'::jsonb,
   '{"input_cents_per_mtok":40,"output_cents_per_mtok":120,"cached_cents_per_mtok":10}'::jsonb,
   TRUE, TRUE, 170),
  ('x-ai/grok-4.5', 'Grok 4.5', 'chat', 'proxy', 'grok-4.5',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":500000,"max_output":64000}'::jsonb,
   '{"input_cents_per_mtok":200,"output_cents_per_mtok":600,"cached_cents_per_mtok":20}'::jsonb,
   '{"input_cents_per_mtok":40,"output_cents_per_mtok":120,"cached_cents_per_mtok":4}'::jsonb,
   TRUE, FALSE, 180),
  ('x-ai/grok-4.3', 'Grok 4.3', 'chat', 'proxy', 'grok-4.3',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":256000,"max_output":64000}'::jsonb,
   '{"input_cents_per_mtok":125,"output_cents_per_mtok":250,"cached_cents_per_mtok":12.5}'::jsonb,
   '{"input_cents_per_mtok":25,"output_cents_per_mtok":50,"cached_cents_per_mtok":2.5}'::jsonb,
   TRUE, FALSE, 190),
  ('moonshotai/kimi-k3', 'Kimi K3', 'chat', 'proxy', 'kimi-k3',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1048576,"max_output":1048576}'::jsonb,
   '{"input_cents_per_mtok":300,"output_cents_per_mtok":1500,"cached_cents_per_mtok":30}'::jsonb,
   '{"input_cents_per_mtok":90,"output_cents_per_mtok":450,"cached_cents_per_mtok":9}'::jsonb,
   TRUE, TRUE, 200),
  ('moonshotai/kimi-k2.7-code', 'Kimi K2.7 Code', 'chat', 'proxy', 'kimi-k2.7-code',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":262144,"max_output":32768}'::jsonb,
   '{"input_cents_per_mtok":95,"output_cents_per_mtok":400,"cached_cents_per_mtok":19}'::jsonb,
   '{"input_cents_per_mtok":28.5,"output_cents_per_mtok":120,"cached_cents_per_mtok":5.7}'::jsonb,
   TRUE, FALSE, 210),
  ('moonshotai/kimi-k2.6', 'Kimi K2.6', 'chat', 'proxy', 'kimi-k2.6',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":256000,"max_output":64000}'::jsonb,
   '{"input_cents_per_mtok":95,"output_cents_per_mtok":400,"cached_cents_per_mtok":16}'::jsonb,
   '{"input_cents_per_mtok":19,"output_cents_per_mtok":80,"cached_cents_per_mtok":3.2}'::jsonb,
   TRUE, FALSE, 220),
  ('zhipu/glm-5.3', 'GLM-5.3', 'chat', 'proxy', 'glm-5.3',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":131072}'::jsonb,
   '{"input_cents_per_mtok":140,"output_cents_per_mtok":440,"cached_cents_per_mtok":26}'::jsonb,
   '{"input_cents_per_mtok":56,"output_cents_per_mtok":176,"cached_cents_per_mtok":10.4}'::jsonb,
   TRUE, TRUE, 230),
  ('zhipu/glm-5.2', 'GLM-5.2', 'chat', 'proxy', 'glm-5.2',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":131072}'::jsonb,
   '{"input_cents_per_mtok":140,"output_cents_per_mtok":440,"cached_cents_per_mtok":26}'::jsonb,
   '{"input_cents_per_mtok":56,"output_cents_per_mtok":176,"cached_cents_per_mtok":10.4}'::jsonb,
   TRUE, FALSE, 240),
  ('zhipu/glm-5.1', 'GLM-5.1', 'chat', 'proxy', 'glm-5.1',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":128000,"max_output":64000}'::jsonb,
   '{"input_cents_per_mtok":140,"output_cents_per_mtok":440,"cached_cents_per_mtok":26}'::jsonb,
   '{"input_cents_per_mtok":42,"output_cents_per_mtok":132,"cached_cents_per_mtok":7.8}'::jsonb,
   TRUE, FALSE, 250),
  ('deepseek/deepseek-v4-pro', 'DeepSeek V4 Pro', 'chat', 'proxy', 'deepseek-v4-pro',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":384000}'::jsonb,
   '{"input_cents_per_mtok":132,"output_cents_per_mtok":396,"cached_cents_per_mtok":4.4}'::jsonb,
   '{"input_cents_per_mtok":66,"output_cents_per_mtok":198,"cached_cents_per_mtok":2.2}'::jsonb,
   TRUE, TRUE, 260),
  ('deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash', 'chat', 'proxy', 'deepseek-v4-flash',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":384000}'::jsonb,
   '{"input_cents_per_mtok":44,"output_cents_per_mtok":132,"cached_cents_per_mtok":1.4}'::jsonb,
   '{"input_cents_per_mtok":22,"output_cents_per_mtok":66,"cached_cents_per_mtok":0.7}'::jsonb,
   TRUE, FALSE, 270),
  ('bytedance/doubao-seed-2.1-turbo', 'Doubao Seed 2.1 Turbo', 'chat', 'proxy', 'doubao-seed-2.1-turbo',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":256000,"max_output":256000}'::jsonb,
   '{"input_cents_per_mtok":43.125,"output_cents_per_mtok":215.625,"cached_cents_per_mtok":8.625}'::jsonb,
   '{"input_cents_per_mtok":8.625,"output_cents_per_mtok":43.125,"cached_cents_per_mtok":1.725}'::jsonb,
   TRUE, FALSE, 280),
  ('minimax/minimax-m3', 'MiniMax M3', 'chat', 'proxy', 'MiniMax-M3',
   '{"tools":true,"vision":false,"json_mode":true,"streaming":true,"context_window":1000000,"max_output":80000}'::jsonb,
   '{"input_cents_per_mtok":45,"output_cents_per_mtok":180,"cached_cents_per_mtok":9}'::jsonb,
   '{"input_cents_per_mtok":9,"output_cents_per_mtok":36,"cached_cents_per_mtok":1.8}'::jsonb,
   TRUE, FALSE, 290)
ON CONFLICT (model_id) DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  upstream_model_id = EXCLUDED.upstream_model_id,
  capabilities      = EXCLUDED.capabilities,
  pricing           = EXCLUDED.pricing,
  upstream_pricing  = EXCLUDED.upstream_pricing,
  is_active         = TRUE,
  is_featured       = EXCLUDED.is_featured,
  sort_order        = EXCLUDED.sort_order,
  updated_at        = NOW();

-- Anything else still on the shared upstream is not something Wokey serves.
-- Delist rather than leave it pointing at an upstream that returns 404.
-- Wokey ids are bare (no slash); our legacy rows still carry namespaced
-- upstream ids, which is exactly what distinguishes them.
UPDATE inference.models
   SET is_active = FALSE, updated_at = NOW()
 WHERE serving_type = 'proxy'
   AND modality = 'chat'
   AND is_active = TRUE
   AND (upstream_model_id IS NULL OR upstream_model_id LIKE '%/%');

COMMIT;
