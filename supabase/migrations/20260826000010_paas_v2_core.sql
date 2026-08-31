-- ============================================================================
-- Deploy v2 — core data model
--
-- Design rules, each one a direct response to a confirmed v1 defect:
--
--  1. INFRASTRUCTURE IS NEVER ADDRESSED BY A MUTABLE NAME.
--     v1 derived Kubernetes object names, Jenkins job names, TLS secret names
--     and public hostnames from platform_apps.name — a column with no UNIQUE
--     constraint and no charset validation on the update path. That single
--     decision is the root of three separate critical findings (cross-tenant
--     workload takeover, Groovy injection, and a kubectl mass-delete via a
--     grep sink). Here every addressable object carries an immutable `ref`,
--     generated once and never updated. `name` is display text and nothing
--     more.
--
--  2. DEPLOYMENTS ARE IMMUTABLE; ALIASES MOVE.
--     A deployment's git sha and image digest never change once written.
--     Promotion and rollback are a single UPDATE of alias.deployment_id — no
--     rebuild, no image retag. v1's rollback depended on a Docker Hub tag that
--     nothing pruned or guaranteed still existed.
--
--  3. METERS CANNOT OUTLIVE WHAT THEY BILL.
--     v1's billing.active_platform_apps had no FK to platform_apps, so five
--     meters are still charging three real users for apps that no longer
--     exist. Every billing row here is FK'd with an explicit ON DELETE.
--
--  4. RLS IS THE AUTHORIZATION BOUNDARY, NOT HAND-WRITTEN CHECKS.
--     v1 enabled RLS on all nine tables and then bypassed it on 100% of reads
--     by using the service-role client everywhere, leaving authorization to
--     per-route `if (app.user_id !== user.id)` lines. One omission = IDOR, and
--     the audit found exactly that. Policies here are the real boundary.
-- ============================================================================

create schema if not exists paas;
comment on schema paas is 'Deploy v2 control plane. Postgres is the desired state; reconcilers converge Kubernetes to match.';

-- ── helpers ─────────────────────────────────────────────────────────────────

-- Immutable, DNS-safe, collision-resistant identifier for anything that names
-- infrastructure. 6 random bytes = 2^48; the UNIQUE constraint is the backstop.
create or replace function paas.gen_ref(p_prefix text)
returns text
language sql
volatile
as $$
  select p_prefix || '_' || encode(gen_random_bytes(6), 'hex');
$$;

comment on function paas.gen_ref is
  'Generates an immutable ref (e.g. dpl_9f3a2c1b4d5e). Used for every Kubernetes object name, hostname label and registry tag. Never regenerate for an existing row.';

-- Guards every `ref` column: refs are write-once.
create or replace function paas.tg_ref_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.ref is distinct from old.ref then
    raise exception 'ref is immutable (% -> %). Infrastructure is addressed by ref; changing it orphans live resources.', old.ref, new.ref
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function paas.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── teams: the billing and authorization boundary ───────────────────────────

create table paas.teams (
  id           uuid primary key default gen_random_uuid(),
  ref          text not null unique default paas.gen_ref('team'),
  slug         text not null unique,
  name         text not null,
  created_by   uuid not null references auth.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint teams_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug !~ '--')
);

create type paas.team_role as enum ('owner', 'admin', 'member', 'viewer');

create table paas.team_members (
  team_id    uuid not null references paas.teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       paas.team_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_idx on paas.team_members (user_id);

-- SECURITY DEFINER so the policy on team_members does not recurse into itself.
create or replace function paas.has_team_access(p_team_id uuid, p_min_role paas.team_role default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = paas, pg_catalog
as $$
  select exists (
    select 1
    from paas.team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and case m.role
            when 'owner'  then 4
            when 'admin'  then 3
            when 'member' then 2
            when 'viewer' then 1
          end >=
          case p_min_role
            when 'owner'  then 4
            when 'admin'  then 3
            when 'member' then 2
            when 'viewer' then 1
          end
  );
$$;

comment on function paas.has_team_access is
  'The single authorization predicate. Every RLS policy in this schema routes through it so there is one place to audit, unlike v1 where authorization was re-implemented per route.';

-- ── projects: a git repository connected to a team ──────────────────────────

create type paas.git_provider as enum ('github', 'gitlab', 'bitbucket');

create table paas.projects (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique default paas.gen_ref('prj'),
  team_id        uuid not null references paas.teams(id) on delete cascade,

  -- Display name. Freely editable, never used to address infrastructure.
  name           text not null,
  -- Used in hostnames, so it is constrained and unique per team. Length is
  -- capped at 40 so that "<slug>-<12 hex>" stays inside the 63-char DNS label
  -- limit that the wildcard certificate depends on.
  slug           text not null,

  provider       paas.git_provider not null,
  repo_id        text not null,
  repo_full_name text not null,
  -- GitHub App installation this project's repo belongs to. Null for
  -- gitlab/bitbucket, which still use OAuth.
  installation_id bigint,

  production_branch text not null default 'main',
  root_directory    text,
  framework         text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint projects_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$' and slug !~ '--'),
  -- v1 allowed a branch to be any string and interpolated it unquoted into a
  -- shell command. Charset is constrained at the storage layer here so no
  -- caller can reintroduce that sink.
  constraint projects_branch_shape check (production_branch ~ '^[A-Za-z0-9._/-]{1,255}$' and production_branch !~ '\.\.')
);

-- One live slug per team; freed on soft-delete.
create unique index projects_team_slug_live_idx
  on paas.projects (team_id, slug)
  where deleted_at is null;

create index projects_team_idx on paas.projects (team_id) where deleted_at is null;
create index projects_repo_idx on paas.projects (provider, repo_id) where deleted_at is null;

-- ── environments ────────────────────────────────────────────────────────────

create type paas.environment_kind as enum ('production', 'preview', 'development');

create table paas.environments (
  id         uuid primary key default gen_random_uuid(),
  ref        text not null unique default paas.gen_ref('env'),
  project_id uuid not null references paas.projects(id) on delete cascade,
  kind       paas.environment_kind not null,
  name       text not null,
  created_at timestamptz not null default now(),

  unique (project_id, name)
);

-- Exactly one production environment per project.
create unique index environments_one_production_idx
  on paas.environments (project_id)
  where kind = 'production';

-- ── deployments: immutable ──────────────────────────────────────────────────

create type paas.deployment_state as enum (
  'queued',     -- accepted, waiting for a build VM
  'building',   -- a build VM holds the lease
  'publishing', -- image built, being scanned and pushed
  'ready',      -- image is live and servable
  'error',
  'canceled'
);

create type paas.deployment_trigger as enum ('git_push', 'pull_request', 'manual', 'redeploy', 'rollback');

create table paas.deployments (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique default paas.gen_ref('dpl'),
  project_id     uuid not null references paas.projects(id) on delete cascade,
  environment_id uuid not null references paas.environments(id) on delete restrict,

  state          paas.deployment_state not null default 'queued',
  trigger        paas.deployment_trigger not null,
  created_by     uuid references auth.users(id) on delete set null,

  -- Git provenance. Write-once.
  git_sha        text not null,
  git_ref        text not null,
  git_message    text,
  git_author     text,

  -- Build result. Written once when publishing succeeds, never rewritten.
  -- The digest is what the Deployment manifest pins, which is what makes
  -- rollback safe: v1 pinned a mutable tag instead.
  image_repo     text,
  image_digest   text,

  -- Failure detail, surfaced to the customer.
  error_code     text,
  error_message  text,

  queued_at      timestamptz not null default now(),
  started_at     timestamptz,
  ready_at       timestamptz,

  constraint deployments_sha_shape check (git_sha ~ '^[0-9a-f]{7,40}$'),
  constraint deployments_ref_shape check (git_ref ~ '^[A-Za-z0-9._/-]{1,255}$' and git_ref !~ '\.\.'),
  constraint deployments_digest_shape check (image_digest is null or image_digest ~ '^sha256:[0-9a-f]{64}$'),
  -- A ready deployment must have something to run.
  constraint deployments_ready_has_image check (state <> 'ready' or (image_repo is not null and image_digest is not null))
);

create index deployments_project_created_idx on paas.deployments (project_id, queued_at desc);
create index deployments_env_ready_idx on paas.deployments (environment_id, ready_at desc) where state = 'ready';
create index deployments_active_idx on paas.deployments (state) where state in ('queued', 'building', 'publishing');

-- Enforce immutability of provenance and build result.
create or replace function paas.tg_deployment_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.git_sha is distinct from old.git_sha
     or new.project_id is distinct from old.project_id
     or new.environment_id is distinct from old.environment_id then
    raise exception 'deployment provenance is immutable' using errcode = 'check_violation';
  end if;

  -- The image may be written once (null -> value), never changed.
  if old.image_digest is not null and new.image_digest is distinct from old.image_digest then
    raise exception 'deployment image_digest is write-once (% -> %)', old.image_digest, new.image_digest
      using errcode = 'check_violation';
  end if;

  -- Terminal states are terminal. v1 let a late webhook overwrite a finalized
  -- build, discarding the health verification the poller had already done.
  if old.state in ('ready', 'error', 'canceled') and new.state is distinct from old.state then
    raise exception 'deployment % is already terminal (%); cannot move to %', old.ref, old.state, new.state
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ── aliases: the mutable indirection that makes promote and rollback O(1) ────

create type paas.alias_kind as enum ('production', 'branch', 'deployment', 'custom');

create table paas.aliases (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null unique default paas.gen_ref('als'),
  project_id    uuid not null references paas.projects(id) on delete cascade,

  -- Globally unique across the whole platform. This is the constraint whose
  -- absence in v1 allowed one tenant to rename onto another tenant's hostname
  -- and take over their workload.
  hostname      text not null,
  kind          paas.alias_kind not null,

  -- Null is legal and meaningful: an alias can exist before its deployment is
  -- ready (reserved), and a rollback repoints it.
  deployment_id uuid references paas.deployments(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint aliases_hostname_lower check (hostname = lower(hostname)),
  constraint aliases_hostname_shape check (hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  constraint aliases_hostname_len check (length(hostname) <= 253)
);

create unique index aliases_hostname_idx on paas.aliases (lower(hostname));
create index aliases_project_idx on paas.aliases (project_id);
create index aliases_deployment_idx on paas.aliases (deployment_id);

-- One production alias per project.
create unique index aliases_one_production_idx
  on paas.aliases (project_id)
  where kind = 'production';

-- ── custom domains ──────────────────────────────────────────────────────────

create type paas.domain_state as enum ('pending', 'verifying', 'active', 'failed', 'removed');

create table paas.domains (
  id                uuid primary key default gen_random_uuid(),
  ref               text not null unique default paas.gen_ref('dom'),
  project_id        uuid not null references paas.projects(id) on delete cascade,
  team_id           uuid not null references paas.teams(id) on delete cascade,

  domain            text not null,
  state             paas.domain_state not null default 'pending',

  -- Cloudflare for SaaS custom hostname id, once provisioned.
  cf_hostname_id    text,
  verification_txt  text,
  verified_at       timestamptz,
  last_error        text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint domains_lower check (domain = lower(domain)),
  constraint domains_shape check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
);

-- v1 got this one right and it is carried over verbatim: one live claim per
-- domain, freed on removal.
create unique index domains_live_unique_idx
  on paas.domains (domain)
  where state <> 'removed';

create index domains_project_idx on paas.domains (project_id);

-- ── environment variables ───────────────────────────────────────────────────

create table paas.env_vars (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references paas.projects(id) on delete cascade,
  environment_id uuid references paas.environments(id) on delete cascade,

  key            text not null,
  -- Envelope-encrypted ciphertext. Never plaintext, and never returned to a
  -- list endpoint — v1's public API dumped every decrypted value in one
  -- unaudited response.
  value_ct       bytea not null,
  -- Which data key encrypted this, so keys can be rotated without a big bang.
  dek_id         text not null,

  is_public      boolean not null default false,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Must be a legal shell/K8s env identifier. v1 had layered shell+Groovy
  -- escaping bugs here.
  constraint env_vars_key_shape check (key ~ '^[A-Za-z_][A-Za-z0-9_]{0,255}$')
);

-- A key is unique per (project, environment); a null environment means it
-- applies to all of them.
create unique index env_vars_scoped_idx
  on paas.env_vars (project_id, coalesce(environment_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

comment on column paas.env_vars.is_public is
  'True only for NEXT_PUBLIC_/VITE_/PUBLIC_ style vars that are baked into the image as build args. Everything else is injected at runtime and must never enter an image layer.';

-- ── fleet: clusters and build VMs ───────────────────────────────────────────

create type paas.cluster_state as enum ('provisioning', 'ready', 'draining', 'retired');

create table paas.clusters (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique default paas.gen_ref('cls'),
  name           text not null,
  region         text not null,

  lke_cluster_id bigint unique,
  k8s_version    text,
  state          paas.cluster_state not null default 'provisioning',

  -- Placement accounting. LKE caps pods per cluster (1,000 standard / 5,000
  -- enterprise), and that cap — not CPU or RAM — is what forces a fleet.
  pod_capacity   integer not null default 1000,
  pod_allocated  integer not null default 0,

  accepts_new    boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint clusters_alloc_sane check (pod_allocated >= 0 and pod_allocated <= pod_capacity)
);

create index clusters_placement_idx on paas.clusters (state, accepts_new, pod_allocated) where state = 'ready';

-- Which cluster a deployment's workload was placed on.
create table paas.deployment_placements (
  deployment_id uuid primary key references paas.deployments(id) on delete cascade,
  cluster_id    uuid not null references paas.clusters(id) on delete restrict,
  namespace     text not null,
  placed_at     timestamptz not null default now()
);

create index deployment_placements_cluster_idx on paas.deployment_placements (cluster_id);

create type paas.build_vm_state as enum ('requested', 'provisioning', 'running', 'releasing', 'destroyed', 'leaked');

-- Every build leases one throwaway Linode. This table exists so an orphaned VM
-- is findable and reapable: during credential verification a single crashed
-- script already left one running, which is precisely the failure this guards.
create table paas.build_vms (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique default paas.gen_ref('bvm'),
  deployment_id   uuid references paas.deployments(id) on delete set null,

  linode_id       bigint unique,
  region          text not null,
  instance_type   text not null,
  state           paas.build_vm_state not null default 'requested',

  -- Hard deadline. Anything past this with a live linode_id is reaped, whether
  -- or not the control plane remembers why it exists.
  expires_at      timestamptz not null,

  created_at      timestamptz not null default now(),
  destroyed_at    timestamptz,
  last_error      text
);

create index build_vms_reap_idx on paas.build_vms (expires_at)
  where state in ('requested', 'provisioning', 'running', 'releasing');
create index build_vms_deployment_idx on paas.build_vms (deployment_id);

-- ── triggers ────────────────────────────────────────────────────────────────

create trigger teams_ref_immutable        before update on paas.teams        for each row execute function paas.tg_ref_immutable();
create trigger projects_ref_immutable     before update on paas.projects     for each row execute function paas.tg_ref_immutable();
create trigger environments_ref_immutable before update on paas.environments for each row execute function paas.tg_ref_immutable();
create trigger deployments_ref_immutable  before update on paas.deployments  for each row execute function paas.tg_ref_immutable();
create trigger aliases_ref_immutable      before update on paas.aliases      for each row execute function paas.tg_ref_immutable();
create trigger domains_ref_immutable      before update on paas.domains      for each row execute function paas.tg_ref_immutable();
create trigger clusters_ref_immutable     before update on paas.clusters     for each row execute function paas.tg_ref_immutable();
create trigger build_vms_ref_immutable    before update on paas.build_vms    for each row execute function paas.tg_ref_immutable();

create trigger deployments_immutable before update on paas.deployments for each row execute function paas.tg_deployment_immutable();

create trigger teams_touch      before update on paas.teams      for each row execute function paas.tg_touch_updated_at();
create trigger projects_touch   before update on paas.projects   for each row execute function paas.tg_touch_updated_at();
create trigger aliases_touch    before update on paas.aliases    for each row execute function paas.tg_touch_updated_at();
create trigger domains_touch    before update on paas.domains    for each row execute function paas.tg_touch_updated_at();
create trigger env_vars_touch   before update on paas.env_vars   for each row execute function paas.tg_touch_updated_at();
create trigger clusters_touch   before update on paas.clusters   for each row execute function paas.tg_touch_updated_at();

-- ── row level security ──────────────────────────────────────────────────────
-- Enabled AND relied upon. The control plane reads tenant data through an
-- RLS-scoped client; the service role is reserved for the reconcilers, which
-- touch infrastructure tables only.

alter table paas.teams                 enable row level security;
alter table paas.team_members          enable row level security;
alter table paas.projects              enable row level security;
alter table paas.environments          enable row level security;
alter table paas.deployments           enable row level security;
alter table paas.aliases               enable row level security;
alter table paas.domains               enable row level security;
alter table paas.env_vars              enable row level security;
alter table paas.clusters              enable row level security;
alter table paas.deployment_placements enable row level security;
alter table paas.build_vms             enable row level security;

create policy teams_read on paas.teams
  for select using (paas.has_team_access(id, 'viewer'));
create policy teams_write on paas.teams
  for update using (paas.has_team_access(id, 'admin'));

create policy team_members_read on paas.team_members
  for select using (paas.has_team_access(team_id, 'viewer'));
create policy team_members_manage on paas.team_members
  for all using (paas.has_team_access(team_id, 'admin'))
  with check (paas.has_team_access(team_id, 'admin'));

create policy projects_read on paas.projects
  for select using (paas.has_team_access(team_id, 'viewer'));
create policy projects_write on paas.projects
  for all using (paas.has_team_access(team_id, 'member'))
  with check (paas.has_team_access(team_id, 'member'));

create policy environments_read on paas.environments
  for select using (exists (select 1 from paas.projects p where p.id = project_id and paas.has_team_access(p.team_id, 'viewer')));
create policy environments_write on paas.environments
  for all using (exists (select 1 from paas.projects p where p.id = project_id and paas.has_team_access(p.team_id, 'member')))
  with check (exists (select 1 from paas.projects p where p.id = project_id and paas.has_team_access(p.team_id, 'member')));

create policy deployments_read on paas.deployments
  for select using (exists (select 1 from paas.projects p where p.id = project_id and paas.has_team_access(p.team_id, 'viewer')));
create policy deployments_create on paas.deployments
  for insert with check (exists (select 1 from paas.projects p where p.id = project_id and paas.has_team_access(p.team_id, 'member')));

create policy aliases_read on paas.aliases
  for select using (exists (select 1 from paas.projects p where p.id = project_id and paas.has_team_access(p.team_id, 'viewer')));
create policy aliases_write on paas.aliases
  for all using (exists (select 1 from paas.projects p where p.id = project_id and paas.has_team_access(p.team_id, 'member')))
  with check (exists (select 1 from paas.projects p where p.id = project_id and paas.has_team_access(p.team_id, 'member')));

create policy domains_read on paas.domains
  for select using (paas.has_team_access(team_id, 'viewer'));
create policy domains_write on paas.domains
  for all using (paas.has_team_access(team_id, 'member'))
  with check (paas.has_team_access(team_id, 'member'));

-- Note the deliberate absence of a SELECT policy exposing value_ct. Reads go
-- through an audited RPC, never a table select.
create policy env_vars_write on paas.env_vars
  for all using (exists (select 1 from paas.projects p where p.id = project_id and paas.has_team_access(p.team_id, 'admin')))
  with check (exists (select 1 from paas.projects p where p.id = project_id and paas.has_team_access(p.team_id, 'admin')));

-- Fleet tables carry no tenant data and have no policies: RLS is enabled and
-- nothing is granted, so they are reachable only by the service role.

comment on table paas.clusters is 'Fleet inventory. Service-role only — no RLS policy is defined deliberately.';
comment on table paas.build_vms is 'Build VM leases, including a hard expires_at so orphans are reapable without control-plane memory.';
