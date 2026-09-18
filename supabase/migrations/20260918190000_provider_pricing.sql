-- Upstream cost per partner.
--
-- models.upstream_pricing is one blob per model and was, until today, the
-- only partner's rate. With two partners the usage consumer must cost a
-- request by whoever served it (usage.provider), so this adds
-- provider_pricing: {"<provider>": <same shape as upstream_pricing>}.
-- The consumer picks provider_pricing[provider] and falls back to
-- upstream_pricing when the provider has no entry. Fractional cents are
-- fine; upstream cost is never shown to a customer.
--
-- Seeded with Starimg's rates as Harshit supplied them on 2026-09-18, in
-- cents per million tokens. He gave one figure per model, the price of a
-- million output tokens; input and cached are set to the same figure until
-- refined in the admin panel. Models Starimg does not carry get no entry.

begin;

alter table inference.models
  add column if not exists provider_pricing jsonb not null default '{}'::jsonb;

comment on column inference.models.provider_pricing is
  'Upstream cost per partner: {"starimg": {...}, "wokey": {...}}, same shape as upstream_pricing. The consumer picks by usage.provider and falls back to upstream_pricing.';

create or replace function inference.set_starimg_cost(p_model_id text, p_cents_per_mtok numeric)
returns void language sql as $$
  update inference.models
     set provider_pricing = provider_pricing || jsonb_build_object('starimg', jsonb_build_object(
           'input_cents_per_mtok',  p_cents_per_mtok,
           'cached_cents_per_mtok', p_cents_per_mtok,
           'output_cents_per_mtok', p_cents_per_mtok))
   where model_id = p_model_id;
$$;

select inference.set_starimg_cost('anthropic/claude-fable-5.1', 36);
select inference.set_starimg_cost('anthropic/claude-fable-5',   36);
select inference.set_starimg_cost('anthropic/claude-opus-5',    18);
select inference.set_starimg_cost('anthropic/claude-opus-4.8',  18);
select inference.set_starimg_cost('anthropic/claude-opus-4.7',  18);
select inference.set_starimg_cost('anthropic/claude-opus-4.6',  18);
select inference.set_starimg_cost('anthropic/claude-sonnet-5',  9);
select inference.set_starimg_cost('anthropic/claude-sonnet-4.6', 9);
select inference.set_starimg_cost('anthropic/claude-haiku-4.5', 4.05);
select inference.set_starimg_cost('openai/gpt-6-astra',         33.75);
select inference.set_starimg_cost('openai/gpt-5.6-terra',       6.75);
select inference.set_starimg_cost('openai/gpt-5.6-sol',         13.5);
select inference.set_starimg_cost('openai/gpt-5.5',             13.5);
select inference.set_starimg_cost('openai/gpt-5.6-luna',        1.485);
select inference.set_starimg_cost('x-ai/grok-4.6',              2.25);
select inference.set_starimg_cost('x-ai/grok-4.5',              2.25);
select inference.set_starimg_cost('deepseek/deepseek-v4-pro',   2.25);
select inference.set_starimg_cost('deepseek/deepseek-v4-flash', 0.45);
select inference.set_starimg_cost('moonshotai/kimi-k3',         11.25);
select inference.set_starimg_cost('moonshotai/kimi-k2.7-code',  4.05);
select inference.set_starimg_cost('zhipu/glm-5.3',              6.75);
select inference.set_starimg_cost('zhipu/glm-5.2',              6.75);
select inference.set_starimg_cost('minimax/minimax-m3',         2.025);

drop function inference.set_starimg_cost(text, numeric);

commit;
