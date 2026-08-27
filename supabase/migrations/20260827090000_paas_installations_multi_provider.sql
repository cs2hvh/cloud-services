-- ============================================================================
-- paas.installations becomes provider-agnostic.
--
-- WRITTEN BY THE OBSERVABILITY LANE, APPLIED BY THE DEPLOY LANE. Migrations are
-- theirs; this file is the handoff.
--
-- WHY THE TABLE HAD TO CHANGE AT ALL
--
-- v2 is GitHub-only and paas.installations is GitHub-shaped in two places that
-- are not cosmetic:
--
--   installation_id bigint primary key
--       Bitbucket workspace ids are UUIDs — `{9d1e...}` — not integers. There
--       is no bigint that holds one.
--
--   check (account_login ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$')
--       That is literally GitHub's username grammar: 39 characters,
--       alphanumeric and hyphen. GitLab namespaces allow dots and underscores
--       and run to 255; Bitbucket workspace slugs allow underscores. The
--       constraint would REJECT VALID ACCOUNTS on both new providers — and it
--       would do so inside link_installation(), which is SECURITY DEFINER, so
--       the caller sees a generic write failure rather than "that name is fine,
--       our constraint is not".
--
-- WHY ONE TABLE AND NOT THREE
--
-- The platform's hot question is "what connections does this team have" — the
-- repo list, project create, and every webhook lookup ask it. Across three
-- tables that is three queries, three RLS policies and three GRANTs. GRANT and
-- RLS are INDEPENDENT gates that fail with near-identical errors (42501
-- "permission denied for table" versus "new row violates row-level security
-- policy"), and a full debugging round was already lost to exactly that pair on
-- exactly this table. Three tables is six chances to repeat it, on the table
-- whose entire job is authorization.
--
-- The auth MECHANICS differ per provider — GitHub App installation, GitLab
-- OAuth grant, Bitbucket workspace grant — but the RECORD is one shape: team,
-- provider, external account identity, who linked it. Provider-specific detail
-- belongs in metadata, not in a third schema.
--
-- BLAST RADIUS, checked rather than assumed: one row, and zero foreign keys
-- reference paas.installations. paas.projects.installation_id is a bare bigint
-- with no FK, so nothing cascades — but it is converted here alongside, because
-- a text external_id on one side and a bigint on the other is a join that works
-- today and breaks on the first Bitbucket workspace.
-- ============================================================================

-- ── 1. the new columns ──────────────────────────────────────────────────────

alter table paas.installations
  add column if not exists provider    paas.git_provider,
  add column if not exists external_id text,
  -- Provider-specific facts that do not deserve a column: GitLab's group vs
  -- user namespace, Bitbucket's workspace slug alongside its uuid. Read by the
  -- adapters, never by a policy.
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

-- Backfill. Every existing row is GitHub by construction — this table has only
-- ever been written by the GitHub callback.
update paas.installations
   set provider    = coalesce(provider, 'github'::paas.git_provider),
       external_id = coalesce(external_id, installation_id::text)
 where provider is null or external_id is null;

alter table paas.installations
  alter column provider    set not null,
  alter column external_id set not null;

-- ── 2. the primary key ──────────────────────────────────────────────────────

-- The old PK is on installation_id, which is about to stop being the identity.
-- Dropping it before the new one exists would leave the table briefly
-- unconstrained; both statements are in one transaction, so it never is.
alter table paas.installations drop constraint if exists installations_pkey;
alter table paas.installations add constraint installations_pkey
  primary key (provider, external_id);

-- The partial unique index is now redundant against the PK, exactly as it was
-- before against the old one. Recreated on the new key rather than dropped:
-- it states the rule that matters — ONE LIVE CLAIM per connection — where a
-- reader looks for it, and the original carried that comment for the same
-- reason.
drop index if exists paas.installations_live_unique_idx;
create unique index installations_live_unique_idx
  on paas.installations (provider, external_id)
  where deleted_at is null;

-- ── 3. the account-name grammar, per provider ───────────────────────────────

alter table paas.installations drop constraint if exists installations_account_shape;

-- ELSE FALSE IS THE LOAD-BEARING LINE.
--
-- A CASE with no ELSE returns NULL for an unmatched provider, and a CHECK
-- constraint PASSES on NULL. So adding a fourth value to paas.git_provider
-- would silently switch this constraint off for that provider — the check would
-- still be listed, still be green, and enforce nothing. Failing closed means a
-- new provider must state its own grammar before it can store a row.
alter table paas.installations add constraint installations_account_shape check (
  case provider
    -- 39 chars, alphanumeric and hyphen, cannot start with a hyphen.
    when 'github'    then account_login ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'
    -- Namespaces allow dots and underscores and run long. Deliberately does not
    -- try to encode GitLab's reserved-name list: that is theirs to enforce and
    -- a stale copy of it here would reject names GitLab accepts.
    when 'gitlab'    then account_login ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$'
    -- Workspace slugs: lowercase, alphanumeric, hyphen and underscore, 62 max.
    when 'bitbucket' then account_login ~ '^[a-z0-9][a-z0-9_-]{0,61}$'
    else false
  end
);

-- external_id has no provider-specific grammar worth encoding — a GitHub
-- installation id is decimal, a GitLab project id is decimal, a Bitbucket
-- workspace id is a braced UUID — but it must not be empty or unbounded.
alter table paas.installations add constraint installations_external_id_shape
  check (length(external_id) between 1 and 128 and external_id !~ '\s');

-- ── 4. projects.installation_id follows ─────────────────────────────────────

-- Bare bigint, no FK. Converted so the join survives the first Bitbucket
-- workspace. Renamed at the same time: `installation_id` names a GitHub concept
-- and would be the third place in this schema where a GitHub word describes
-- something that is not one.
alter table paas.projects
  add column if not exists connection_id text;

update paas.projects
   set connection_id = installation_id::text
 where connection_id is null and installation_id is not null;

-- The old column stays, nullable and unused, for one release. Dropping it in
-- the same migration that adds its replacement means any deploy still running
-- the previous code errors on every project read — and the rollback is a
-- restore rather than a revert.
comment on column paas.projects.installation_id is
  'DEPRECATED: superseded by connection_id (text, provider-agnostic). Safe to drop once no code reads it.';

create index if not exists projects_connection_idx
  on paas.projects (connection_id) where deleted_at is null;

-- ── 5. the write path ───────────────────────────────────────────────────────

-- The old signature took a bigint and is now wrong for two of three providers.
-- Dropped explicitly rather than replaced: `create or replace` cannot change a
-- parameter type, so leaving it would keep a callable overload that silently
-- accepts only GitHub.
drop function if exists paas.link_installation(bigint, text, text, text);

create or replace function paas.link_installation(
  p_provider      paas.git_provider,
  p_external_id   text,
  p_team_ref      text,
  p_account_login text,
  p_account_type  text default null,
  p_metadata      jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare
  v_team_id       uuid;
  v_caller        uuid := auth.uid();
  v_existing_team uuid;
begin
  if v_caller is null then
    raise exception 'link_installation requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_team_id from paas.teams where ref = p_team_ref;
  if v_team_id is null then
    raise exception 'team % not found', p_team_ref using errcode = 'no_data_found';
  end if;

  -- SECURITY DEFINER re-checks membership itself rather than trusting the
  -- caller. A definer function that skips its own authorization is a privilege
  -- escalation with extra steps.
  if not paas.has_team_access(v_team_id, 'admin') then
    raise exception 'not authorized to link a connection to team %', p_team_ref
      using errcode = 'insufficient_privilege';
  end if;

  -- Scoped by provider as well as id. Without it, a GitLab project numbered 42
  -- and a GitHub installation numbered 42 would collide and each could refuse
  -- or steal the other.
  select team_id into v_existing_team
  from paas.installations
  where provider = p_provider and external_id = p_external_id and deleted_at is null;

  if v_existing_team is not null and v_existing_team <> v_team_id then
    raise exception 'connection %/% is already linked to another team', p_provider, p_external_id
      using errcode = 'unique_violation';
  end if;

  insert into paas.installations
      (provider, external_id, installation_id, team_id, account_login, account_type, installed_by, provider_metadata)
  values (
      p_provider,
      p_external_id,
      -- Kept in step for the deprecated column while it still exists, and only
      -- where the id is actually numeric. A Bitbucket UUID cast to bigint would
      -- raise, and it would raise on the INSERT rather than anywhere a reader
      -- would look for the cause.
      case when p_external_id ~ '^\d+$' then p_external_id::bigint else null end,
      v_team_id, p_account_login, p_account_type, v_caller, coalesce(p_metadata, '{}'::jsonb))
  on conflict (provider, external_id) do update
    set team_id           = excluded.team_id,
        account_login     = excluded.account_login,
        account_type      = excluded.account_type,
        provider_metadata = excluded.provider_metadata,
        deleted_at        = null;

  return p_team_ref;
end;
$$;

drop function if exists paas.unlink_installation(bigint);

create or replace function paas.unlink_installation(
  p_provider    paas.git_provider,
  p_external_id text
)
returns boolean
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare v_team_id uuid;
begin
  select team_id into v_team_id
  from paas.installations
  where provider = p_provider and external_id = p_external_id and deleted_at is null;

  if v_team_id is null then
    return false;
  end if;

  if not paas.has_team_access(v_team_id, 'admin') then
    raise exception 'not authorized to unlink connection %/%', p_provider, p_external_id
      using errcode = 'insufficient_privilege';
  end if;

  update paas.installations
     set deleted_at = now()
   where provider = p_provider and external_id = p_external_id and deleted_at is null;

  return true;
end;
$$;

-- ── 6. BOTH GATES ───────────────────────────────────────────────────────────
--
-- GRANT and RLS are independent and a missing GRANT reads almost exactly like
-- an RLS refusal. No new table here, so the existing policy and grants still
-- apply to the existing rows — but the FUNCTIONS are new objects with new
-- signatures, and a new function has no EXECUTE grant at all.

revoke all on function paas.link_installation(paas.git_provider, text, text, text, text, jsonb) from public;
revoke all on function paas.unlink_installation(paas.git_provider, text) from public;

grant execute on function paas.link_installation(paas.git_provider, text, text, text, text, jsonb) to authenticated;
grant execute on function paas.unlink_installation(paas.git_provider, text) to authenticated;

comment on function paas.link_installation(paas.git_provider, text, text, text, text, jsonb) is
  'Bind a provider connection to a team. SECURITY DEFINER; re-checks admin membership. Idempotent per (provider, external_id).';
