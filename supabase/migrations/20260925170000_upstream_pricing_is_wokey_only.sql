-- models.upstream_pricing is Wokey's rate and nothing else.
--
-- The usage consumer (worker de4f0160, 2026-09-25) costs a request from the
-- serving partner's own provider_pricing entry; only a Wokey-served request
-- may fall back to upstream_pricing, and a request no partner served (our
-- own pods) records no cost basis at all. The column therefore has one
-- rightful owner.
--
-- Three catalog migrations (20260923070000, 20260924070000) seeded
-- upstream_pricing with the SAME figure as provider_pricing.starimg on
-- Starimg-only models. Billing was never wrong (their Starimg entry wins),
-- but the panel showed Starimg's number as Wokey's, and the day one of them
-- moves to our own pods it would have become the mis-costing that
-- zhipu/glm-5.3-derisked had. Cleared; the Starimg entries stay.

update inference.models
   set upstream_pricing = null
 where model_id in ('anthropic/claude-opus-5.5', 'openai/gpt-6-luna', 'openai/gpt-6-sol')
   and upstream_provider = 'starimg';

comment on column inference.models.upstream_pricing is
  'Wokey''s cost for this model, cents per million tokens (or per unit). Used only for Wokey-served requests without a provider_pricing.wokey entry. Every other partner''s cost lives in provider_pricing; our own pods have no per-token cost basis.';
