-- Safety hardening migration after remote snapshot migrations.
-- This is a forward-only fix and does not rewrite historical migration rows.

create extension if not exists "vector" with schema "extensions";

-- Restore compatibility for legacy code paths that still query public.apps.
-- Maps to the current source of truth: public.platform_apps.
do $$
declare
  v_relkind "char";
begin
  select c.relkind
  into v_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'apps'
  limit 1;

  if v_relkind is null then
    execute $view$
      create view public.apps
      with (security_invoker = true)
      as
      select
        pa.id,
        pa.name,
        pa.repository_url as github_url,
        coalesce(pa.port, 3000) as port,
        pa.user_id,
        pa.project_id,
        pa.status,
        pa.created_at,
        pa.updated_at
      from public.platform_apps pa
    $view$;
  elsif v_relkind = 'v' then
    execute $view$
      create or replace view public.apps
      with (security_invoker = true)
      as
      select
        pa.id,
        pa.name,
        pa.repository_url as github_url,
        coalesce(pa.port, 3000) as port,
        pa.user_id,
        pa.project_id,
        pa.status,
        pa.created_at,
        pa.updated_at
      from public.platform_apps pa
    $view$;
  else
    raise notice 'public.apps exists as relkind %, skipping compatibility view creation.', v_relkind;
  end if;
end
$$;

do $$
declare
  v_relkind "char";
begin
  select c.relkind
  into v_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'apps'
  limit 1;

  if v_relkind = 'v' then
    revoke all on table public.apps from anon;
    revoke all on table public.apps from authenticated;
    revoke all on table public.apps from service_role;

    grant select on table public.apps to authenticated;
    grant select on table public.apps to service_role;
  end if;
end
$$;

-- Tighten billing.user_credits access. Current production state is over-permissive.
do $$
begin
  if to_regclass('billing.user_credits') is null then
    raise notice 'Skipping billing.user_credits hardening: table does not exist.';
    return;
  end if;

  alter table billing.user_credits enable row level security;

  drop policy if exists "Allow read" on billing.user_credits;
  drop policy if exists "Allow update" on billing.user_credits;
  drop policy if exists "Users can view their own credits" on billing.user_credits;
  drop policy if exists "Users can update their own credits" on billing.user_credits;
  drop policy if exists "Users can view own credits" on billing.user_credits;
  drop policy if exists "Users can update own credits" on billing.user_credits;
  drop policy if exists "Service role can manage user credits" on billing.user_credits;

  create policy "Users can view own credits"
  on billing.user_credits
  for select
  to authenticated
  using (auth.uid() = user_id);

  create policy "Users can update own credits"
  on billing.user_credits
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

  create policy "Service role can manage user credits"
  on billing.user_credits
  for all
  to service_role
  using (true)
  with check (true);

  revoke all on table billing.user_credits from anon;
  revoke all on table billing.user_credits from authenticated;
  revoke all on table billing.user_credits from service_role;

  grant select, update on table billing.user_credits to authenticated;
  grant select, insert, update, delete on table billing.user_credits to service_role;
end
$$;
