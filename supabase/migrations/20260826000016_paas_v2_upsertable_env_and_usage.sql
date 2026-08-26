-- ── 1. env_vars: a constraint PostgREST can actually name ───────────────────
--
-- The old uniqueness was an EXPRESSION index:
--
--   create unique index env_vars_scoped_idx on paas.env_vars
--     (project_id, coalesce(environment_id, '000…'::uuid), key);
--
-- It enforced the right thing, but PostgREST's `on_conflict` takes plain COLUMN
-- names and cannot name an expression index. So the natural write — upsert on
-- (project_id, environment_id, key) — targets a constraint that does not exist
-- and fails at write time. Found by Master reading the index definition rather
-- than assuming the constraint matched the columns.
--
-- The obvious fix is wrong. A plain unique on (project_id, environment_id, key)
-- does NOT enforce uniqueness when environment_id is null, because null != null
-- in a unique index — and null here MEANS "applies to every environment", the
-- most common case. That would silently permit two project-wide rows with the
-- same key, and whichever the planner returned first would win. An env var that
-- intermittently reverts is a worse bug than one that fails to save.
--
-- NULLS NOT DISTINCT (Postgres 15+; we run 17.4) treats nulls as equal: the
-- same semantics as the coalesce trick, but as a real named constraint that
-- on_conflict can target.
alter table paas.env_vars
  add constraint env_vars_scoped_key
  unique nulls not distinct (project_id, environment_id, key);

-- Only after the replacement exists, so uniqueness is never briefly unenforced.
drop index if exists paas.env_vars_scoped_idx;

comment on constraint env_vars_scoped_key on paas.env_vars is
  'One value per key per scope, where a null environment_id means all environments. NULLS NOT DISTINCT so the all-environments scope is genuinely unique — and nameable by PostgREST on_conflict, which an expression index is not.';


-- ── 2. usage_samples: somewhere to put the metering accumulator ─────────────
--
-- lib/paas/telemetry/usage.ts already computes these correctly and has tests.
-- It has had nowhere to write them, so warm fraction — the number that decides
-- whether this business works — has existed only for the lifetime of one
-- process. Shape from app-deploy-3, who is writing the producer and the reader.
--
-- Their three arguments about the shape were right and are honoured below.
-- Where I have deviated, it is called out with the reason.
create table if not exists paas.usage_samples (
  id                 uuid primary key default gen_random_uuid(),
  sampled_at         timestamptz not null default now(),

  deployment_ref     text not null,

  -- NULLABLE, and that is deliberate. Several running deployments currently
  -- have no paas.deployments row at all. Recording their usage unattributed is
  -- strictly better than dropping it: dropping usage for an app we failed to
  -- record is the same defect as never metering it, and it is the defect that
  -- silently under-bills.
  --
  -- DEVIATION: `on delete set null`, not `on delete cascade`. These are
  -- financial records. A usage sample is a fact about a period that already
  -- happened, and deleting the project must not delete the evidence that it
  -- ran — the final invoice and any chargeback both arrive after deletion.
  -- Cascade would erase exactly the record that settles the dispute. Set-null
  -- keeps referential integrity while keeping the row; project_ref below keeps
  -- the attribution in a form that survives the delete.
  project_id         uuid references paas.projects(id) on delete set null,
  project_ref        text,

  pod_seconds        numeric(14,3) not null,
  warm_seconds       numeric(14,3) not null,
  peak_pods          integer not null,
  restarts           integer not null default 0,

  -- Time that could not be observed: sampler down, API unreachable, cluster
  -- unreachable. Kept separate from zero, because zero means "measured, and it
  -- was idle" while this means "not measured". Warm fraction divides by
  -- OBSERVED time, not wall time, and without this column that correction is
  -- impossible after the fact. Billing must never treat the second as the
  -- first — that is charging for a guess.
  unobserved_seconds numeric(14,3) not null default 0,

  -- ADDITION: what span this sample covers.
  -- 300 pod-seconds is one pod for five minutes or five pods for one, and
  -- without the window the two are indistinguishable once the sampler's
  -- interval changes or a restart produces a short period. Nullable so it does
  -- not break a writer already built against the shape above; populate it and
  -- aggregation becomes arithmetic instead of an assumption about the interval.
  period_seconds     numeric(14,3),

  created_at         timestamptz not null default now()
);

-- NO unique constraint on (deployment_ref, sampled_at) — app-deploy-3 argued
-- against one I had added, and they were right. Samples are a time series, not
-- state: two samples in the same instant are a scheduler doing its job, not a
-- conflict. It also would not have bought the idempotency I wanted, because a
-- retry recomputes now() and lands on a different timestamp anyway. So it could
-- only ever have rejected legitimate data. If double-counting on retry becomes
-- real, the fix is a deterministic aligned window key, not a timestamp.
create index if not exists usage_samples_project_time_idx
  on paas.usage_samples (project_id, sampled_at desc);
create index if not exists usage_samples_deployment_time_idx
  on paas.usage_samples (deployment_ref, sampled_at desc);

comment on table paas.usage_samples is
  'Append-only metering facts. A usage sample must outlive the project it describes, because the final bill and any dispute about it both arrive after deletion.';
comment on column paas.usage_samples.unobserved_seconds is
  'Seconds in the period that could not be measured. NEVER fold into pod_seconds or warm_seconds — unmeasured is not idle, and billing a guess is how customers stop trusting the invoice.';
comment on column paas.usage_samples.warm_seconds is
  'Seconds with a pod running but serving nothing. Currently equal to the period for every app because scale-to-zero is not implemented; that gap is the difference between the $18-20k and $52k monthly cost models.';

alter table paas.usage_samples enable row level security;

-- Reads are team-scoped; writes are service-role only. A tenant must never be
-- able to author or amend the record that determines their own bill.
create policy usage_samples_team_read on paas.usage_samples
  for select to authenticated
  using (paas.has_team_access(
    (select p.team_id from paas.projects p where p.id = usage_samples.project_id)
  ));

grant select on paas.usage_samples to authenticated;
grant all on paas.usage_samples to service_role;
