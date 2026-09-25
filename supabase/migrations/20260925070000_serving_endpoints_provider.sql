-- Provider per endpoint, not per model.
--
-- zhipu/glm-5.3-derisked is served by three partner API keys AND, from
-- 2026-09-25, a GPU server we operate (204.9.206.234:21601, SGLang,
-- GLM-5.3-DERISKED-FP8-FULL). The model-level upstream_provider cannot say
-- who answered a given request, so the usage row was stamped, and costed,
-- as the partner even when the pod answered. The endpoint row now carries
-- its own provider; null falls back to the model's. The gateway stamps
-- usage.provider from the endpoint that answered ('custom', our pods, is
-- stamped null as before), and the consumer costs it from provider_pricing.
-- The model's upstream_pricing goes back to null so pod-served rows take
-- the pod convention (no per-token cost basis), like the flash model.

begin;

alter table inference.serving_endpoints
  add column if not exists provider inference.byok_provider;

comment on column inference.serving_endpoints.provider is
  'Who answers at this endpoint: a partner (e.g. abliteration) or custom for a pod we operate. Null falls back to the model''s upstream_provider. Stamped on usage.provider (custom → null) and selects provider_pricing for the cost basis.';

update inference.serving_endpoints
   set provider = 'abliteration'
 where model_id = 'zhipu/glm-5.3-derisked'
   and base_url = 'https://api.abliteration.ai/v1';

update inference.models
   set upstream_pricing = null
 where model_id = 'zhipu/glm-5.3-derisked';

-- The HTTPS rule stays the default. The new server speaks plain HTTP on a
-- public IP and Harshit chose to add it anyway, so the exception is a
-- column the row has to set on purpose, not a dropped check.
alter table inference.serving_endpoints
  add column if not exists plaintext_ok boolean not null default false;

comment on column inference.serving_endpoints.plaintext_ok is
  'Explicit exception to the HTTPS rule: this endpoint is reached over plain HTTP and the operator accepts that prompts and answers cross the network unencrypted.';

alter table inference.serving_endpoints drop constraint if exists serving_endpoints_https;
alter table inference.serving_endpoints add constraint serving_endpoints_https
  check (base_url ~ '^https://[^/]+' or (plaintext_ok and base_url ~ '^http://[^/]+'));

commit;
