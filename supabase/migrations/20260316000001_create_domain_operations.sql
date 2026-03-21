-- Domain service tables for asynchronous lifecycle and reseller purchase tracking.

create table if not exists public.domain_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  domain_id uuid null,
  idempotency_key text null,
  request_data jsonb not null default '{}'::jsonb,
  response_data jsonb null,
  provider_request_id text null,
  error_code text null,
  error_message text null,
  retryable boolean not null default false,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_domain_operations_user_created
  on public.domain_operations (user_id, created_at desc);
create index if not exists idx_domain_operations_status
  on public.domain_operations (status);
create unique index if not exists uq_domain_operations_idempotency
  on public.domain_operations (user_id, action, idempotency_key)
  where idempotency_key is not null;
create table if not exists public.domain_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  app_id uuid not null,
  domain text not null,
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed', 'failed', 'cancelled')),
  purchase_price numeric(12, 2) null,
  renewal_price numeric(12, 2) null,
  currency text not null default 'USD',
  provider text not null default 'namecom',
  idempotency_key text null,
  provider_request_id text null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_domain_purchase_requests_user_created
  on public.domain_purchase_requests (user_id, created_at desc);
create index if not exists idx_domain_purchase_requests_app_created
  on public.domain_purchase_requests (app_id, created_at desc);
create index if not exists idx_domain_purchase_requests_status
  on public.domain_purchase_requests (status);
create unique index if not exists uq_domain_purchase_requests_user_idempotency
  on public.domain_purchase_requests (user_id, idempotency_key)
  where idempotency_key is not null;
