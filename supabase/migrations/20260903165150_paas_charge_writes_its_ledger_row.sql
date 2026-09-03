-- The PaaS took money every hour and never wrote it down.
--
-- paas.charge_project_hour claimed the hour in paas.project_charges and then
-- called billing.deduct_user_credit_atomic in the same savepoint — so every one
-- of its rows IS a wallet debit — but nothing wrote billing.transactions. The
-- customer's billing page could not explain the drain, and revenue_daily
-- reported the total as unsettled "accrual with no collector".
--
-- That reading was wrong, and the wallet arithmetic proves it: ved@samatva.com
-- on 2026-09-03 is +100.000000 (top-up) +5.000000 (coupon) −5.000000 (setup)
-- −6.833681 (service_charges) −0.498628 (paas.project_charges) = 92.667691,
-- which is the live credit_balance to the cent. Leave the PaaS line out and
-- the books do not balance.
--
-- This is the same defect commit 46dbdac1 fixed in seventeen places on
-- 2026-09-03: money moved, and its ledger row was optional. The deduction now
-- goes through billing.move_credit, which writes the row in the same
-- transaction or does not move the money. The claim in project_charges and the
-- payment still share one savepoint, so a failed payment still takes the claim
-- with it.

create or replace function paas.charge_project_hour(
  p_project_id  uuid,
  p_period_start timestamptz,
  p_amount      numeric,
  p_tier        text,
  p_instances   integer
)
returns text
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

  -- ONE SAVEPOINT COVERS THE CLAIM, THE MONEY AND THE LEDGER ROW.
  begin
    insert into paas.project_charges (project_id, period_start, user_id, amount_usd, tier, instances)
    values (p_project_id, v_period, v_user_id, p_amount, p_tier, p_instances)
    on conflict (project_id, period_start) do nothing;

    if not found then
      return 'already-charged';
    end if;

    -- move_credit debits the wallet and writes billing.transactions together.
    -- If the row cannot be written the money does not move, and the exception
    -- rolls the project_charges claim back with it.
    perform billing.move_credit(
      p_user_id      => v_user_id,
      p_amount       => p_amount,
      p_direction    => 'debit',
      p_type         => 'usage',
      p_status       => 'completed',
      p_description  => format('Deploy usage: %s tier, %s instance(s)', p_tier, p_instances),
      p_service_id   => p_project_id,
      p_service_type => 'platform_apps',
      p_period_start => v_period,
      p_period_end   => v_period + interval '1 hour',
      p_metadata     => jsonb_build_object('spine', 'paas', 'tier', p_tier, 'instances', p_instances)
    );
  exception
    when others then
      -- Only a funding problem is a clean negative. move_credit raises
      -- 'Insufficient credit balance' and 'no credit record for user';
      -- deduct_user_credit_atomic used to raise 'User credit record not found'.
      -- All three mean the same thing here.
      if sqlerrm like '%Insufficient credit balance%'
         or sqlerrm like '%User credit record not found%'
         or sqlerrm like '%no credit record for user%' then
        return 'insufficient';
      end if;
      raise;
  end;

  update paas.projects
     set arrears_since = null
   where id = p_project_id and arrears_since is not null;

  return 'charged';
end;
$$;

-- revenue_daily labelled PaaS rows settled = false on the theory that nothing
-- collected them. They were collected every hour. The row shape is unchanged;
-- only the flag and the service_type label move. The comment block in
-- 20260903180000 asserting "nothing deducted from any wallet" is superseded by
-- this file.
create or replace function billing.revenue_daily(p_window interval default '30 days')
returns table(
  day date, service_type text, settled boolean,
  revenue_usd numeric, gross_usd numeric, discount_usd numeric, upstream_cost_usd numeric,
  charge_count integer, upstream_covered_count integer
)
language sql stable security definer
set search_path = billing, public, paas, extensions
as $$
  select
    (date_trunc('day', sc.period_start))::date          as day,
    sc.service_type,
    true                                                as settled,
    sum(sc.amount_usd)                                  as revenue_usd,
    sum(coalesce(sc.gross_usd, sc.amount_usd))          as gross_usd,
    sum(sc.discount_usd)                                as discount_usd,
    sum(sc.upstream_cost)                               as upstream_cost_usd,
    count(*)::integer                                   as charge_count,
    count(sc.upstream_cost)::integer                    as upstream_covered_count
  from billing.service_charges sc
  where sc.period_start >= date_trunc('day', now() - p_window)
  group by 1, 2

  union all

  -- The PaaS spine. Every row in paas.project_charges is a completed wallet
  -- debit (the insert and the deduction share a savepoint), so it is revenue,
  -- not accrual. It carries no gross/discount/upstream breakdown.
  select
    (date_trunc('day', pc.period_start))::date          as day,
    'platform_apps'::text                               as service_type,
    true                                                as settled,
    sum(pc.amount_usd)                                  as revenue_usd,
    sum(pc.amount_usd)                                  as gross_usd,
    0::numeric                                          as discount_usd,
    null::numeric                                       as upstream_cost_usd,
    count(*)::integer                                   as charge_count,
    0                                                   as upstream_covered_count
  from paas.project_charges pc
  where pc.period_start >= date_trunc('day', now() - p_window)
  group by 1, 2

  order by 1 desc, 2;
$$;
