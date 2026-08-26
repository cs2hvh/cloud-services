-- ============================================================================
-- Drift history.
--
-- A reconciler that only reports "now" answers the wrong question. Drift
-- detected once and corrected is invisible afterwards, so nobody can tell
-- whether a leak appeared this morning or has been running for six weeks — and
-- the cost of the answer is exactly the difference between those two.
--
-- This morning's incident is the case in point: a cluster ran unrecorded at
-- $116/month and the only reason anyone knows how long is that a person
-- happened to notice. That should be a query.
--
-- Fleet-adjacent, so service-role only: RLS on, no policy, same posture as
-- clusters and build_vms.
-- ============================================================================

create type paas.drift_kind as enum (
  'unrecorded',   -- cloud resource with no row. Real money, nobody tracking it.
  'stale',        -- row with no cloud resource. The control plane lying.
  'denied',       -- row says destroyed, resource is alive. A destroy that reported success it did not achieve.
  'unpriced'      -- resource found but cost unknown. A report that silently prices it at zero is worse than one that says so.
);

create table paas.drift_observations (
  id            uuid primary key default gen_random_uuid(),
  observed_at   timestamptz not null default now(),
  kind          paas.drift_kind not null,

  -- What drifted. cloud_id is the provider's id (Linode id, NodeBalancer id,
  -- DNS record id, R2 key); ref is ours, when we have one. Either may be null:
  -- an unrecorded resource has no ref, a stale row has no live cloud_id.
  resource_type text not null,
  cloud_id      text,
  ref           text,

  -- Null means "found but not priced", which is a finding in itself, not a zero.
  hourly_usd    numeric(12,6),
  detail        text not null,

  -- Set when a later observation no longer sees it. The gap between these two
  -- is the number that matters.
  resolved_at   timestamptz,

  constraint drift_resource_type_shape check (resource_type ~ '^[a-z][a-z0-9_-]{0,40}$'),
  constraint drift_has_an_identity check (cloud_id is not null or ref is not null)
);

-- One OPEN observation per (kind, resource). Re-running the reconciler every
-- few minutes must not manufacture a new row each time — that would turn the
-- history into noise and make "how long did this persist" unanswerable, which
-- is the only question the table exists to answer.
create unique index drift_open_unique_idx
  on paas.drift_observations (kind, resource_type, coalesce(cloud_id, ''), coalesce(ref, ''))
  where resolved_at is null;

create index drift_open_idx on paas.drift_observations (observed_at desc) where resolved_at is null;
create index drift_history_idx on paas.drift_observations (resource_type, observed_at desc);

alter table paas.drift_observations enable row level security;
grant select, insert, update, delete on paas.drift_observations to service_role;

comment on table paas.drift_observations is
  'Append-and-resolve log of infrastructure drift. Answers "when did this appear and how long did it persist", which a point-in-time reconciler cannot.';
comment on column paas.drift_observations.hourly_usd is
  'NULL means found-but-unpriced, which is a finding. Never write 0 for unknown — a cost report that rounds money to zero reads as reassuring exactly when it is wrong.';

-- Record a drift observation idempotently.
--
-- Re-observing something already open touches nothing and returns the existing
-- id, so the recorded start time stays true no matter how often the reconciler
-- runs.
create or replace function paas.record_drift(
  p_kind          paas.drift_kind,
  p_resource_type text,
  p_cloud_id      text,
  p_ref           text,
  p_hourly_usd    numeric,
  p_detail        text
)
returns uuid
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare v_id uuid;
begin
  select id into v_id
  from paas.drift_observations
  where kind = p_kind and resource_type = p_resource_type
    and coalesce(cloud_id, '') = coalesce(p_cloud_id, '')
    and coalesce(ref, '') = coalesce(p_ref, '')
    and resolved_at is null;

  if v_id is not null then
    return v_id;  -- already open; do NOT reset observed_at
  end if;

  insert into paas.drift_observations (kind, resource_type, cloud_id, ref, hourly_usd, detail)
  values (p_kind, p_resource_type, p_cloud_id, p_ref, p_hourly_usd, p_detail)
  returning id into v_id;
  return v_id;
end;
$$;

-- Close every open observation of a kind not present in the current sweep.
create or replace function paas.resolve_drift_not_in(
  p_kind          paas.drift_kind,
  p_resource_type text,
  p_still_open    text[]
)
returns integer
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare v_count integer;
begin
  update paas.drift_observations
  set resolved_at = now()
  where kind = p_kind
    and resource_type = p_resource_type
    and resolved_at is null
    and coalesce(cloud_id, ref) <> all (coalesce(p_still_open, array[]::text[]));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function paas.record_drift(paas.drift_kind, text, text, text, numeric, text) from public;
revoke all on function paas.resolve_drift_not_in(paas.drift_kind, text, text[]) from public;
grant execute on function paas.record_drift(paas.drift_kind, text, text, text, numeric, text) to service_role;
grant execute on function paas.resolve_drift_not_in(paas.drift_kind, text, text[]) to service_role;

notify pgrst, 'reload schema';
