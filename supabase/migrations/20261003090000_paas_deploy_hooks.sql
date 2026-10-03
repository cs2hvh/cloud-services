-- Deploy hooks: a secret URL per app that triggers a production deploy when
-- POSTed. The commonest integration after git push — it lets a customer's CI
-- deploy only once their own tests pass, which a push alone cannot express.
--
-- WHAT IS STORED. Never the token. A sha256 of it, plus its last four
-- characters so a person can tell two hooks apart in a list. The full URL is
-- shown exactly once, when the hook is created. A copy of this table leaking
-- does not yield a working hook: the trigger route hashes whatever it is given,
-- so knowing a hash means finding a preimage of it.
--
-- WHO MAY DO WHAT. Reading hooks needs `member`; creating and revoking needs
-- `admin` — the same bar as environment variables. A hook is a standing
-- credential: it outlives the moment it was made, and anyone holding the URL
-- can deploy. That is closer to an env var than to a domain.
--
-- WHAT THE CLIENT CAN TOUCH. Column privileges, not just policies. The hash is
-- not selectable by `authenticated` at all, and the only column an update may
-- set is revoked_at — and the policy refuses to clear it, so a revoked hook
-- stays revoked.

alter type paas.deployment_trigger add value if not exists 'deploy_hook';

create table if not exists paas.deploy_hooks (
  id           uuid primary key default gen_random_uuid(),
  ref          text not null unique default paas.gen_ref('dhk'),
  project_id   uuid not null references paas.projects(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint   text not null check (char_length(token_hint) = 4),
  -- CASCADE, matching team_members: a hook is ACCESS, and access dies with the
  -- account. RESTRICT (teams, charges) would block deleting a user over a
  -- credential; SET NULL (deployments) suits provenance, not a live key.
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists deploy_hooks_project_idx on paas.deploy_hooks (project_id);

alter table paas.deploy_hooks enable row level security;

drop policy if exists deploy_hooks_read on paas.deploy_hooks;
create policy deploy_hooks_read on paas.deploy_hooks
  for select
  using (exists (
    select 1 from paas.projects p
    where p.id = deploy_hooks.project_id
      and paas.has_team_access(p.team_id, 'member'::paas.team_role)
  ));

-- Insert only as yourself. Without the created_by check an admin could mint a
-- hook attributed to a colleague, and the trigger route's "does the creator
-- still belong to this team" check would then be checking the wrong person.
drop policy if exists deploy_hooks_create on paas.deploy_hooks;
create policy deploy_hooks_create on paas.deploy_hooks
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from paas.projects p
      where p.id = deploy_hooks.project_id
        and p.deleted_at is null
        and paas.has_team_access(p.team_id, 'admin'::paas.team_role)
    )
  );

-- Revoke is the only update, and it is one-way.
drop policy if exists deploy_hooks_revoke on paas.deploy_hooks;
create policy deploy_hooks_revoke on paas.deploy_hooks
  for update
  using (exists (
    select 1 from paas.projects p
    where p.id = deploy_hooks.project_id
      and paas.has_team_access(p.team_id, 'admin'::paas.team_role)
  ))
  with check (
    revoked_at is not null
    and exists (
      select 1 from paas.projects p
      where p.id = deploy_hooks.project_id
        and paas.has_team_access(p.team_id, 'admin'::paas.team_role)
    )
  );

-- No delete for clients. A revoked row is the record of who could deploy and
-- when; deleting it would erase that.

revoke all on paas.deploy_hooks from anon, authenticated;
grant select (id, ref, project_id, name, token_hint, created_by, created_at, last_used_at, revoked_at)
  on paas.deploy_hooks to authenticated;
grant insert (project_id, name, token_hash, token_hint, created_by)
  on paas.deploy_hooks to authenticated;
grant update (revoked_at) on paas.deploy_hooks to authenticated;

-- The trigger route reads by hash and stamps last_used_at with the service
-- role. Granted explicitly rather than assumed from default privileges, which
-- differ per schema and are not visible from this file.
grant all on paas.deploy_hooks to service_role;
