-- Eight public tables were reachable, and writable, with the public anon key.
--
-- Re-verified 2026-09-03: RLS off, and anon + authenticated holding SELECT,
-- INSERT, UPDATE, DELETE and TRUNCATE on proxmox_hosts (password and
-- token_secret columns), proxmox_templates, public_ip_pools,
-- public_ip_pool_ips, platform_resource_mutation_locks, database_types,
-- service_plans and gpu_pricing. A HEAD request to PostgREST with the anon key
-- from .env returned 200 and a row count for the hypervisor table.
--
-- Two of the eight are new since the August audit: service_plans (the catalog
-- billing.set_price validates against) and gpu_pricing (the GPU quote book,
-- restored by hand on 09-01). "Automatically expose new tables" is how they
-- joined the list; it should be switched off in the Data API settings.
--
-- The application reads every one of these with service_role, which bypasses
-- RLS, except for the old-admin Proxmox routes (moved to service_role in the
-- same commit as this file) and two customer reads of database_types under a
-- user session, which the SELECT policy below keeps working.

-- 1. Operator-only tables: nothing for anon or authenticated.
alter table public.proxmox_hosts                   enable row level security;
alter table public.proxmox_templates               enable row level security;
alter table public.public_ip_pools                 enable row level security;
alter table public.public_ip_pool_ips              enable row level security;
alter table public.platform_resource_mutation_locks enable row level security;

revoke all on table
  public.proxmox_hosts,
  public.proxmox_templates,
  public.public_ip_pools,
  public.public_ip_pool_ips,
  public.platform_resource_mutation_locks
from anon, authenticated;

-- REVOKE ALL ON TABLE does not touch the sequences the same grant covered.
do $$
declare s record;
begin
  for s in
    select sequence_schema, sequence_name
      from information_schema.sequences
     where sequence_schema = 'public'
       and (sequence_name like 'proxmox_%' or sequence_name like 'public_ip_pool%'
            or sequence_name like 'platform_resource_mutation_locks%')
  loop
    execute format('revoke all on sequence %I.%I from anon, authenticated', s.sequence_schema, s.sequence_name);
  end loop;
end $$;

-- 2. Catalog tables: a signed-in customer may read them (the database create
--    wizard reads database_types under the user's session); nobody but
--    service_role writes them; anon gets nothing.
alter table public.database_types enable row level security;
alter table public.service_plans  enable row level security;
alter table public.gpu_pricing    enable row level security;

revoke all on table public.database_types, public.service_plans, public.gpu_pricing from anon, authenticated;
grant select on table public.database_types, public.service_plans, public.gpu_pricing to authenticated;

drop policy if exists "Signed-in users can read database types" on public.database_types;
create policy "Signed-in users can read database types"
  on public.database_types for select to authenticated using (true);

drop policy if exists "Signed-in users can read service plans" on public.service_plans;
create policy "Signed-in users can read service plans"
  on public.service_plans for select to authenticated using (true);

drop policy if exists "Signed-in users can read gpu pricing" on public.gpu_pricing;
create policy "Signed-in users can read gpu pricing"
  on public.gpu_pricing for select to authenticated using (true);

-- 3. SECURITY DEFINER functions that anon and authenticated could execute.
--    Four have no caller at all (create_deposit_transaction let any signed-in
--    user insert a pending top-up of any amount into the ledger); the rest are
--    only ever called with service_role. public.is_admin is deliberately NOT
--    touched: five RLS policies on spectrum_apps and project_logs call it as
--    the querying role.
--
--    EXECUTE is granted to service_role explicitly because revoking from
--    PUBLIC strips the grant service_role inherits — the same thing that
--    stopped charge_service_hour on 2026-08-31 (20260831073727).
do $$
declare f text;
begin
  foreach f in array array[
    'public.create_deposit_transaction(numeric, text, text)',
    'public.increment_agent_usage(uuid, uuid, date, integer, integer)',
    'public.increment_template_deploy_count(uuid)',
    'public.count_recent_deploys(uuid, integer)',
    'public.increment_api_key_usage(uuid)',
    'public.increment_platform_app_bandwidth_purchased_bytes(uuid, uuid, date, date, bigint)',
    'public.claim_platform_app_bandwidth_overage_bytes(uuid, date, bigint)',
    'public.release_platform_app_bandwidth_overage_bytes(uuid, date, bigint)',
    'inference.bootstrap_personal_org(uuid, text)',
    'inference.status_usage_24h()',
    'inference.status_deployments_7d()',
    'inference.status_finetunes_7d()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
