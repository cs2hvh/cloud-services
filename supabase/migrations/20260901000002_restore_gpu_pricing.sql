-- Restore public.gpu_pricing. Dropping it broke GPU pod creation outright.
--
-- gpu_pricing was dropped on 2026-08-31 while retiring the v1 pricing tables,
-- on the reasoning that billing.service_pricing replaces it. That is true for
-- BILLING — the hourly sweep prices a running pod from the new price book — and
-- false for PROVISIONING: podLifecycleOperations.createPod reads gpu_pricing to
-- compute the hourly rate it FREEZES on the pod at checkout, and throws if the
-- query fails. Every GPU pod creation failed from the drop until this restore.
--
-- lib/catalog/gpu.ts (public GPU pricing page) and /api/admin/pricing/gpu broke
-- with it.
--
-- Why it went unnoticed: the inventory sync also touches gpu_pricing, but only
-- when auto-discovering an unseen GPU, and it logs that failure non-fatally. So
-- snapshots kept landing every minute and every dashboard kept showing live
-- stock while the thing customers actually do was dead. A busy-looking system
-- is not a working one.
--
-- All 192 rows restored exactly as archived: 48 GPUs x 2 cloud types x 2
-- interruptible values, all at markup_pct 1.000 (the at-cost decision of
-- 2026-08-26), zero floor. Constraints re-added by hand — `create table as
-- select` does not carry them.
--
-- THE REAL FIX, deliberately deferred: two price books for one product is the
-- problem. billing.service_pricing already holds a gpu_pod markup row, and
-- createPod should read that instead, after which this table can be retired
-- properly. That is a code change with its own testing; the outage could not
-- wait for it.

create table if not exists public.gpu_pricing (
  gpu_catalog_id     text        not null,
  cloud_type         text        not null,
  interruptible      boolean     not null,
  markup_pct         numeric(6,3) not null default 1.000,
  floor_per_hour_usd numeric(10,4) not null default 0,
  updated_at         timestamptz not null default now(),
  constraint gpu_pricing_pkey primary key (gpu_catalog_id, cloud_type, interruptible),
  constraint gpu_pricing_markup_at_least_cost check (markup_pct >= 1.000),
  constraint gpu_pricing_floor_non_negative   check (floor_per_hour_usd >= 0)
);

insert into public.gpu_pricing
  (gpu_catalog_id, cloud_type, interruptible, markup_pct, floor_per_hour_usd, updated_at)
select gpu_catalog_id, cloud_type, interruptible, markup_pct, floor_per_hour_usd, updated_at
  from pricing_archive_20260831.gpu_pricing
on conflict (gpu_catalog_id, cloud_type, interruptible) do nothing;

create index if not exists gpu_pricing_catalog_idx on public.gpu_pricing (gpu_catalog_id);

grant select on public.gpu_pricing to service_role, authenticated;
grant insert, update on public.gpu_pricing to service_role;
