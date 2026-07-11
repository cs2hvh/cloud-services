-- Per-platform-user Pterodactyl panel account mapping. Created lazily on first
-- game server order; powers the "panel link + username + password" card in the
-- dashboard. password_enc is AES-encrypted with ENCRYPTION_KEY (Encryption helper).

create table if not exists public.game_panel_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ptero_user_id integer not null,
  username text not null,
  email text not null,
  password_enc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_panel_users enable row level security;
do $$ begin
  create policy "owner reads own panel user" on public.game_panel_users for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

grant select on public.game_panel_users to authenticated;
grant all on public.game_panel_users to service_role;
