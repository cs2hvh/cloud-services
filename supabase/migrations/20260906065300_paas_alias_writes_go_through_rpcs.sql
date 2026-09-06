-- Any project member could claim any hostname by inserting a paas.aliases row
-- directly through PostgREST.
--
-- Proven live on 2026-09-06: a customer JWT inserted
-- pentest-probe-f1-20260906.ahurasense.com and then fallback.ahurasense.com,
-- the Cloudflare for SaaS fallback origin, and both came back 201 Created.
-- aliases_write checked only that the caller was a member of the project the
-- row named, which is always their own. The reserved-label list lived in
-- lib/paas/hostnames.ts and ran only in the deploy path; a request that never
-- executes application code never met it, and the reconciler then built an
-- Ingress for whatever the row said.
--
-- The 2026-09-05 pass recorded this as unfixed because the answer needs design
-- rather than a policy tweak, and this is the design:
--
--   1. authenticated loses INSERT, UPDATE and DELETE on paas.aliases, and
--      aliases_write is dropped. SELECT and aliases_read stay: the dashboard
--      lists aliases through RLS as before.
--
--   2. The three writes the product actually makes become SECURITY DEFINER
--      functions that re-check membership themselves and accept only the
--      specific change each route needs:
--        alias_point(alias_ref, deployment_ref)    promote or roll back
--        alias_attach_domain(project_id, hostname) give a claimed custom domain
--                                                  its routing alias
--        alias_release(project_id[, hostname])     give a hostname up
--      None of them takes a free hostname for the platform zone. A custom
--      alias must name a domain the project has already claimed in
--      paas.domains, and a customer domain is never under a platform zone.
--
--   3. The reserved set is mirrored into paas.reserved_labels, and a trigger
--      refuses any alias whose hostname is a reserved label under a platform
--      zone, the zone apex itself, a protocol (underscore) label, or a name
--      more than one label deep (outside the wildcard certificate, and how
--      _acme-challenge.<victim> would be minted). The trigger runs for every
--      role, including service_role, so the deploy path is covered twice.
--      tests/unit/security/paas-reserved-labels.test.ts fails if this seed and
--      lib/paas/hostnames.ts RESERVED_LABELS ever differ, which is the drift
--      the 09-05 note was worried about.
--
-- Checked before writing: no live alias sits on a reserved label, none is more
-- than one label under a zone, and none equals a zone apex, so the trigger
-- refuses nothing that exists.

begin;

-- ── 1. the reserved set, as data ─────────────────────────────────────────────

create table if not exists paas.reserved_labels (
  label text primary key,
  constraint reserved_labels_lower check (label = lower(label))
);
comment on table paas.reserved_labels is
  'Labels no tenant may claim under a platform zone. Mirror of lib/paas/hostnames.ts RESERVED_LABELS; a unit test keeps the two identical.';

create table if not exists paas.platform_zones (
  zone text primary key,
  constraint platform_zones_lower check (zone = lower(zone))
);
comment on table paas.platform_zones is
  'Zones the platform mints app hostnames under. Mirror of app/api/v2/_lib/domains.ts RESERVED_SUFFIXES.';

alter table paas.reserved_labels enable row level security;
alter table paas.platform_zones  enable row level security;
revoke all on paas.reserved_labels, paas.platform_zones from anon, authenticated, public;
grant select on paas.reserved_labels, paas.platform_zones to service_role;

insert into paas.platform_zones (zone) values ('ahurasense.com'), ('apps.ahurasense.com')
on conflict do nothing;

insert into paas.reserved_labels (label) values
  ('_acme-challenge'),
  ('_dmarc'),
  ('_domainkey'),
  ('_well-known'),
  ('account'),
  ('accounts'),
  ('activator'),
  ('admin'),
  ('ahura'),
  ('ahurasense'),
  ('api'),
  ('app'),
  ('apps'),
  ('auth'),
  ('autoconfig'),
  ('autodiscover'),
  ('beta'),
  ('billing'),
  ('blog'),
  ('cdn'),
  ('checkout'),
  ('cluster'),
  ('confirm'),
  ('connect'),
  ('console'),
  ('cpanel'),
  ('customer'),
  ('dallas1'),
  ('dashboard'),
  ('db-testing'),
  ('db-testing-1'),
  ('dev'),
  ('dev1'),
  ('docs'),
  ('email'),
  ('fallback'),
  ('ftp'),
  ('games'),
  ('gateway'),
  ('git'),
  ('grafana'),
  ('help'),
  ('id'),
  ('identity'),
  ('imap'),
  ('indnode'),
  ('ingress'),
  ('internal'),
  ('invoice'),
  ('invoices'),
  ('kubernetes'),
  ('legal'),
  ('localhost'),
  ('login'),
  ('logout'),
  ('mail'),
  ('manage'),
  ('metrics'),
  ('mx'),
  ('my'),
  ('ns'),
  ('ns1'),
  ('ns2'),
  ('ns3'),
  ('ns4'),
  ('oauth'),
  ('operator'),
  ('owa'),
  ('paas'),
  ('pay'),
  ('payment'),
  ('payments'),
  ('pop'),
  ('pop3'),
  ('portal'),
  ('preview'),
  ('privacy'),
  ('private'),
  ('prod'),
  ('production'),
  ('prometheus'),
  ('proxy'),
  ('register'),
  ('registry'),
  ('reset'),
  ('root'),
  ('secure'),
  ('security'),
  ('send'),
  ('signin'),
  ('signup'),
  ('smtp'),
  ('ssh'),
  ('ssl'),
  ('sso'),
  ('staging'),
  ('static'),
  ('status'),
  ('support'),
  ('terms'),
  ('test'),
  ('test1'),
  ('trade'),
  ('traefik'),
  ('trust'),
  ('verify'),
  ('vpn'),
  ('wallet'),
  ('webmail'),
  ('whm'),
  ('www'),
  ('www1'),
  ('www2')
on conflict do nothing;

-- ── 2. the rule, callable by anyone, enforced by a trigger ───────────────────

create or replace function paas.hostname_is_reserved(p_hostname text)
returns boolean
language plpgsql
stable
security definer
set search_path = paas, pg_catalog
as $$
declare
  v_host  text := lower(btrim(coalesce(p_hostname, '')));
  v_zone  text;
  v_label text;
begin
  -- The most specific platform zone this hostname sits under. A hostname under
  -- none of them is a customer's own domain and is not ours to reserve.
  select z.zone into v_zone
    from paas.platform_zones z
   where v_host = z.zone or v_host like '%.' || z.zone
   order by length(z.zone) desc
   limit 1;
  if v_zone is null then
    return false;
  end if;
  if v_host = v_zone then
    return true;
  end if;
  v_label := left(v_host, length(v_host) - length(v_zone) - 1);
  -- Two labels deep is outside the wildcard certificate, and it is also how
  -- _acme-challenge.<victim>.<zone> would be spelled.
  if position('.' in v_label) > 0 then
    return true;
  end if;
  if left(v_label, 1) = '_' then
    return true;
  end if;
  return exists (select 1 from paas.reserved_labels r where r.label = v_label);
end;
$$;
revoke all on function paas.hostname_is_reserved(text) from public;
grant execute on function paas.hostname_is_reserved(text) to authenticated, service_role;
comment on function paas.hostname_is_reserved(text) is
  'True when no tenant may hold this hostname: a platform zone apex, a reserved or protocol label under one, or a name more than one label deep under one.';

create or replace function paas.tg_aliases_reserved_guard()
returns trigger
language plpgsql
as $$
begin
  if paas.hostname_is_reserved(new.hostname) then
    raise exception 'hostname % is reserved by the platform', new.hostname
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists aliases_reserved_guard on paas.aliases;
create trigger aliases_reserved_guard
  before insert or update of hostname on paas.aliases
  for each row execute function paas.tg_aliases_reserved_guard();

-- ── 3. the three writes the product makes ────────────────────────────────────

-- Promote or roll back: move ONE alias of the caller's project to ONE ready
-- deployment of the same project. Nothing else about the row can change.
create or replace function paas.alias_point(p_alias_ref text, p_deployment_ref text)
returns uuid
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare
  v_alias paas.aliases%rowtype;
  v_dep   paas.deployments%rowtype;
  v_team  uuid;
begin
  if auth.uid() is null then
    raise exception 'alias_point requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  select a.* into v_alias
    from paas.aliases a
   where a.ref = p_alias_ref and a.released_at is null;
  if not found then
    raise exception 'alias % not found', p_alias_ref using errcode = 'no_data_found';
  end if;

  -- Not a member: the same answer as absent, so the call confirms nothing.
  select p.team_id into v_team
    from paas.projects p
   where p.id = v_alias.project_id and p.deleted_at is null;
  if v_team is null or not paas.has_team_access(v_team, 'member') then
    raise exception 'alias % not found', p_alias_ref using errcode = 'no_data_found';
  end if;

  -- The deployment must belong to the SAME project. Without this a caller on
  -- two projects could point one project's hostname at the other's image.
  select d.* into v_dep
    from paas.deployments d
   where d.ref = p_deployment_ref and d.project_id = v_alias.project_id;
  if not found then
    raise exception 'deployment % not found', p_deployment_ref using errcode = 'no_data_found';
  end if;
  if v_dep.state <> 'ready' then
    raise exception 'deployment % is "%", not "ready"', p_deployment_ref, v_dep.state
      using errcode = 'check_violation';
  end if;

  update paas.aliases set deployment_id = v_dep.id where id = v_alias.id;
  return v_alias.id;
end;
$$;

-- Give a claimed custom domain its routing alias, pointed at whatever
-- production serves. The hostname must already be a live paas.domains row of
-- this project; that row passed the route's shape and reserved-suffix checks
-- and the table's own constraints, and it is the only thing a tenant may turn
-- into an alias. Idempotent: a released alias for the same name is reused.
create or replace function paas.alias_attach_domain(p_project_id uuid, p_hostname text)
returns uuid
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare
  v_host       text := lower(btrim(coalesce(p_hostname, '')));
  v_team       uuid;
  v_production uuid;
  v_id         uuid;
begin
  if auth.uid() is null then
    raise exception 'alias_attach_domain requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  select p.team_id into v_team
    from paas.projects p
   where p.id = p_project_id and p.deleted_at is null;
  if v_team is null or not paas.has_team_access(v_team, 'member') then
    raise exception 'project not found' using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1 from paas.domains d
     where d.project_id = p_project_id and d.domain = v_host and d.state <> 'removed'
  ) then
    raise exception 'domain % is not claimed by this project', v_host
      using errcode = 'no_data_found';
  end if;

  -- A customer's domain is never under a platform zone, whatever the domains
  -- row says. The route refuses this too; this is the copy that cannot be
  -- skipped.
  if exists (
    select 1 from paas.platform_zones z where v_host = z.zone or v_host like '%.' || z.zone
  ) then
    raise exception 'hostname % belongs to the platform', v_host
      using errcode = 'check_violation';
  end if;

  select a.deployment_id into v_production
    from paas.aliases a
   where a.project_id = p_project_id and a.kind = 'production' and a.released_at is null;

  select a.id into v_id
    from paas.aliases a
   where a.project_id = p_project_id and a.hostname = v_host;

  if v_id is not null then
    update paas.aliases
       set released_at = null, deployment_id = v_production
     where id = v_id;
  else
    insert into paas.aliases (project_id, hostname, kind, deployment_id)
    values (p_project_id, v_host, 'custom', v_production)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Give hostnames up, keeping the rows. With a hostname: that one custom alias
-- (a member cannot release the project's own production name by hand, which
-- would leave the app unroutable and the name claimable). Without: every
-- alias, which is project teardown. Never un-releases.
create or replace function paas.alias_release(p_project_id uuid, p_hostname text default null)
returns integer
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare
  v_team uuid;
  v_n    integer;
begin
  if auth.uid() is null then
    raise exception 'alias_release requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  -- No deleted_at filter: the project route soft-deletes first and releases
  -- second, and a member releasing a deleted project's names is the point.
  select p.team_id into v_team from paas.projects p where p.id = p_project_id;
  if v_team is null or not paas.has_team_access(v_team, 'member') then
    raise exception 'project not found' using errcode = 'no_data_found';
  end if;

  update paas.aliases
     set released_at = now()
   where project_id = p_project_id
     and released_at is null
     and (p_hostname is null
          or (kind = 'custom' and hostname = lower(btrim(p_hostname))));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function paas.alias_point(text, text)           from public;
revoke all on function paas.alias_attach_domain(uuid, text)   from public;
revoke all on function paas.alias_release(uuid, text)         from public;
grant execute on function paas.alias_point(text, text)         to authenticated;
grant execute on function paas.alias_attach_domain(uuid, text) to authenticated;
grant execute on function paas.alias_release(uuid, text)       to authenticated;

comment on function paas.alias_point(text, text) is
  'Promote or roll back: point one alias at one ready deployment of the same project. SECURITY DEFINER; re-checks member access.';
comment on function paas.alias_attach_domain(uuid, text) is
  'Give a claimed custom domain its routing alias. The hostname must be a live paas.domains row of the project and never under a platform zone.';
comment on function paas.alias_release(uuid, text) is
  'Release one custom alias by hostname, or every alias of the project. Keeps rows; never un-releases.';

-- ── 4. close the door ────────────────────────────────────────────────────────

revoke insert, update, delete on paas.aliases from authenticated;
drop policy if exists aliases_write on paas.aliases;

commit;
