-- Models the platform serves itself, on more than one endpoint.
--
-- Until now a non-proxy model had exactly one place to go: models.serving_url,
-- with no credential and a served-model-name hardwired to "adapter", because
-- the only such models were fine-tune outputs on pods the controller started.
-- The first model Wokey does not carry, GLM-5.3 Flash, arrives as two RunPod
-- SGLang pods behind one bearer key, and none of those three assumptions hold.
--
-- inference.serving_endpoints is the answer: any number of base URLs per
-- model, each with its own credential (AES-GCM under BYOK_DEK, the envelope
-- customer BYOK keys already use; decrypted only at forward time by the edge
-- worker) and its own served-model-name and weight. The worker tries them in
-- weighted order and fails over on 5xx or a network error
-- (workers/inference/src/lib/model-routing.ts). serving_url keeps working for
-- the fine-tune pods; a model with endpoint rows ignores it.
--
-- Service-role only, like every inference table since 20260906065500: the
-- rows hold credential ciphertext and the worker is their only reader.
-- Endpoint rows themselves are operator data and are NOT in this file, because
-- a migration must never carry a secret, even encrypted. Add one with the
-- service role:
--
--   insert into inference.serving_endpoints (model_id, base_url, api_key_ct, label)
--   values ('zhipu/glm-5.3-flash', 'https://<pod>.proxy.runpod.net/v1', '\x…', 'runpod pod A');
--
-- where the ciphertext comes from lib/inference/crypto.ts encryptAesGcm under
-- the same BYOK_DEK the worker holds.

create table if not exists inference.serving_endpoints (
  id                uuid primary key default gen_random_uuid(),
  model_id          text not null references inference.models(model_id) on delete cascade,
  base_url          text not null,
  -- AES-GCM ciphertext of the bearer key under BYOK_DEK. Null: no credential.
  api_key_ct        bytea,
  -- Overrides models.upstream_model_id as the outgoing `model` for this endpoint.
  served_model_name text,
  weight            integer not null default 1,
  enabled           boolean not null default true,
  label             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint serving_endpoints_https  check (base_url ~ '^https://[^/]+'),
  constraint serving_endpoints_weight check (weight > 0),
  constraint serving_endpoints_one_per_url unique (model_id, base_url)
);

comment on table inference.serving_endpoints is
  'Where the edge worker sends a self-served model: one row per replica, with its own credential ciphertext (BYOK_DEK), served-model-name and weight. Service-role only.';

create index if not exists serving_endpoints_model_enabled_idx
  on inference.serving_endpoints (model_id) where enabled;

alter table inference.serving_endpoints enable row level security;
revoke all on inference.serving_endpoints from anon, authenticated, public;
grant select, insert, update, delete on inference.serving_endpoints to service_role;

-- The model itself. Public id keeps the namespaced convention of the catalog;
-- upstream_model_id is what the pods answer to (their /v1/models says
-- "glm-5.3-flash", max_model_len 1,048,576). serving_type runpod_byo puts it
-- on the managed path; upstream_provider 'custom' because the byok_provider
-- enum has no value for a pod we rent, and the column is informational.
--
-- PRICING IS A PLACEHOLDER: half of zhipu/glm-5.3's list price, to be set by
-- hand. upstream_pricing is null on purpose: the pods cost by the hour, not by
-- the token, so the usage consumer records the billed amount as the cost
-- basis until a real per-token cost is decided.
insert into inference.models
  (model_id, display_name, description, modality, serving_type, upstream_provider,
   upstream_model_id, capabilities, pricing, upstream_pricing, is_active, is_featured,
   sort_order, is_managed)
values
  ('zhipu/glm-5.3-flash',
   'GLM-5.3 Flash',
   'GLM-5.3 Flash served on AhuraCloud GPU pods.',
   'chat',
   'runpod_byo',
   'custom',
   'glm-5.3-flash',
   '{"tools": true, "vision": false, "json_mode": true, "streaming": true, "max_output": 131072, "context_window": 1048576}'::jsonb,
   '{"input_cents_per_mtok": 70, "cached_cents_per_mtok": 13, "output_cents_per_mtok": 220}'::jsonb,
   null,
   true,
   false,
   235,
   true)
on conflict (model_id) do nothing;
