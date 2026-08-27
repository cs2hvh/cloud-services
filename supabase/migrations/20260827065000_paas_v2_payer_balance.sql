-- Can this project's payer afford to run it?
--
-- Asked before a build is queued, so an app that cannot be paid for is refused
-- at the cheapest possible moment rather than after a build VM has been leased
-- and an image pushed.
--
-- THREE STATES, AND THEY MUST NOT COLLAPSE INTO TWO.
--
--   no-payer    the project's team has no owner and no creator. Nobody can be
--               billed for it at all.
--   no-record   the payer exists but has no billing.user_credits row. On this
--               database that is 24 of 37 users — every account that predates
--               credit billing. It is NOT a zero balance: it means nobody has
--               ever set this person up, and refusing them would break every
--               existing customer to close a leak they are not causing.
--   ok / short  a real balance, compared against a real number.
--
-- Collapsing `no-record` into `short` is the "empty is not unknown" mistake in
-- the one place where it locks a paying customer out of their own platform.
-- Collapsing it into `ok` is free compute forever. It is reported as itself so
-- the caller — and a human reading the sweep — can decide.

create or replace function paas.payer_balance(p_project_id uuid)
returns table (state text, user_id uuid, balance numeric)
language plpgsql
security definer
set search_path = paas, billing, public, extensions, pg_temp
as $$
declare
  v_user uuid;
  v_bal  numeric;
begin
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
    return query select 'no-payer'::text, null::uuid, null::numeric;
    return;
  end if;

  select c.credit_balance into v_bal
    from billing.user_credits c where c.user_id = v_user;

  if not found then
    -- Deliberately not 0. A missing row and a spent balance are different
    -- facts and the caller is trusted to know which it is looking at.
    return query select 'no-record'::text, v_user, null::numeric;
    return;
  end if;

  return query select 'ok'::text, v_user, v_bal;
end;
$$;

revoke all on function paas.payer_balance(uuid) from public;
grant execute on function paas.payer_balance(uuid) to authenticated, service_role;

comment on function paas.payer_balance is
  'The paying user for a project and their credit balance, as one of no-payer | no-record | ok. `no-record` is NOT a zero balance — it is an account that predates credit billing, and treating the two alike either locks out existing customers or gives away free compute.';
