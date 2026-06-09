-- Generic key-value store for platform-wide admin toggles (feature flags).
-- Accessed only through the service-role client (admin API + server reads), so
-- RLS stays fully closed to anon/authenticated.

create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.platform_settings enable row level security;
-- Intentionally no policies → deny-all to anon/authenticated. The service role
-- (admin API, server-side reads) bypasses RLS.

-- GPU deployment availability switch. true = customers can deploy GPU pods;
-- false = "out of stock" (e.g. when the upstream GPU account has no balance).
insert into public.platform_settings (key, value)
values ('gpu_deploy_enabled', 'true'::jsonb)
on conflict (key) do nothing;
