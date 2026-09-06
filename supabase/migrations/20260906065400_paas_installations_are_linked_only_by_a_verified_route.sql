-- Any team admin could claim any GitHub App installation.
--
-- Proven live on 2026-09-06: a customer JWT inserted a paas.installations row
-- for installation_id 999999999 with an invented account_login and got 201.
-- installations_connect checked only that the writer administers the team the
-- row names, which is always their own. GitHub installation ids are small
-- sequential integers, so a real but not-yet-linked org installation is one
-- guess away, and the row IS the authorization: callerMayUseInstallation reads
-- it, and lib/paas/github/app.ts then mints real installation tokens for it.
-- That is cross-tenant access to a private repository.
--
-- The application's own connect flow already proves ownership before writing:
-- for GitHub, the signed-in identity's GitHub login must equal the account the
-- installation is on (lib/paas/github/ownership.ts); for GitLab and Bitbucket,
-- the OAuth token the provider just issued names the account. The hole was
-- that the write did not require the flow. Two doors skipped it:
--
--   the bare INSERT grant plus installations_connect, used by the probe; and
--   paas.link_installation, SECURITY DEFINER and executable by authenticated,
--   which re-checks team admin and nothing about the provider. A client could
--   call it from PostgREST with any external id and land in the same place.
--
-- Both close here. Linking becomes link_installation_verified, executable by
-- service_role only and taking the acting user as an argument, so it can be
-- reached only from server code that ran the proof first
-- (lib/paas/installations/link.ts). It re-checks that the user administers
-- the team itself: a definer function that trusts its caller is a privilege
-- escalation with extra steps, whatever role the caller is.
--
-- unlink_installation keeps its authenticated grant. It authorizes admin on
-- the row's own team and only soft-deletes; the disconnect route now calls it
-- (it was updating the table directly, which the 2026-08-27 hardening had
-- already made impossible, so disconnect returned 500 for everyone and a row
-- planted through this hole could not be removed by its victim).

begin;

revoke insert on paas.installations from authenticated;
drop policy if exists installations_connect on paas.installations;

create or replace function paas.link_installation_verified(
  p_user_id          uuid,
  p_provider         paas.git_provider,
  p_external_id      text,
  p_team_ref         text,
  p_account_login    text,
  p_account_type     text default null,
  p_metadata         jsonb default '{}'::jsonb,
  p_access_token_ct  bytea default null,
  p_refresh_token_ct bytea default null,
  p_token_dek_id     text default null,
  p_token_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare
  v_team_id       uuid;
  v_existing_team uuid;
begin
  if p_user_id is null then
    raise exception 'link_installation_verified requires the acting user'
      using errcode = 'insufficient_privilege';
  end if;
  if p_external_id is null or btrim(p_external_id) = '' or length(p_external_id) > 128 then
    raise exception 'external id is required' using errcode = 'check_violation';
  end if;
  if p_account_login is null or btrim(p_account_login) = '' then
    -- The login is what the route matched the caller against. A blank one
    -- means no proof ran; refuse rather than record.
    raise exception 'account login is required' using errcode = 'check_violation';
  end if;

  select id into v_team_id from paas.teams where ref = p_team_ref;
  if v_team_id is null then
    raise exception 'team % not found', p_team_ref using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1 from paas.team_members m
     where m.team_id = v_team_id and m.user_id = p_user_id
       and m.role in ('owner', 'admin')
  ) then
    raise exception 'user is not an admin of team %', p_team_ref
      using errcode = 'insufficient_privilege';
  end if;

  select team_id into v_existing_team
    from paas.installations
   where provider = p_provider and external_id = p_external_id and deleted_at is null;
  if v_existing_team is not null and v_existing_team <> v_team_id then
    raise exception 'connection %/% is already linked to another team', p_provider, p_external_id
      using errcode = 'unique_violation';
  end if;

  insert into paas.installations
      (provider, external_id, installation_id, team_id, account_login, account_type, installed_by,
       provider_metadata, access_token_ct, refresh_token_ct, token_dek_id, token_expires_at)
  values (
      p_provider,
      p_external_id,
      case when p_external_id ~ '^\d+$' then p_external_id::bigint else null end,
      v_team_id, p_account_login, p_account_type, p_user_id, coalesce(p_metadata, '{}'::jsonb),
      p_access_token_ct, p_refresh_token_ct, p_token_dek_id, p_token_expires_at)
  on conflict (provider, external_id) do update
    set team_id           = excluded.team_id,
        account_login     = excluded.account_login,
        account_type      = excluded.account_type,
        provider_metadata = excluded.provider_metadata,
        deleted_at        = null,
        -- A re-link that carries no token keeps the stored one: GitHub's
        -- callback sends none and must not un-credential a GitLab connection.
        access_token_ct   = coalesce(excluded.access_token_ct, paas.installations.access_token_ct),
        refresh_token_ct  = coalesce(excluded.refresh_token_ct, paas.installations.refresh_token_ct),
        token_dek_id      = coalesce(excluded.token_dek_id, paas.installations.token_dek_id),
        token_expires_at  = coalesce(excluded.token_expires_at, paas.installations.token_expires_at);

  return p_team_ref;
end;
$$;

revoke all on function paas.link_installation_verified(uuid, paas.git_provider, text, text, text, text, jsonb, bytea, bytea, text, timestamptz) from public;
grant execute on function paas.link_installation_verified(uuid, paas.git_provider, text, text, text, text, jsonb, bytea, bytea, text, timestamptz) to service_role;
comment on function paas.link_installation_verified(uuid, paas.git_provider, text, text, text, text, jsonb, bytea, bytea, text, timestamptz) is
  'Bind a provider connection to a team AFTER the calling route proved the acting user owns it. service_role only; re-checks the user administers the team. Idempotent per (provider, external_id).';

-- The client-callable variant stays defined for the record but nothing may
-- call it: not authenticated (the hole), and service_role has the verified
-- one.
revoke all on function paas.link_installation(paas.git_provider, text, text, text, text, jsonb, bytea, bytea, text, timestamptz) from public, authenticated;

commit;
