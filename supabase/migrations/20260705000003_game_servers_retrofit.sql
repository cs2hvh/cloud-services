-- Retrofit the legacy public.game_servers table for the new prepaid-monthly
-- vertical, and extend the transactions service_type allowlist to 'game_server'.

-- ── new columns ─────────────────────────────────────────────────────────────
alter table public.game_servers
  add column if not exists billing_service_id uuid not null default gen_random_uuid(),
  add column if not exists plan_slug text,
  add column if not exists host_id text references public.game_hosts(id),
  add column if not exists region text,
  add column if not exists auto_renew boolean not null default true,
  add column if not exists suspended_at timestamptz,
  add column if not exists grace_until timestamptz,
  add column if not exists monthly_price numeric(10,2),
  add column if not exists ptero_server_id integer,
  add column if not exists ptero_uuid uuid,
  add column if not exists ptero_user_id integer,
  add column if not exists env_blob text,          -- AES-encrypted customer env (license key / GSLT)
  add column if not exists last_error text,
  add column if not exists details jsonb not null default '{}'::jsonb;  -- {provisioning:{stage,progress,message}, ports:{...}}

create unique index if not exists uq_game_servers_billing_service_id on public.game_servers (billing_service_id);
create index if not exists idx_game_servers_host on public.game_servers (host_id);
create index if not exists idx_game_servers_expiry on public.game_servers (ends_at) where status <> 'terminated';

-- ── relax legacy NOT NULLs ──────────────────────────────────────────────────
-- The async provision flow inserts a row as status='provisioning' BEFORE the
-- Pterodactyl server exists, so connection/panel columns start null and are
-- filled once the panel server is created.
do $$ begin
  alter table public.game_servers alter column resources drop not null;
  alter table public.game_servers alter column ip drop not null;
  alter table public.game_servers alter column port drop not null;
  alter table public.game_servers alter column node drop not null;
  alter table public.game_servers alter column identifier drop not null;
  alter table public.game_servers alter column allocation drop not null;
  alter table public.game_servers alter column plan drop not null;
  alter table public.game_servers alter column location_id drop not null;
exception when undefined_column then null; end $$;

-- status is free text (no CHECK) to preserve any legacy rows. Lifecycle values:
--   provisioning | installing | active | suspended | failed | terminated
comment on column public.game_servers.status is
  'provisioning | installing | active | suspended | failed | terminated';
comment on column public.game_servers.ends_at is 'Prepaid expiry — server runs until this, then renew or suspend.';

-- ── admin read + realtime ───────────────────────────────────────────────────
do $$ begin
  create policy "admin reads all game servers" on public.game_servers for select
    using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and 'admin' = any(p.roles)));
exception when duplicate_object then null; end $$;

alter table public.game_servers replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_servers')
  then alter publication supabase_realtime add table public.game_servers; end if;
end $$;

-- ── transactions allowlist += game_server ───────────────────────────────────
-- Keep in lockstep with BillableServiceType in lib/supabase/queries/billing.ts.
alter table billing.transactions drop constraint if exists transactions_service_type_check;
alter table billing.transactions add constraint transactions_service_type_check check (
  service_type is null or service_type in (
    'database','kubernetes','objectspace','spectrum','platform_apps','domain',
    'gpu_pod','compute','custom_image',
    'inference_finetune','inference_serving','inference_deployment','inference_vector',
    'game_server'
  )
);
