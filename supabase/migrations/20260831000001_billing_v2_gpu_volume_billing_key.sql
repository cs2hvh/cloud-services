-- gpu_network_volumes is bigint-keyed and, unlike servers and gpu_pods, carried
-- no billing_service_id. billing.service_meters.service_id is a uuid, so a
-- network volume could not be metered at all — consistent with the audit
-- finding that network volumes have NEVER been billed: 4 volumes, 1,300 GB,
-- $113.75/month of revenue provisioned and then forgotten.
--
-- Adding the same column the other bigint-keyed resources already use, rather
-- than widening service_id to accept two key types.

alter table public.gpu_network_volumes
  add column if not exists billing_service_id uuid not null default gen_random_uuid();

create unique index if not exists gpu_network_volumes_billing_service_id_key
  on public.gpu_network_volumes (billing_service_id);

comment on column public.gpu_network_volumes.billing_service_id is
  'Stable uuid identity for billing.service_meters.service_id. Mirrors the same column on servers and gpu_pods.';
