-- Health of every hosted serving endpoint, probed by the gateway worker.
--
-- The flash model served its last successful request on 2026-09-12 at 15:55
-- UTC and failed the next 266, over three days, before anyone noticed: the
-- pods had been rebuilt under new RunPod hostnames and nothing on our side
-- was looking. The gateway is the one process that holds the DEK for each
-- endpoint's credential and already fires a cron every minute, so it probes
-- each endpoint's /models with that credential and writes what it saw here.
-- The admin panel reads these tables; it never needs a pod key.
--
-- endpoint_health     one row per endpoint, the current state, upserted.
-- endpoint_health_log one row per probe, kept seven days, for uptime bars.
--
-- "ok" means: HTTP 200 from /models AND the endpoint's served-model-name is
-- among the ids the pod lists. A pod that is up but serving a different name
-- 404s every real request, and that is exactly the failure we had.

begin;

create table if not exists inference.endpoint_health (
  endpoint_id          uuid primary key
                         references inference.serving_endpoints(id) on delete cascade,
  model_id             text not null
                         references inference.models(model_id) on update cascade on delete cascade,
  base_url             text not null,
  label                text,
  enabled              boolean not null,
  checked_at           timestamptz not null,
  ok                   boolean not null,
  reason               text not null,
  status_code          integer,
  latency_ms           integer,
  served_ids           jsonb not null default '[]'::jsonb,
  error                text,
  consecutive_failures integer not null default 0,
  last_ok_at           timestamptz,
  last_fail_at         timestamptz,
  updated_at           timestamptz not null default now()
);

comment on table inference.endpoint_health is
  'Current health of each hosted serving endpoint, written every minute by the gateway cron. ok = HTTP 200 from /models and the served-model-name is listed.';
comment on column inference.endpoint_health.reason is
  'ok | unreachable | timeout | credential | served_name_missing | http_<status>';

create table if not exists inference.endpoint_health_log (
  id           bigserial primary key,
  endpoint_id  uuid not null
                 references inference.serving_endpoints(id) on delete cascade,
  checked_at   timestamptz not null,
  ok           boolean not null,
  reason       text not null,
  status_code  integer,
  latency_ms   integer
);

comment on table inference.endpoint_health_log is
  'One row per probe of each hosted endpoint; pruned to seven days by the same cron.';

create index if not exists endpoint_health_log_endpoint_time_idx
  on inference.endpoint_health_log (endpoint_id, checked_at desc);
create index if not exists endpoint_health_log_time_idx
  on inference.endpoint_health_log (checked_at);

alter table inference.endpoint_health enable row level security;
alter table inference.endpoint_health_log enable row level security;
revoke all on inference.endpoint_health from anon, authenticated;
revoke all on inference.endpoint_health_log from anon, authenticated;
revoke all on sequence inference.endpoint_health_log_id_seq from anon, authenticated;

commit;
