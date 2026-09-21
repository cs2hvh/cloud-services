-- A third partner, and the first one reached through serving_endpoints
-- rather than the proxy chain.
--
-- zhipu/glm-5.3-derisked left the RunPod pods on 2026-09-21 and is served
-- through three API keys of one partner (abliteration.ai), each a
-- serving_endpoints row on the same base URL. Its routing stays
-- serving_type = 'runpod_byo' (the endpoints mechanism: weighted spread,
-- 429/5xx failover, per-row health probe), but its provider is no longer
-- 'custom' (our own pods): it is the partner, so the admin panel shows it
-- as one, usage rows are stamped with it, and provider_pricing carries its
-- real cost the same way as for starimg and wokey.
--
-- Run outside a transaction: ADD VALUE cannot be used in the same
-- transaction as a statement that uses the new value.

alter type inference.byok_provider add value if not exists 'abliteration';

update inference.models
   set upstream_provider = 'abliteration',
       provider_pricing = coalesce(provider_pricing, '{}'::jsonb)
         || '{"abliteration": {"input_cents_per_mtok": 300, "cached_cents_per_mtok": 30, "output_cents_per_mtok": 500}}'::jsonb
 where model_id = 'zhipu/glm-5.3-derisked';
