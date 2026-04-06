-- Domain transfer requests table for tracking inbound domain transfers via Name.com.
-- Transfers are long-running (5–7 days) and require status polling.

create table if not exists public.domain_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Domain being transferred
  domain text not null,

  -- Status lifecycle: initiated → pending → approved → completed | failed | cancelled
  status text not null default 'initiated'
    check (status in ('initiated', 'pending', 'approved', 'completed', 'failed', 'cancelled')),

  -- Auth code from current registrar (encrypted at rest via Supabase column encryption)
  -- Cleared after transfer completes or fails permanently
  auth_code_hash text null,

  -- Pricing
  purchase_price numeric(12, 2) null,
  renewal_price numeric(12, 2) null,
  currency text not null default 'USD',

  -- Provider tracking
  provider text not null default 'namecom',
  provider_order_id text null,
  provider_status text null,
  provider_email text null,

  -- Idempotency + dedup
  idempotency_key text null,

  -- Error tracking
  last_error text null,
  failure_reason text null,

  -- Status polling metadata
  last_polled_at timestamptz null,
  poll_count integer not null default 0,

  -- Metadata (premium flag, promo codes, etc.)
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Query by user
create index if not exists idx_domain_transfer_requests_user_created
  on public.domain_transfer_requests (user_id, created_at desc);
-- Active transfers by domain (prevent duplicates)
create unique index if not exists uq_domain_transfer_requests_active_domain
  on public.domain_transfer_requests (domain)
  where status in ('initiated', 'pending', 'approved');
-- Idempotency key per user
create unique index if not exists uq_domain_transfer_requests_user_idempotency
  on public.domain_transfer_requests (user_id, idempotency_key)
  where idempotency_key is not null;
-- For the polling worker: find transfers that need status checks
create index if not exists idx_domain_transfer_requests_pending_poll
  on public.domain_transfer_requests (status, last_polled_at)
  where status in ('initiated', 'pending', 'approved');
-- Updated_at trigger
create or replace function update_domain_transfer_requests_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
drop trigger if exists trg_domain_transfer_requests_updated_at on public.domain_transfer_requests;
create trigger trg_domain_transfer_requests_updated_at
  before update on public.domain_transfer_requests
  for each row
  execute function update_domain_transfer_requests_updated_at();
-- RLS policies
alter table public.domain_transfer_requests enable row level security;
-- Users can only read their own transfer requests
drop policy if exists "Users can view own transfer requests" on public.domain_transfer_requests;
create policy "Users can view own transfer requests"
  on public.domain_transfer_requests
  for select
  using (auth.uid() = user_id);
-- Only service role can insert/update (API routes use service client)
drop policy if exists "Service role can manage transfer requests" on public.domain_transfer_requests;
create policy "Service role can manage transfer requests"
  on public.domain_transfer_requests
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
revoke all on public.domain_transfer_requests from authenticated;
grant select on public.domain_transfer_requests to authenticated;
grant all on public.domain_transfer_requests to service_role;
-- RPC to atomically increment poll_count
create or replace function increment_transfer_poll_count(transfer_id uuid)
returns void as $$
begin
  update public.domain_transfer_requests
  set poll_count = poll_count + 1
  where id = transfer_id;
end;
$$ language plpgsql security definer;
revoke all on function public.increment_transfer_poll_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_transfer_poll_count(uuid) to service_role;
