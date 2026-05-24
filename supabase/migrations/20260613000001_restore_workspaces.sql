-- The template_engine migration (20260612000001) dropped the original `projects`
-- table (owner/users/description/default_project — the VPS/cluster/game-server
-- workspace concept) and replaced it with a new table of the same name for the
-- cloud-services stack concept (namespace, user_id, status, etc.).
--
-- This migration fixes that name collision by:
--   1. Renaming the new cloud-stacks table to `stacks`.
--      PostgreSQL automatically updates all FK constraints that reference it,
--      so no manual FK re-pointing is needed for services/operations/etc.
--   2. Renaming the stale RLS policy on the now-renamed table.
--   3. Re-creating the original `projects` table with its original schema.
--   4. Restoring RLS policies and FK constraints from the tables that depended
--      on the original projects table (activities, clusters, game_servers, etc.).
--   5. Restoring handle_new_user() to create a default project on signup.
--
-- Application code: all template-engine routes (app/api/instances/*, lib/templates/*,
-- lib/workers/*) are updated in the same commit to use `stacks` instead of `projects`.
-- Old platform code (lib/supabase/queries.ts, app/api/projects/*, etc.) is unchanged.

-- ── 1. Rename new cloud-stacks projects → stacks ──────────────────────────────
-- All FK constraints on services, operations, service_endpoints, etc. are
-- automatically re-pointed to `stacks` by PostgreSQL on rename.

alter table projects rename to stacks;

-- Rename the stale RLS policy that came with the renamed table.
drop policy if exists projects_owner_all on stacks;
create policy stacks_owner_all on stacks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 2. Re-create original projects table ─────────────────────────────────────

create table projects (
  id              uuid        primary key default extensions.uuid_generate_v4(),
  name            text        not null,
  description     text,
  default_project boolean     default false,
  created_at      timestamptz default now(),
  owner           uuid        references auth.users(id) on delete cascade,
  users           jsonb       default '[]'::jsonb
);

alter table projects enable row level security;

create policy "Project owners can delete their projects"
  on projects for delete using (auth.uid() = owner);

create policy "Project owners can update their projects"
  on projects for update using (auth.uid() = owner);

create policy "Users can create projects"
  on projects for insert with check (auth.uid() = owner);

create policy "Users can view projects they are part of"
  on projects for select using (
    auth.uid() = owner
    or (auth.uid())::text in (
      select jsonb_array_elements_text(projects.users)
    )
  );

grant all on table projects to anon;
grant all on table projects to authenticated;
grant all on table projects to service_role;

-- ── 3. Restore FK constraints from tables that referenced the original projects ─
-- Use NOT VALID so existing orphaned project_id values are not rejected.
-- Constraints were cascade-dropped when the original table was dropped.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'project_id'
  ) then
    alter table activities
      add constraint activities_project_id_fkey
      foreign key (project_id) references projects(id)
      on delete cascade not valid;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clusters' and column_name = 'project_id'
  ) then
    alter table clusters
      add constraint clusters_project_id_fkey
      foreign key (project_id) references projects(id) not valid;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'database_cluster' and column_name = 'project_id'
  ) then
    alter table database_cluster
      add constraint database_cluster_project_id_fkey
      foreign key (project_id) references projects(id) not valid;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'game_servers' and column_name = 'project_id'
  ) then
    alter table game_servers
      add constraint game_servers_project_id_fkey
      foreign key (project_id) references projects(id)
      on delete cascade not valid;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'object_spaces' and column_name = 'project_id'
  ) then
    alter table object_spaces
      add constraint object_spaces_project_id_fkey
      foreign key (project_id) references projects(id)
      on delete cascade not valid;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_logs' and column_name = 'project_id'
  ) then
    alter table project_logs
      add constraint project_logs_project_id_fkey
      foreign key (project_id) references projects(id)
      on delete cascade not valid;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'spectrum_apps' and column_name = 'project_id'
  ) then
    alter table spectrum_apps
      add constraint spectrum_apps_project_id_fkey
      foreign key (project_id) references projects(id)
      on delete cascade not valid;
  end if;
end $$;

-- ── 4. Restore handle_new_user() to create a default project on signup ────────

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'username', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;

  insert into public.projects (name, description, default_project, owner, users)
  select
    'My First Project',
    'Default project created automatically.',
    true,
    new.id,
    jsonb_build_array(new.id::text)
  where not exists (
    select 1 from public.projects p where p.owner = new.id
  );

  return new;
end;
$$ language plpgsql security definer;

-- Backfill: create a default project for any existing user who has none.
insert into public.projects (name, description, default_project, owner, users)
select
  'My First Project',
  'Default project created automatically.',
  true,
  u.id,
  jsonb_build_array(u.id::text)
from auth.users u
where not exists (
  select 1 from public.projects p where p.owner = u.id
);
