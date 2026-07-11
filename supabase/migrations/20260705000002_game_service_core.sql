-- Game-servers vertical — core catalog, plans, host inventory, and event log.
-- Billing model is PREPAID MONTHLY (one-time charge per month, renewal cron),
-- NOT hourly metering — so there is no billing.active_* meter table here.
-- Mirrors the instance_plans / proxmox_hosts / gpu_pod_events house patterns.

-- ── shared updated_at trigger fn ────────────────────────────────────────────
create or replace function public.game_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── game_catalog : the supported games + their Pterodactyl egg wiring ────────
create table if not exists public.game_catalog (
  id text primary key,                               -- 'minecraft' | 'rust' | 'cs2' | 'fivem'
  display_name text not null,
  description text,
  nest_id integer not null default 0,                -- pterodactyl nest id
  egg_id integer not null default 0,                 -- pterodactyl egg id
  docker_image text not null default '',
  startup text,                                      -- optional startup override (null = egg default)
  default_environment jsonb not null default '{}'::jsonb,   -- egg env values we always set
  env_schema jsonb not null default '[]'::jsonb,     -- [{key,label,required,secret,customer_editable,default,help}]
  port_plan jsonb not null default '[]'::jsonb,      -- extra allocations beyond primary: [{name,proto}]
  credential_field text,                             -- 'FIVEM_LICENSE' | 'STEAM_ACC' | null (BYO license)
  min_memory_mb integer not null default 1024,
  min_disk_gb integer not null default 5,
  requires_eula boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_game_catalog_updated_at on public.game_catalog;
create trigger trg_game_catalog_updated_at before update on public.game_catalog
  for each row execute function public.game_set_updated_at();

-- ── game_server_plans : prepaid monthly tiers per game ──────────────────────
create table if not exists public.game_server_plans (
  slug text primary key,
  game_type text not null references public.game_catalog(id) on delete cascade,
  name text not null,
  tagline text,
  cpu_pct integer not null default 100,              -- pterodactyl cpu units (100 = 1 thread)
  memory_mb integer not null,
  disk_gb integer not null,
  swap_mb integer not null default 0,
  databases integer not null default 0,
  backups integer not null default 1,
  extra_allocations integer not null default 0,
  monthly_price numeric(10,2) not null,              -- one-time charge; server runs ~30 days
  allowed_regions text[],                            -- null = all regions
  allowed_host_ids text[],                           -- null = any host in region
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists idx_game_server_plans_game on public.game_server_plans (game_type, sort_order);
drop trigger if exists trg_game_server_plans_updated_at on public.game_server_plans;
create trigger trg_game_server_plans_updated_at before update on public.game_server_plans
  for each row execute function public.game_set_updated_at();

-- ── game_hosts : the machines (Wings nodes), grouped by region ──────────────
create table if not exists public.game_hosts (
  id text primary key,                               -- e.g. 'dallas1'
  name text not null,
  region text not null default 'default',            -- 'us-dallas', 'india', 'germany' ...
  display_region text not null default 'Default',    -- 'Dallas, US'
  fqdn text not null,                                -- node hostname (TLS + console)
  ip text,
  ptero_location_id integer,
  ptero_node_id integer,
  total_cpu_cores integer not null default 0,
  total_memory_mb integer not null default 0,
  total_disk_gb integer not null default 0,
  memory_overallocate_pct integer not null default 0,
  cpu_oversubscription_ratio integer not null default 3,
  allowed_games text[],                              -- null = all games; else restrict placement
  status text not null default 'provisioning'
    check (status in ('provisioning','online','maintenance','offline','failed')),
  provision jsonb not null default '{}'::jsonb,      -- bootstrap progress {stage,progress,message}
  last_heartbeat_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_game_hosts_region on public.game_hosts (region, status);
drop trigger if exists trg_game_hosts_updated_at on public.game_hosts;
create trigger trg_game_hosts_updated_at before update on public.game_hosts
  for each row execute function public.game_set_updated_at();

-- ── game_server_events : per-server audit/lifecycle log ─────────────────────
create table if not exists public.game_server_events (
  id bigserial primary key,
  server_id bigint not null references public.game_servers(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_game_server_events_server on public.game_server_events (server_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Catalog + plans: any authenticated user may read; only admins may write.
alter table public.game_catalog enable row level security;
alter table public.game_server_plans enable row level security;
alter table public.game_hosts enable row level security;
alter table public.game_server_events enable row level security;

do $$ begin
  create policy "read catalog" on public.game_catalog for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "admin write catalog" on public.game_catalog for all
    using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and 'admin' = any(p.roles)))
    with check (exists (select 1 from public.user_profiles p where p.id = auth.uid() and 'admin' = any(p.roles)));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "read active plans" on public.game_server_plans for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "admin write plans" on public.game_server_plans for all
    using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and 'admin' = any(p.roles)))
    with check (exists (select 1 from public.user_profiles p where p.id = auth.uid() and 'admin' = any(p.roles)));
exception when duplicate_object then null; end $$;

-- Hosts: admin-only (customer region list is exposed via a server-side endpoint
-- that strips credentials; service_role bypasses RLS for provisioning).
do $$ begin
  create policy "admin manage hosts" on public.game_hosts for all
    using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and 'admin' = any(p.roles)))
    with check (exists (select 1 from public.user_profiles p where p.id = auth.uid() and 'admin' = any(p.roles)));
exception when duplicate_object then null; end $$;

-- Events: owner reads via the parent server row.
do $$ begin
  create policy "owner reads own server events" on public.game_server_events for select
    using (exists (select 1 from public.game_servers s where s.id = server_id and s.user_id = auth.uid()));
exception when duplicate_object then null; end $$;

grant select on public.game_catalog to anon, authenticated;
grant select on public.game_server_plans to anon, authenticated;
grant select on public.game_server_events to authenticated;
grant all on public.game_catalog, public.game_server_plans, public.game_hosts, public.game_server_events to service_role;
grant usage, select on sequence public.game_server_events_id_seq to service_role;

-- ── realtime ────────────────────────────────────────────────────────────────
alter table public.game_hosts replica identity full;
alter table public.game_server_events replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_hosts')
  then alter publication supabase_realtime add table public.game_hosts; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_server_events')
  then alter publication supabase_realtime add table public.game_server_events; end if;
end $$;

-- ── seeds ───────────────────────────────────────────────────────────────────
-- Phase 1 games are Minecraft + Rust (real egg ids on the live panel).
-- CS2 + FiveM are inactive placeholders until their eggs are imported (Phase 2);
-- both use BYO credentials (customer's own GSLT / cfx.re key).
insert into public.game_catalog
  (id, display_name, description, nest_id, egg_id, docker_image, startup, default_environment, env_schema, port_plan, credential_field, min_memory_mb, min_disk_gb, requires_eula, is_active, sort_order)
values
  ('minecraft','Minecraft','Java Edition — Paper (plugins).',1,4,'ghcr.io/pterodactyl/yolks:java_25',
   'java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}}',
   '{"SERVER_JARFILE":"server.jar","BUILD_NUMBER":"latest"}'::jsonb,
   '[{"key":"MINECRAFT_VERSION","label":"Version","required":false,"secret":false,"customer_editable":true,"default":"latest","help":"Minecraft version or \"latest\""}]'::jsonb,
   '[]'::jsonb, null, 2048, 10, true, true, 1),

  ('rust','Rust','RustDedicated via SteamCMD — Oxide/Carbon supported.',4,14,'ghcr.io/pterodactyl/games:rust',
   './RustDedicated -batchmode +server.port {{SERVER_PORT}} +server.queryport {{QUERY_PORT}} +server.identity "rust" +rcon.port {{RCON_PORT}} +rcon.web true +server.hostname \"{{HOSTNAME}}\" +server.level \"{{LEVEL}}\" +server.description \"{{DESCRIPTION}}\" +server.url \"{{SERVER_URL}}\" +server.headerimage \"{{SERVER_IMG}}\" +server.logoimage \"{{SERVER_LOGO}}\" +server.maxplayers {{MAX_PLAYERS}} +rcon.password \"{{RCON_PASS}}\" +server.saveinterval {{SAVEINTERVAL}} +app.port {{APP_PORT}}  $( [ -z ${MAP_URL} ] && printf %s "+server.worldsize \"{{WORLD_SIZE}}\" +server.seed \"{{WORLD_SEED}}\"" || printf %s "+server.levelurl {{MAP_URL}}" ) {{ADDITIONAL_ARGS}}',
   '{"FRAMEWORK":"vanilla","LEVEL":"Procedural Map","SAVEINTERVAL":"60","DESCRIPTION":"Powered by AhuraSense","SERVER_URL":"https://ahurasense.com","SERVER_IMG":"","SERVER_LOGO":"","WORLD_SEED":"","MAP_URL":"","ADDITIONAL_ARGS":""}'::jsonb,
   '[{"key":"HOSTNAME","label":"Server name","required":true,"secret":false,"customer_editable":true,"default":"A Rust Server"},
     {"key":"MAX_PLAYERS","label":"Max players","required":true,"secret":false,"customer_editable":true,"default":"40"},
     {"key":"WORLD_SIZE","label":"World size","required":true,"secret":false,"customer_editable":true,"default":"3000"},
     {"key":"FRAMEWORK","label":"Modding framework","required":true,"secret":false,"customer_editable":true,"default":"vanilla","help":"vanilla, oxide, or carbon"}]'::jsonb,
   '[{"name":"query","proto":"udp","env":"QUERY_PORT"},{"name":"rcon","proto":"tcp","env":"RCON_PORT"},{"name":"app","proto":"tcp","env":"APP_PORT"}]'::jsonb,
   null, 6144, 20, false, true, 2),

  ('cs2','Counter-Strike 2','CS2 dedicated server. Requires your own Steam GSLT.',0,0,'',
   '{}'::jsonb,
   '[{"key":"STEAM_ACC","label":"Steam GSLT token","required":true,"secret":true,"customer_editable":true,"default":"","help":"Generate at steamcommunity.com/dev/managegameservers (app 730). Tied to your Steam account."}]'::jsonb,
   '[{"name":"sourcetv","proto":"udp"}]'::jsonb,
   'STEAM_ACC', 2048, 60, false, false, 3),

  ('fivem','FiveM (GTA V)','FXServer + txAdmin. Requires your own cfx.re license key.',0,0,'',
   '{}'::jsonb,
   '[{"key":"FIVEM_LICENSE","label":"cfx.re license key","required":true,"secret":true,"customer_editable":true,"default":"","help":"Register at portal.cfx.re on your own account. Keys are non-transferable."}]'::jsonb,
   '[{"name":"txadmin","proto":"tcp"}]'::jsonb,
   'FIVEM_LICENSE', 4096, 30, false, false, 4)
on conflict (id) do nothing;

-- Launch plan grid (monthly, prepaid). Admin-editable afterwards.
insert into public.game_server_plans
  (slug, game_type, name, tagline, cpu_pct, memory_mb, disk_gb, backups, extra_allocations, monthly_price, is_active, sort_order)
values
  ('mc-2g','minecraft','Minecraft 2GB','Small SMP / vanilla',150,2048,10,2,0,4.00,true,1),
  ('mc-4g','minecraft','Minecraft 4GB','Light plugins',200,4096,20,2,0,8.00,true,2),
  ('mc-8g','minecraft','Minecraft 8GB','Modpacks / big networks',300,8192,40,2,0,15.00,true,3),
  ('mc-12g','minecraft','Minecraft 12GB','Heavy modded',400,12288,60,3,0,22.00,true,4),
  ('rust-6g','rust','Rust 6GB','Up to ~80 pop',300,6144,30,2,3,18.00,true,5),
  ('rust-8g','rust','Rust 8GB','~100 pop',400,8192,40,2,3,24.00,true,6),
  ('rust-12g','rust','Rust 12GB','Large / modded',500,12288,60,3,3,34.00,true,7)
on conflict (slug) do nothing;
