-- Two paas faults from the 2026-09-05 authentication scan.
--
-- PAYER HIJACK
--
-- paas.payer_balance, and charge_project_hour through it, choose who pays for a
-- project like this:
--
--     select m.user_id from paas.team_members m
--       join paas.projects p on p.team_id = m.team_id
--      where p.id = p_project_id and m.role = 'owner'
--      order by m.created_at limit 1
--
-- The earliest 'owner' row wins. paas.team_members_manage is an ALL policy
-- granted to any team admin, and authenticated held TABLE-level INSERT and
-- UPDATE covering every column, so a team admin could insert a row naming ANY
-- user_id as 'owner' with ANY created_at.
--
-- Backdating one row therefore moved the entire team's bill onto someone else's
-- credit balance, and nothing about the team's membership list would look
-- obviously wrong afterwards. It is a billing attack rather than an access one,
-- which is why it survives a reading that only asks "who can see what".
--
-- created_at is now unwritable by authenticated: the table-level INSERT/UPDATE
-- grants are dropped and re-issued per column, omitting it, so the column
-- DEFAULT always applies and a forged row can never sort before the genuine
-- owner. Adding a member (team_id, user_id, role), changing a role, and
-- removing a member all still work.
--
-- Note on mechanics, because the first attempt at this silently did nothing: a
-- column-level REVOKE has no effect while a table-level grant is present. The
-- table grant covers every column, so it has to be revoked and replaced with
-- explicit column grants. Verified in a rolled-back transaction before applying.
--
-- PAYER BALANCE WAS READABLE BY ANYONE
--
-- paas.payer_balance is SECURITY DEFINER and granted to authenticated, and it
-- checked no membership at all, so any signed-in user could pass any project id
-- and learn who funds that project and what their credit balance is.
--
-- It now requires team access, but only when a real end user is calling.
-- auth.uid() is null in the sweep and other service contexts, which must still
-- be able to resolve a payer in order to charge; gating those would have broken
-- billing rather than secured it. Confirmed still resolving 'ok' from a service
-- context in the same rolled-back transaction.
--
-- WHAT THIS DOES NOT FIX, deliberately, because both need design rather than a
-- policy tweak:
--
--   paas.aliases_write authorizes any project member to claim an arbitrary
--   hostname. The reserved-name control lives only in application code
--   (lib/paas/hostnames.ts, RESERVED_LABELS), so a direct PostgREST insert
--   bypasses it and the reconciler then acts on the row. Fixing it in the
--   database means either duplicating a 50-plus entry reserved list into SQL,
--   where it will drift, or routing alias writes through a SECURITY DEFINER RPC.
--
--   paas.installations_connect checks only that the caller is an admin of the
--   named team, never that they own the installation being connected, so an
--   unclaimed installation can be claimed by anyone. Ownership of a GitHub App
--   installation is a fact about the provider, not about this database, so it
--   cannot be settled by a policy.
--
-- Neither is fixed here and neither should be assumed fixed. Both are recorded
-- for whoever picks up the PaaS lane.
--
-- Context that shapes all of the above: app/api/v2/_lib/auth.ts deliberately
-- uses the ANON-key cookie client and forbids createServiceClient anywhere in
-- app/api/v2, with a boundary test enforcing it. That is a good design, and it
-- means RLS IS the PaaS's authorization rather than a backstop behind it. So
-- revoking write grants wholesale would have taken the PaaS offline for all 9
-- teams and 106 projects; the fix had to be surgical for that reason.

begin;

revoke insert, update on paas.team_members from authenticated;
grant  insert (team_id, user_id, role) on paas.team_members to authenticated;
grant  update (role)                   on paas.team_members to authenticated;

create or replace function paas.payer_balance(p_project_id uuid)
 returns table(state text, user_id uuid, balance numeric)
 language plpgsql
 security definer
 set search_path to 'paas','billing','public','extensions','pg_temp'
as $function$
declare
  v_user uuid;
  v_bal  numeric;
  v_team uuid;
begin
  select p.team_id into v_team from paas.projects p where p.id = p_project_id;

  -- auth.uid() is null for the sweep and other service callers, which must
  -- still resolve a payer. A real end user has to be on the team.
  if auth.uid() is not null
     and (v_team is null or not paas.has_team_access(v_team, 'viewer'::paas.team_role))
  then
    raise exception 'not authorized for this project';
  end if;

  select coalesce(
           (select m.user_id from paas.team_members m
             join paas.projects p on p.team_id = m.team_id
            where p.id = p_project_id and m.role = 'owner'
            order by m.created_at limit 1),
           (select t.created_by from paas.teams t
             join paas.projects p on p.team_id = t.id
            where p.id = p_project_id)
         ) into v_user;

  if v_user is null then
    return query select 'no-payer'::text, null::uuid, null::numeric; return;
  end if;

  select c.credit_balance into v_bal
    from billing.user_credits c where c.user_id = v_user;

  if not found then
    return query select 'no-record'::text, v_user, null::numeric; return;
  end if;

  return query select 'ok'::text, v_user, v_bal;
end;
$function$;

commit;
