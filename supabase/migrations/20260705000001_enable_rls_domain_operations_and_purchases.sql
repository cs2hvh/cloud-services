-- AUDIT.md C2 remediation for the domain service tables.
-- domain_operations and domain_purchase_requests were created without RLS,
-- leaving customer order data readable/writable through PostgREST with the
-- anon key. All server-side access goes through createServiceClient()
-- (service_role), so locking these down does not affect application code.
-- Mirrors the policy layout of domain_transfer_requests (20260328000002).

-- ── domain_operations ──────────────────────────────────────────────────────
alter table public.domain_operations enable row level security;

drop policy if exists "Users can view own domain operations" on public.domain_operations;
create policy "Users can view own domain operations"
  on public.domain_operations
  for select
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage domain operations" on public.domain_operations;
create policy "Service role can manage domain operations"
  on public.domain_operations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on public.domain_operations from anon;
revoke all on public.domain_operations from authenticated;
grant select on public.domain_operations to authenticated;
grant all on public.domain_operations to service_role;

-- ── domain_purchase_requests ───────────────────────────────────────────────
alter table public.domain_purchase_requests enable row level security;

drop policy if exists "Users can view own domain purchase requests" on public.domain_purchase_requests;
create policy "Users can view own domain purchase requests"
  on public.domain_purchase_requests
  for select
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage domain purchase requests" on public.domain_purchase_requests;
create policy "Service role can manage domain purchase requests"
  on public.domain_purchase_requests
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on public.domain_purchase_requests from anon;
revoke all on public.domain_purchase_requests from authenticated;
grant select on public.domain_purchase_requests to authenticated;
grant all on public.domain_purchase_requests to service_role;
