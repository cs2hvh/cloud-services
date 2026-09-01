-- The plan catalog — what exists, separate from what it costs.
--
-- WHY THIS IS NEEDED, and it is a gap I created
--
-- public.products and public.instance_plans were dropped as "pricing tables".
-- They were not only pricing tables. They also carried the plan DEFINITIONS —
-- slug, display name, vCPU/RAM/disk, provider size mapping — that provisioning
-- flows render and that billing.service_pricing.plan_key references. Dropping
-- them left plan_key pointing at identifiers nothing defines, and left the
-- admin panel unable to build a price-book UI because a price row needs a plan
-- to attach to. Caught by the admin-panel lane, not by me.
--
-- WHY public AND NOT billing
--
-- A catalog is a product concern, not a billing one. Provisioning needs to know
-- which sizes exist and how they map to a provider, and it should not have to
-- reach into the billing schema to find out — that would make deploying a
-- server depend on the billing layer. billing.service_pricing references
-- plan_key logically from the other direction, which is the right way round:
-- the price book prices the catalog, the catalog knows nothing about money.
--
-- NO PRICE COLUMNS, DELIBERATELY
--
-- The single defect behind this entire rebuild is a price stored in a column
-- whose unit was implicit. Putting a price back on the catalog would recreate
-- exactly the drift that already exists between instance_plans.hourly_usd and
-- instance_plans.monthly_usd, which disagree today: a-1 is $0.01/hr (= $7.20/mo)
-- while advertising $7.00/mo. One price, one place: billing.service_pricing.
--
-- RECOVERED 2026-09-01 from supabase_migrations.schema_migrations (version
-- 20260831083039). Applied to production 2026-08-31; the file was never
-- written.
--
-- NOTE ON REPRODUCIBILITY: the INSERTs below read pricing_archive_20260831,
-- a dated archive schema. On a database rebuilt from scratch that schema does
-- not exist and those statements fail. The CREATE TABLE and the flat-rate '*'
-- rows are the parts that must survive; the archive backfill is history.

create table if not exists public.service_plans (
  id            uuid primary key default gen_random_uuid(),

  -- Together these are what billing.service_pricing.plan_key resolves against.
  service_type  text not null,
  plan_key      text not null,

  display_name  text not null,
  description   text,
  tier          text,

  -- Specs, nullable because not every service has all of them (an object
  -- storage bucket has no vCPU count).
  vcpu          integer,
  memory_mb     integer,
  disk_gb       integer,

  -- How this maps upstream: a Linode type id, a RunPod gpu id, a provider size
  -- slug. Free-form because each provider names things its own way.
  provider      text,
  provider_size text,

  -- Where it may be deployed. Empty array = anywhere.
  allowed_regions text[] not null default '{}',

  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  metadata      jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint service_plans_unique_key unique (service_type, plan_key)
);

create index if not exists service_plans_active
  on public.service_plans (service_type, sort_order) where is_active;

comment on table public.service_plans is
  'What plans exist and what they contain. Carries NO price — see billing.service_pricing. Restored from pricing_archive_20260831 after products/instance_plans were dropped.';

-- ── Repopulate from the archive, not from invention ──────────────────────

-- compute: plan_key is the instance_plans slug, which is what servers.plan_slug
-- holds (after normalizePlanKey strips any `linode:` prefix).
insert into public.service_plans
  (service_type, plan_key, display_name, tier, vcpu, memory_mb, disk_gb, is_active, sort_order, allowed_regions)
select 'compute', p.slug, p.name, p.tier, p.vcpu, p.memory_mb, p.disk_gb,
       coalesce(p.is_active, true), coalesce(p.sort_order, 0),
       coalesce(p.allowed_regions, '{}')
from pricing_archive_20260831.instance_plans p
on conflict (service_type, plan_key) do nothing;

-- database + kubernetes: plan_key is products.id, because getRatesForDatabase
-- and getRatesForKubernetes both look the plan up by id.
insert into public.service_plans
  (service_type, plan_key, display_name, description, tier, is_active, metadata)
select 'database', p.id::text, p.name, p.description, p.sub, true,
       jsonb_build_object('engine', p.sub, 'specs', p.specs, 'resources', p.resources)
from pricing_archive_20260831.products p
where p.type = 'database'
on conflict (service_type, plan_key) do nothing;

insert into public.service_plans
  (service_type, plan_key, display_name, description, is_active, metadata)
select 'kubernetes', p.id::text, p.name, p.description, true,
       jsonb_build_object('specs', p.specs, 'resources', p.resources)
from pricing_archive_20260831.products p
where p.type = 'kubernetes'
on conflict (service_type, plan_key) do nothing;

-- platform_apps: plan_key is the size (small/medium/large/xlarge/xxlarge).
insert into public.service_plans
  (service_type, plan_key, display_name, description, is_active, metadata)
select 'platform_apps', p.sub, p.name, p.description, true,
       jsonb_build_object('specs', p.specs, 'resources', p.resources)
from pricing_archive_20260831.products p
where p.type = 'platform-apps' and p.sub is not null
on conflict (service_type, plan_key) do nothing;

-- Flat-priced services: one '*' row each, so the catalog can answer "what can
-- be priced?" uniformly instead of the UI special-casing their absence.
insert into public.service_plans (service_type, plan_key, display_name, description)
values
  ('objectspace',      '*', 'Object Storage',       'Single flat rate per bucket'),
  ('spectrum',         '*', 'DDoS Protection',      'Single flat rate per app'),
  ('inference_vector', '*', 'Vector Store',         'Single flat rate per collection'),
  ('custom_image',     '*', 'Custom Image Storage', 'Priced per GB stored'),
  ('gpu_pod',          '*', 'GPU Pod',              'Markup over the live upstream GPU price'),
  ('gpu_pod_storage',  '*', 'GPU Pod Storage',      'Pod local disk, priced per GB'),
  ('gpu_volume',       '*', 'GPU Network Volume',   'Network volume, priced per GB')
on conflict (service_type, plan_key) do nothing;

grant select on public.service_plans to service_role, authenticated;
grant insert, update on public.service_plans to service_role;
