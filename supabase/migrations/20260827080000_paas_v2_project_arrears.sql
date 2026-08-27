-- When did this project FIRST fail to pay?
--
-- charge_project_hour already returned 'insufficient' when the balance would
-- not cover the hour, and nothing acted on it — so an app whose owner ran out
-- of credit kept running indefinitely, free. The mirror image of v1's defect,
-- where apps that no longer existed kept being charged.
--
-- FIRST, NOT MOST RECENT, and that is the whole design of this column. Writing
-- the latest failure each hour would slide the grace window forward exactly as
-- fast as time passes, so nothing would ever become overdue no matter how long
-- it went unpaid. Set once when arrears begin; cleared on the first successful
-- charge.

alter table paas.projects
  add column if not exists arrears_since timestamptz;

comment on column paas.projects.arrears_since is
  'When the FIRST charge failed for lack of credit. Set once when arrears begin, cleared on the first successful charge. Never updated to the latest failure — that would slide the grace window forward as fast as time passes and nothing would ever become overdue.';

create index if not exists projects_arrears_idx
  on paas.projects (arrears_since)
  where arrears_since is not null;

-- charge_project_hour gains one behaviour: a successful charge CLEARS arrears.
-- Topping up resets the clock, and an app that has started paying again must
-- not still be counting down to suspension.
create or replace function paas.charge_project_hour(
  p_project_id   uuid,
  p_period_start timestamptz,
  p_amount       numeric,
  p_tier         text,
  p_instances    integer
) returns text
language plpgsql
security definer
set search_path = paas, billing, public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
  v_period  timestamptz := date_trunc('hour', p_period_start);
begin
  if p_amount is null or p_amount <= 0 then
    return 'invalid-amount';
  end if;

  select coalesce(
           (select m.user_id from paas.team_members m
             join paas.projects p on p.team_id = m.team_id
            where p.id = p_project_id and m.role = 'owner'
            order by m.created_at limit 1),
           (select t.created_by from paas.teams t
             join paas.projects p on p.team_id = t.id
            where p.id = p_project_id)
         )
    into v_user_id;

  if v_user_id is null then
    return 'no-payer';
  end if;

  insert into paas.project_charges (project_id, period_start, user_id, amount_usd, tier, instances)
  values (p_project_id, v_period, v_user_id, p_amount, p_tier, p_instances)
  on conflict (project_id, period_start) do nothing;

  if not found then
    return 'already-charged';
  end if;

  begin
    perform billing.deduct_user_credit_atomic(v_user_id, p_amount);
  exception
    when others then
      -- The claim rolls back with this block, so no ledger row survives for
      -- money that was never taken. The arrears mark is written by the CALLER
      -- afterwards, in its own statement, precisely so it is not rolled back
      -- with the claim — otherwise the grace window could never start.
      return 'insufficient';
  end;

  update paas.projects
     set arrears_since = null
   where id = p_project_id and arrears_since is not null;

  return 'charged';
end;
$$;

-- Set the start of the grace window, ONCE.
--
-- Separate from the charge because the charge's exception handler rolls its own
-- block back and a write inside it would vanish. `is null` in the WHERE is what
-- makes it once-only: a second failure an hour later finds a value already
-- there and changes nothing, so the window cannot be restarted by the sweep
-- that observes it.
create or replace function paas.mark_arrears(p_project_id uuid, p_at timestamptz default now())
returns timestamptz
language plpgsql
security definer
set search_path = paas, public, pg_temp
as $$
declare
  v timestamptz;
begin
  update paas.projects
     set arrears_since = p_at
   where id = p_project_id and arrears_since is null;

  select arrears_since into v from paas.projects where id = p_project_id;
  return v;
end;
$$;

revoke all on function paas.mark_arrears(uuid, timestamptz) from public;
revoke all on function paas.mark_arrears(uuid, timestamptz) from authenticated;
grant execute on function paas.mark_arrears(uuid, timestamptz) to service_role;

comment on function paas.mark_arrears is
  'Record when a project FIRST failed to pay, once. Returns the existing value if arrears already began, so a repeat call cannot restart the grace window. service_role only.';
