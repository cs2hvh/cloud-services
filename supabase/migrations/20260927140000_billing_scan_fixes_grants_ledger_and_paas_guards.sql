-- Fixes from the 2026-09-27 billing and payments security scan
-- (CLAUDE-SECURITY-20260927-093040, verified).
--
-- 1. billing.account_ledger runs with the caller's rights again.
--    20260901120000 created it WITH (security_invoker = true). The recreate in
--    20260927090000 (widening amounts to six decimals) dropped that option but
--    kept `grant select ... to authenticated`. `billing` is in
--    pgrst.db_schemas, so every signed-in customer could read every
--    customer's ledger through PostgREST: amounts, balances, descriptions,
--    Stripe session ids, receipt URLs. The app reads the view only through the
--    service client (lib/supabase/queries/billing.ts get_transactions), which
--    bypasses RLS either way, so nothing legitimate changes.
--
-- 2. Customers can no longer write the rows the hourly sweep bills from
--    (scan F1-F4, F10, F15, F18 for GPU; F5, F13 for game servers).
--    public.gpu_pods and public.gpu_network_volumes granted INSERT, UPDATE,
--    DELETE (and TRUNCATE, TRIGGER, REFERENCES) to both anon and authenticated,
--    with owner-only RLS. Inside their own row a customer could set
--    gpu_hourly_usd, status, disk and volume sizes, billing_service_id and
--    runpod_pod_id, which the sweep charges from and which RunPod calls made
--    with the platform key are addressed by. public.game_servers did the same
--    for ptero_server_id, ends_at, monthly_price and grace_until.
--    This is the flaw 20260905180529 fixed for public.servers.
--
--    SAFE BECAUSE EVERY LEGITIMATE WRITE USES THE SERVICE ROLE. Checked call
--    sites on 2026-09-27:
--      gpu_pods             lib/services/runpod/operations/pod-lifecycle-operations.ts,
--                           pod-read-operations.ts         createServiceClient
--      gpu_network_volumes  lib/services/runpod/operations/volume-operations.ts
--                                                          createServiceClient
--      game_servers         lib/services/game/{admin,lifecycle,provisioning,renewals}.ts,
--                           app/api/services/game/servers/[id]/route.ts (PATCH,
--                           DELETE), app/api/admin/game/servers/[id]/route.ts
--                                                          createServiceClient
--    The only session-client writers are GameServers.create/update/delete in
--    lib/supabase/queries/gameservers.ts and lib/supabase/queries.ts, and
--    nothing calls them (only their get_* readers are used).
--    SELECT stays, so dashboards keep reading through RLS.
--
--    NOT ADDRESSED HERE: existing rows. If a customer already rewrote a rate,
--    this does not restore it; compare gpu_pods.gpu_hourly_usd against the
--    quote at create time to check.
--
-- 3. A team admin can no longer delete the owner's membership (scan F17).
--    Removing the owner left teams.created_by as the payer fallback, so the
--    removed owner kept paying for a team they could no longer see. The
--    existing owner trigger already guards INSERT and UPDATE; this adds
--    DELETE. Service and sweep contexts (no JWT) are unaffected, and an owner
--    may still remove themselves.
--
-- 4. paas.projects.root_directory has a shape (scan F12, defence in depth).
--    The build VM's cloud-init places it in a root shell script. The code now
--    refuses anything outside this shape before rendering (lib/paas/build/vm.ts);
--    the constraint keeps a bad value from being stored by any path. All 8
--    existing values pass.

begin;

-- 1 ---------------------------------------------------------------------------
alter view billing.account_ledger set (security_invoker = true);

-- 2 ---------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on public.gpu_pods from authenticated;
revoke all on public.gpu_pods from anon;

revoke insert, update, delete, truncate, references, trigger on public.gpu_network_volumes from authenticated;
revoke all on public.gpu_network_volumes from anon;

revoke insert, update, delete on public.game_servers from authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function paas.owner_rows_cannot_be_removed_by_others()
returns trigger
language plpgsql
as $$
begin
  -- Service and sweep contexts carry no JWT and must stay able to write.
  if auth.uid() is null then
    return old;
  end if;

  if old.role = 'owner' and old.user_id <> auth.uid() then
    raise exception
      'only the owner can remove the owner; transferring ownership must go through an RPC the recipient accepts';
  end if;

  return old;
end;
$$;

drop trigger if exists owner_rows_cannot_be_removed_by_others on paas.team_members;
create trigger owner_rows_cannot_be_removed_by_others
  before delete on paas.team_members
  for each row execute function paas.owner_rows_cannot_be_removed_by_others();

-- 4 ---------------------------------------------------------------------------
alter table paas.projects
  drop constraint if exists projects_root_directory_shape;
alter table paas.projects
  add constraint projects_root_directory_shape check (
    root_directory is null
    or (
      root_directory ~ '^[A-Za-z0-9._/-]{1,255}$'
      and root_directory !~ '^/'
      and root_directory !~ '(^|/)\.\.(/|$)'
    )
  );

commit;
