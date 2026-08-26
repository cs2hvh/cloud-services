-- Scale-to-zero state, in the database rather than only in the cluster.
--
-- Warm fraction is measured at 1.0: every app is warm 100% of the time, so the
-- fleet pays the always-on cost model (~$52k/month at 10k apps) against a $5
-- price. This column is the first half of closing that; the activator is the
-- second.
--
-- WHY THE DATABASE AND NOT JUST replicas=0
--
-- Three things act on an app's replica count — the reconciler on its interval,
-- the idle sweep, and the activator on an incoming request — and they must not
-- fight. If "scaled to zero" lives only as replicas=0 in the cluster, the
-- reconciler's next pass sees an app that should be running with no replicas
-- and scales it back up, undoing the saving within seconds and looking like a
-- flapping bug rather than a disagreement about desired state.
alter table paas.deployments
  add column if not exists scaled_to_zero_at timestamptz;

comment on column paas.deployments.scaled_to_zero_at is
  'When this deployment was deliberately scaled to zero for idleness. NOT NULL means asleep on purpose — the reconciler must leave it at zero rather than "correcting" it. Cleared when the reconciler observes the activator''s ahura.cloud/woken-at stamp.';

-- Partial: a superseded deployment sitting at zero replicas is not asleep, it
-- is retired, and the two must not be confused.
create index if not exists deployments_asleep_idx
  on paas.deployments (scaled_to_zero_at)
  where scaled_to_zero_at is not null;

-- Per-project opt-in. Default FALSE: turning this on platform-wide before the
-- wake path is proven would take every live app down the first time a sweep
-- ran, and "it scaled down correctly" is no comfort if nothing scales it back.
alter table paas.projects
  add column if not exists scale_to_zero boolean not null default false;

comment on column paas.projects.scale_to_zero is
  'Opt-in to sleeping when idle. Default false deliberately — an app that scales down without a proven wake path is just an app that is down.';

alter table paas.projects
  add column if not exists idle_seconds integer;

alter table paas.projects
  drop constraint if exists projects_idle_seconds_sane;
alter table paas.projects
  add constraint projects_idle_seconds_sane
  check (idle_seconds is null or idle_seconds >= 60);
