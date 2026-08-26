-- Make `ref` DNS-1123 safe by construction.
--
-- Refs name Kubernetes objects (Deployment, Service, Ingress) and appear in
-- hostnames. DNS-1123 permits lowercase alphanumerics and hyphens only — an
-- UNDERSCORE is invalid. gen_ref produced `dpl_9f6d095cc9`, so the first
-- database-driven deploy would have been rejected by the API server with an
-- error reading as a code bug rather than a naming rule.
--
-- Caught before anything depended on it. Only clusters and build_vms had refs,
-- and neither is used as an object name, so the rewrite is safe.

create or replace function paas.gen_ref(p_prefix text)
returns text language sql volatile as $$
  select p_prefix || '-' || encode(gen_random_bytes(6), 'hex');
$$;

comment on function paas.gen_ref is
  'Immutable, DNS-1123-safe identifier (e.g. dpl-9f3a2c1b4d5e). Hyphen, never underscore: refs name Kubernetes objects and appear in hostnames, and an underscore is invalid in both.';

alter table paas.clusters disable trigger clusters_ref_immutable;
alter table paas.build_vms disable trigger build_vms_ref_immutable;
update paas.clusters  set ref = replace(ref, '_', '-') where ref like '%\_%';
update paas.build_vms set ref = replace(ref, '_', '-') where ref like '%\_%';
alter table paas.clusters enable trigger clusters_ref_immutable;
alter table paas.build_vms enable trigger build_vms_ref_immutable;

-- Enforce the shape so it cannot regress.
alter table paas.projects     add constraint projects_ref_dns     check (ref ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');
alter table paas.deployments  add constraint deployments_ref_dns  check (ref ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');
alter table paas.aliases      add constraint aliases_ref_dns      check (ref ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');
alter table paas.environments add constraint environments_ref_dns check (ref ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');
