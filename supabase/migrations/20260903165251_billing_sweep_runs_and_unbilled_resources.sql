-- Two blind spots in billing observability, found 2026-09-03.
--
-- 1. THE SWEEP'S PROBLEMS HAD NOWHERE TO GO. scripts/billing/sweep.ts detected
--    the eleven-hour compute hole every hour and wrote PROBLEM lines to the
--    systemd journal. Nobody reads the journal; SuccessExitStatus=0 1 told
--    systemd exit 1 was fine; the dead-man watched only max(period_start),
--    which five other meters kept fresh. billing.sweep_runs is where each run
--    now records what it saw, so the dead-man and the monitor board can read
--    it from outside the host.
--
-- 2. COVERAGE COUNTED METERS, NOT RESOURCES. billing.meter_coverage() reports
--    per open meter. A resource that never got a meter is not a row, so it is
--    "ok": on 2026-09-03 that was 8 vector collections priced at $8/mo, three
--    game servers 29 days past their paid period, and every custom image.
--    billing.unbilled_resources() lists what exists and should be paying and
--    is not.

create table if not exists billing.sweep_runs (
  id            bigint generated always as identity primary key,
  period_start  timestamptz not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  mode          text not null check (mode in ('apply', 'dry-run')),
  meters        integer not null default 0,
  charged       integer not null default 0,
  problems      integer not null default 0,
  outcomes      jsonb not null default '{}'::jsonb,
  problem_lines jsonb not null default '[]'::jsonb,
  host          text,
  git_sha       text
);

comment on table billing.sweep_runs is
  'One row per sweep invocation. problems > 0 means meters went unbilled that hour; problem_lines says which and why.';

create index if not exists sweep_runs_period_start_idx on billing.sweep_runs (period_start desc);
create index if not exists sweep_runs_started_at_idx   on billing.sweep_runs (started_at desc);

alter table billing.sweep_runs enable row level security;
revoke all on billing.sweep_runs from anon, authenticated;
grant select, insert, update on billing.sweep_runs to service_role;
grant usage, select on sequence billing.sweep_runs_id_seq to service_role;

create or replace function billing.unbilled_resources()
returns table(
  service_type text,
  service_id   uuid,
  owner_id     uuid,
  status       text,
  since        timestamptz,
  plan_key     text,
  reason       text
)
language sql
stable
security definer
set search_path = billing, public, inference, extensions
as $$
  -- v2 hourly services: a live row in the truth table with no open meter. The
  -- bigint-keyed tables carry billing_service_id; a NULL there is itself a
  -- reason the resource cannot be billed, so it is reported rather than
  -- filtered out.
  select 'compute'::text, s.billing_service_id, s.owner_id, s.status, s.created_at, s.plan_slug,
         case when s.billing_service_id is null then 'no billing_service_id' else 'no open meter' end
    from public.servers s
   where s.status in ('running', 'active', 'provisioning', 'stopped')
     and not exists (select 1 from billing.service_meters m
                      where m.service_type = 'compute' and m.service_id = s.billing_service_id and m.ended_at is null)

  union all
  select 'gpu_pod', p.billing_service_id, p.owner_id, p.status, p.created_at, p.gpu_catalog_id,
         case when p.billing_service_id is null then 'no billing_service_id' else 'no open meter' end
    from public.gpu_pods p
   where p.status = 'running'
     and not exists (select 1 from billing.service_meters m
                      where m.service_type = 'gpu_pod' and m.service_id = p.billing_service_id and m.ended_at is null)

  union all
  select 'gpu_pod_storage', p.billing_service_id, p.owner_id, p.status, p.created_at, p.gpu_catalog_id,
         case when p.billing_service_id is null then 'no billing_service_id' else 'no open meter' end
    from public.gpu_pods p
   where p.status in ('running', 'stopped')
     and not exists (select 1 from billing.service_meters m
                      where m.service_type = 'gpu_pod_storage' and m.service_id = p.billing_service_id and m.ended_at is null)

  union all
  select 'gpu_volume', v.billing_service_id, v.owner_id, v.status, v.created_at, '*',
         case when v.billing_service_id is null then 'no billing_service_id' else 'no open meter' end
    from public.gpu_network_volumes v
   where v.status in ('available', 'active')
     and not exists (select 1 from billing.service_meters m
                      where m.service_type = 'gpu_volume' and m.service_id = v.billing_service_id and m.ended_at is null)

  union all
  select 'objectspace', o.id, o.owner_id, o.status, o.created_at, '*', 'no open meter'
    from public.object_spaces o
   where o.status = 'active'
     and not exists (select 1 from billing.service_meters m
                      where m.service_type = 'objectspace' and m.service_id = o.id and m.ended_at is null)

  union all
  select 'spectrum', x.id, x.owner_id, x.status, x.created_at, '*', 'no open meter'
    from public.spectrum_apps x
   where x.status in ('active', 'running')
     and not exists (select 1 from billing.service_meters m
                      where m.service_type = 'spectrum' and m.service_id = x.id and m.ended_at is null)

  union all
  select 'database', d.id, d.owner_id, d.status, d.created_at, d.size, 'no open meter'
    from public.database_cluster d
   where d.status in ('active', 'running', 'provisioning')
     and not exists (select 1 from billing.service_meters m
                      where m.service_type = 'database' and m.service_id = d.id and m.ended_at is null)

  union all
  select 'kubernetes', k.id, k.owner_id, k.status, k.created_at, '*', 'no open meter'
    from public.clusters k
   where k.status in ('active', 'running', 'provisioning')
     and not exists (select 1 from billing.service_meters m
                      where m.service_type = 'kubernetes' and m.service_id = k.id and m.ended_at is null)

  union all
  select 'custom_image', i.billing_service_id, i.owner_id, i.status, i.created_at, '*',
         case when i.billing_service_id is null then 'no billing_service_id' else 'no open meter' end
    from public.custom_images i
   where i.status in ('active', 'ready', 'available')
     and not exists (select 1 from billing.service_meters m
                      where m.service_type = 'custom_image' and m.service_id = i.billing_service_id and m.ended_at is null)

  union all
  -- Vector collections have no status column: existing is billable.
  select 'inference_vector', c.id, coalesce(o.billing_user_id, o.owner_user_id), 'exists', c.created_at, '*', 'no open meter'
    from inference.vector_collections c
    left join inference.orgs o on o.id = c.org_id
   where not exists (select 1 from billing.service_meters m
                      where m.service_type = 'inference_vector' and m.service_id = c.id and m.ended_at is null)

  union all
  -- Prepaid monthly, so no hourly meter by design. A server past its paid
  -- period that has neither renewed nor been suspended is the same finding
  -- from the other direction.
  select 'game_server', g.billing_service_id, g.user_id, g.status, g.ends_at, g.plan_slug,
         'prepaid period ended, not renewed or suspended'
    from public.game_servers g
   where g.status in ('active', 'suspended') and g.ends_at < now()

  order by 5;
$$;

comment on function billing.unbilled_resources() is
  'Resources that exist and should be paying but have no open meter (or, for prepaid game servers, are past their paid period). Complements meter_coverage(), which only sees meters.';

revoke all on function billing.unbilled_resources() from public, anon, authenticated;
grant execute on function billing.unbilled_resources() to service_role;
grant execute on function billing.meter_coverage(interval) to service_role;
