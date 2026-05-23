-- Template Engine v2 / Project Services Platform
-- Fresh pre-migration schema: templates create normal projects, services, endpoints, connections, and durable operations.

drop table if exists operation_events cascade;
drop table if exists operation_steps cascade;
drop table if exists infra_resources cascade;
drop table if exists template_review_requests cascade;
drop table if exists template_test_runs cascade;
drop table if exists service_connections cascade;
drop table if exists service_endpoints cascade;
drop table if exists service_env_vars cascade;
drop table if exists service_secrets cascade;
drop table if exists service_builds cascade;
drop table if exists operations cascade;
drop table if exists services cascade;
drop table if exists projects cascade;
drop table if exists template_versions cascade;
drop table if exists templates cascade;

create table templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  name text not null,
  description text not null default '',
  tags text[] not null default '{}',
  visibility text not null default 'draft'
    check (visibility in ('draft', 'unlisted', 'published', 'archived')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  latest_version_id uuid,
  latest_published_version_id uuid,
  deploy_count int not null default 0,
  icon_url text,
  demo_project_id uuid,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  version int not null check (version > 0),
  schema_version int not null default 1 check (schema_version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'testing', 'tested', 'published', 'deprecated', 'rejected')),
  spec jsonb not null,
  changelog text,
  update_policy text not null default 'none'
    check (update_policy in ('none', 'github')),
  update_source jsonb not null default '{}',
  test_status text not null default 'not_run'
    check (test_status in ('not_run', 'running', 'passed', 'failed')),
  last_test_run_id uuid,
  tested_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

alter table templates
  add constraint templates_latest_version_fk
  foreign key (latest_version_id) references template_versions(id) on delete set null;

alter table templates
  add constraint templates_latest_published_version_fk
  foreign key (latest_published_version_id) references template_versions(id) on delete set null;

create table template_test_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  template_version_id uuid not null references template_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  validation_errors jsonb not null default '[]',
  validation_warnings jsonb not null default '[]',
  service_count int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

alter table template_versions
  add constraint template_versions_last_test_run_fk
  foreign key (last_test_run_id) references template_test_runs(id) on delete set null;

create table template_review_requests (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  template_version_id uuid not null references template_versions(id) on delete cascade,
  requester_id uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_version_id)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete set null,
  template_version_id uuid references template_versions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  namespace text unique not null,
  status text not null default 'creating'
    check (status in ('creating', 'deploying', 'ready', 'degraded', 'failed', 'deleting', 'deleted')),
  desired_spec jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz
);

alter table templates
  add constraint templates_demo_project_fk
  foreign key (demo_project_id) references projects(id) on delete set null;

create table services (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  spec_service_id text,
  name text not null,
  type text not null
    check (type in ('web', 'worker', 'database', 'cache', 'queue')),
  engine text not null default 'generic',
  status text not null default 'pending'
    check (status in ('pending', 'building', 'deploying', 'starting', 'healthy', 'degraded', 'failed', 'deleted')),
  source jsonb not null default '{}',
  config jsonb not null default '{}',
  runtime jsonb not null default '{}',
  networking jsonb not null default '{}',
  health jsonb,
  dependencies text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, spec_service_id),
  unique (project_id, name)
);

create table service_endpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('private', 'public')),
  protocol text not null check (protocol in ('http', 'tcp', 'udp', 'postgres', 'redis', 'mysql', 'mongodb')),
  host text not null,
  port int not null check (port between 1 and 65535),
  url text,
  status text not null default 'planned'
    check (status in ('planned', 'provisioning', 'ready', 'failed', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, name, kind)
);

create table service_env_vars (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  key text not null,
  value_type text not null default 'literal'
    check (value_type in ('literal', 'generated_secret', 'secret_ref', 'service_ref', 'computed', 'input', 'connection_ref')),
  value jsonb not null default '{}',
  managed_by text not null default 'user'
    check (managed_by in ('user', 'template', 'connection', 'system')),
  connection_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, key)
);

create table service_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  key text not null,
  value_ciphertext text,
  provider_ref text,
  created_at timestamptz not null default now(),
  unique (service_id, key),
  check (value_ciphertext is not null or provider_ref is not null)
);

create table service_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  from_service_id uuid not null references services(id) on delete cascade,
  to_service_id uuid not null references services(id) on delete cascade,
  endpoint_id uuid references service_endpoints(id) on delete set null,
  connection_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'failed', 'disconnecting', 'deleted')),
  created_env_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_service_id <> to_service_id)
);

alter table service_env_vars
  add constraint service_env_vars_connection_fk
  foreign key (connection_id) references service_connections(id) on delete set null;

create table operations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null
    check (type in ('create_project', 'create_service', 'update_service', 'update_template', 'delete_project', 'delete_service', 'connect_service', 'disconnect_service', 'restart', 'redeploy', 'rollback', 'retry')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled', 'rolled_back')),
  idempotency_key text,
  request_fingerprint text,
  payload jsonb not null default '{}',
  current_stage text,
  progress_pct int not null default 0 check (progress_pct between 0 and 100),
  error_code text,
  error_message text,
  attempt int not null default 1 check (attempt > 0),
  max_attempts int not null default 3 check (max_attempts > 0),
  locked_by text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index operations_user_idempotency_key_unique
  on operations(user_id, idempotency_key)
  where idempotency_key is not null;

create table service_builds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  operation_id uuid references operations(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  source_repo_url text not null,
  source_branch text not null,
  source_root_dir text not null default '.',
  source_commit text,
  build_strategy text not null
    check (build_strategy in ('dockerfile', 'nixpacks', 'buildpack')),
  image_ref text,
  logs_ref text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table operation_steps (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references operations(id) on delete cascade,
  service_id uuid references services(id) on delete cascade,
  step_key text not null,
  stage text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  attempt int not null default 1 check (attempt > 0),
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, step_key)
);

create table operation_events (
  id bigserial primary key,
  operation_id uuid not null references operations(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  level text not null default 'info'
    check (level in ('debug', 'info', 'warn', 'error')),
  stage text not null,
  status text not null
    check (status in ('pending', 'running', 'success', 'failed', 'skipped')),
  message text not null,
  progress_pct int check (progress_pct between 0 and 100),
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table infra_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  operation_id uuid references operations(id) on delete set null,
  kind text not null,
  name text not null,
  namespace text,
  external_id text,
  status text not null default 'planned'
    check (status in ('planned', 'created', 'ready', 'failed', 'deleting', 'deleted')),
  spec jsonb not null default '{}',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table templates enable row level security;
alter table template_versions enable row level security;
alter table template_test_runs enable row level security;
alter table template_review_requests enable row level security;
alter table projects enable row level security;
alter table services enable row level security;
alter table service_endpoints enable row level security;
alter table service_env_vars enable row level security;
alter table service_secrets enable row level security;
alter table service_connections enable row level security;
alter table service_builds enable row level security;
alter table operations enable row level security;
alter table operation_events enable row level security;
alter table operation_steps enable row level security;
alter table infra_resources enable row level security;

create policy templates_public_read on templates
  for select using (visibility in ('published', 'unlisted'));
create policy templates_owner_all on templates
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy template_versions_public_read on template_versions
  for select using (
    status = 'published'
    and exists (
      select 1 from templates t
      where t.id = template_versions.template_id
        and t.visibility in ('published', 'unlisted')
    )
  );
create policy template_versions_owner_all on template_versions
  for all using (
    exists (select 1 from templates t where t.id = template_versions.template_id and t.owner_id = auth.uid())
  ) with check (
    exists (select 1 from templates t where t.id = template_versions.template_id and t.owner_id = auth.uid())
  );

create policy template_test_runs_owner_read on template_test_runs
  for select using (
    exists (select 1 from templates t where t.id = template_test_runs.template_id and t.owner_id = auth.uid())
  );

create policy template_review_requests_owner_read on template_review_requests
  for select using (
    exists (select 1 from templates t where t.id = template_review_requests.template_id and t.owner_id = auth.uid())
  );

create policy projects_owner_all on projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy services_owner_all on services
  for all using (
    exists (select 1 from projects p where p.id = services.project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = services.project_id and p.user_id = auth.uid())
  );

create policy service_endpoints_owner_read on service_endpoints
  for select using (
    exists (select 1 from projects p where p.id = service_endpoints.project_id and p.user_id = auth.uid())
  );

create policy service_env_vars_owner_read on service_env_vars
  for select using (
    exists (select 1 from projects p where p.id = service_env_vars.project_id and p.user_id = auth.uid())
  );

create policy service_secrets_no_client_read on service_secrets
  for select using (false);

create policy service_connections_owner_read on service_connections
  for select using (
    exists (select 1 from projects p where p.id = service_connections.project_id and p.user_id = auth.uid())
  );

create policy service_builds_owner_read on service_builds
  for select using (
    exists (select 1 from projects p where p.id = service_builds.project_id and p.user_id = auth.uid())
  );

-- Clients may only SELECT their own operations.
-- INSERT / UPDATE / DELETE are exclusively via service-role (worker + API routes).
create policy operations_owner_select on operations
  for select using (user_id = auth.uid());

create policy operation_events_owner_read on operation_events
  for select using (
    exists (select 1 from operations o where o.id = operation_events.operation_id and o.user_id = auth.uid())
  );

create policy operation_steps_owner_read on operation_steps
  for select using (
    exists (select 1 from operations o where o.id = operation_steps.operation_id and o.user_id = auth.uid())
  );

create policy infra_resources_owner_read on infra_resources
  for select using (
    exists (select 1 from projects p where p.id = infra_resources.project_id and p.user_id = auth.uid())
  );

create index idx_templates_slug on templates(slug);
create index idx_templates_owner on templates(owner_id);
create index idx_templates_published_version on templates(latest_published_version_id);
create index idx_template_versions_template on template_versions(template_id);
create index idx_template_versions_status on template_versions(template_id, status);
create index idx_template_test_runs_template_version on template_test_runs(template_version_id);
create index idx_template_review_requests_status on template_review_requests(status);
create index idx_projects_user on projects(user_id);
create index idx_projects_status on projects(status);
create index idx_services_project on services(project_id);
create index idx_service_endpoints_service on service_endpoints(service_id);
create index idx_service_connections_project on service_connections(project_id);
create index idx_service_connections_from on service_connections(from_service_id);
create index idx_service_connections_to on service_connections(to_service_id);
create unique index service_connections_active_unique
  on service_connections(from_service_id, to_service_id, connection_type)
  where status in ('pending', 'active', 'disconnecting');
create index idx_service_env_vars_service on service_env_vars(service_id);
create index idx_service_env_vars_service_type on service_env_vars(service_id, value_type);
create index idx_service_builds_project on service_builds(project_id);
create index idx_service_builds_service on service_builds(service_id);
create index idx_service_builds_reuse
  on service_builds(project_id, service_id, source_repo_url, source_branch, source_root_dir, source_commit, status);
create index idx_operations_project on operations(project_id);
create index idx_operations_project_status on operations(project_id, status);
create index idx_operations_user on operations(user_id);
create index idx_operations_worker_queue
  on operations(status, next_attempt_at, lease_expires_at)
  where status in ('queued', 'running', 'waiting');
create index idx_operation_steps_operation on operation_steps(operation_id);
create index idx_operation_events_operation_id_id on operation_events(operation_id, id);
create index idx_infra_resources_project on infra_resources(project_id);

create or replace function increment_template_deploy_count(p_template_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update templates
  set deploy_count = deploy_count + 1
  where id = p_template_id;
$$;

revoke execute on function increment_template_deploy_count(uuid) from public;
grant execute on function increment_template_deploy_count(uuid) to service_role;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_templates_updated_at
  before update on templates
  for each row execute function set_updated_at();

create trigger trg_template_review_requests_updated_at
  before update on template_review_requests
  for each row execute function set_updated_at();

create trigger trg_projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

create trigger trg_services_updated_at
  before update on services
  for each row execute function set_updated_at();

create trigger trg_service_endpoints_updated_at
  before update on service_endpoints
  for each row execute function set_updated_at();

create trigger trg_service_env_vars_updated_at
  before update on service_env_vars
  for each row execute function set_updated_at();

create trigger trg_service_connections_updated_at
  before update on service_connections
  for each row execute function set_updated_at();

create trigger trg_service_builds_updated_at
  before update on service_builds
  for each row execute function set_updated_at();

create trigger trg_operations_updated_at
  before update on operations
  for each row execute function set_updated_at();

create trigger trg_operation_steps_updated_at
  before update on operation_steps
  for each row execute function set_updated_at();

create trigger trg_infra_resources_updated_at
  before update on infra_resources
  for each row execute function set_updated_at();

-- ── Deploy rate-limit helper ───────────────────────────────────────────────
-- Returns the number of create_project operations the user has started in
-- the last `window_seconds` seconds. Used by the API to enforce rate limits
-- without a full table scan.
create or replace function count_recent_deploys(p_user_id uuid, window_seconds int default 60)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select count(*)
  from operations
  where user_id = p_user_id
    and type = 'create_project'
    and created_at >= now() - (window_seconds || ' seconds')::interval;
$$;

revoke execute on function count_recent_deploys(uuid, int) from public;
grant execute on function count_recent_deploys(uuid, int) to service_role;
