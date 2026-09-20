-- List price, standing discount, and strict per-model routing.
--
-- Pricing model from here on:
--   list_pricing   the reference price, OpenRouter's, synced from the admin
--                  panel; never charged directly
--   discount_pct   the standing discount off list, 0..100
--   pricing        what is charged = list × (1 − discount_pct/100), written
--                  by the panel whenever either of the above changes; the
--                  usage consumer bills from it and nothing else
--   openrouter_id  override for models whose OpenRouter id differs from ours
-- GET /v1/models publishes list, discount_percent and the charged price.
--
-- Routing from here on: a proxy model is served by exactly the partner in
-- upstream_provider. No cross-partner fallback. Models Starimg carries are
-- moved to 'starimg' so the traffic that was Starimg-first stays there.

begin;

alter table inference.models
  add column if not exists list_pricing  jsonb,
  add column if not exists discount_pct  numeric(5,2) not null default 0
    check (discount_pct >= 0 and discount_pct <= 100),
  add column if not exists openrouter_id text;

comment on column inference.models.list_pricing is
  'Reference (list) price, same shape as pricing; synced from OpenRouter by the admin panel. Not charged; pricing is.';
comment on column inference.models.discount_pct is
  'Standing discount off list_pricing, percent. pricing = list × (1 − discount_pct/100), maintained by the panel.';
comment on column inference.models.openrouter_id is
  'OpenRouter model id when it differs from model_id; null means model_id is used for the price sync.';

update inference.models
   set upstream_provider = 'starimg'
 where serving_type = 'proxy'
   and modality = 'chat'
   and upstream_provider = 'wokey'
   and provider_pricing ? 'starimg';

commit;
