-- ============================================================================
-- GitHub App installations, bound to teams.
--
-- WHY THIS TABLE EXISTS
--
-- listInstallations() returns EVERY installation of the App, across every
-- account that ever installed it. Handing that to an authenticated user lets
-- them name someone else's installation id, have us mint a token for it, and
-- list that org's private repositories — a cross-tenant leak whose blast radius
-- is outside the platform entirely. A peer session refused to implement the
-- endpoint as originally specified, and was right to.
--
-- Authorization therefore cannot be derived from GitHub. It has to come from a
-- record we wrote at install time, which is the only moment we know both the
-- installation and the caller.
--
-- WHY INSERTS GO THROUGH AN RPC AND NOT A GRANT
--
-- If `authenticated` could INSERT here, a client could claim any installation
-- id by writing the row — inventing exactly the authorization it is supposed to
-- be checked against. So: SELECT only for authenticated (filtered by RLS), and
-- writes exclusively through link_installation(), which is SECURITY DEFINER and
-- verifies team membership itself.
-- ============================================================================

create table paas.installations (
  installation_id bigint primary key,
  team_id         uuid not null references paas.teams(id) on delete cascade,
  account_login   text not null,
  account_type    text,
  installed_by    uuid not null references auth.users(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint installations_account_shape check (account_login ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$')
);

-- One live claim per installation. Without this, two teams could both claim the
-- same installation and each would authorize tokens for the other's repos.
create unique index installations_live_unique_idx
  on paas.installations (installation_id)
  where deleted_at is null;

create index installations_team_idx on paas.installations (team_id) where deleted_at is null;

create trigger installations_touch
  before update on paas.installations
  for each row execute function paas.tg_touch_updated_at();

alter table paas.installations enable row level security;

-- Read-only, and only for teams the caller belongs to.
create policy installations_read on paas.installations
  for select using (paas.has_team_access(team_id, 'viewer'));

grant select on paas.installations to authenticated;
grant select, insert, update, delete on paas.installations to service_role;

-- ── the write path ──────────────────────────────────────────────────────────

-- Bind a GitHub App installation to a team.
--
-- Called from the OAuth callback, where GitHub redirects with ?installation_id=
-- and the session identifies the caller. SECURITY DEFINER so it can write a
-- table the caller cannot, but it re-checks membership itself rather than
-- trusting the caller — a definer function that skips its own authorization is
-- just a privilege escalation with extra steps.
--
-- Idempotent: re-installing updates the existing row rather than failing, since
-- GitHub will happily fire the callback twice.
create or replace function paas.link_installation(
  p_installation_id bigint,
  p_team_ref        text,
  p_account_login   text,
  p_account_type    text default null
)
returns text
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare
  v_team_id uuid;
  v_caller  uuid := auth.uid();
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

  -- The caller must be able to administer the team they are binding to.
  -- Without this, any authenticated user could attach an installation to
  -- someone else's team and then read its repositories through them.
  if not paas.has_team_access(v_team_id, 'admin') then
    raise exception 'not authorized to link an installation to team %', p_team_ref
      using errcode = 'insufficient_privilege';
  end if;

  -- If another team already holds this installation, refuse rather than
  -- silently stealing it.
  select team_id into v_existing_team
  from paas.installations
  where installation_id = p_installation_id and deleted_at is null;

  if v_existing_team is not null and v_existing_team <> v_team_id then
    raise exception 'installation % is already linked to another team', p_installation_id
      using errcode = 'unique_violation';
  end if;

  insert into paas.installations (installation_id, team_id, account_login, account_type, installed_by)
  values (p_installation_id, v_team_id, p_account_login, p_account_type, v_caller)
  on conflict (installation_id) do update
    set team_id       = excluded.team_id,
        account_login = excluded.account_login,
        account_type  = excluded.account_type,
        deleted_at    = null;

  return p_team_ref;
end;
$$;

-- Release an installation. Soft delete, so the audit trail survives.
create or replace function paas.unlink_installation(p_installation_id bigint)
returns boolean
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare v_team_id uuid;
begin
  select team_id into v_team_id
  from paas.installations
  where installation_id = p_installation_id and deleted_at is null;

  if v_team_id is null then return false; end if;

  if not paas.has_team_access(v_team_id, 'admin') then
    raise exception 'not authorized to unlink installation %', p_installation_id
      using errcode = 'insufficient_privilege';
  end if;

  update paas.installations
  set deleted_at = now()
  where installation_id = p_installation_id and deleted_at is null;

  return true;
end;
$$;

revoke all on function paas.link_installation(bigint, text, text, text) from public;
revoke all on function paas.unlink_installation(bigint) from public;
grant execute on function paas.link_installation(bigint, text, text, text) to authenticated, service_role;
grant execute on function paas.unlink_installation(bigint) to authenticated, service_role;

comment on table paas.installations is
  'GitHub App installations bound to teams. Authorization for minting installation tokens derives from THIS table, never from listInstallations(), which returns every installation across every account.';

notify pgrst, 'reload schema';
