-- meter_coverage() reported a false stall for ten minutes of every hour.
--
-- An hour becomes owed when it closes at :00. The sweep bills it at :10, plus
-- up to sixty seconds of timer jitter. The coverage window ended at the hour
-- that had just closed, so between :00 and :10 every open meter on a perfectly
-- healthy platform read 'stall'. Seen by the compute lane at 18:06 UTC on
-- 2026-09-03: six meters, all fine, all red. The dead-man runs at :35 and had
-- its own guard, so nothing paged; the board simply lied to anyone looking in
-- that gap, which is the failure mode this function was built to prevent.
--
-- The newest hour this function judges is now the one that closed at least
-- 75 minutes ago: 60 for the hour to be owed, 10 for the sweep, 5 of slack. A
-- genuine stall is therefore seen 15 minutes later than before, and a false
-- one is never seen at all.

create or replace function billing.meter_coverage(p_window interval default '7 days')
returns table(
  service_type text, service_id uuid, user_id uuid,
  expected integer, billed integer, missing integer,
  first_missing timestamptz, last_missing timestamptz,
  contiguous boolean, verdict text
)
language sql
stable
security definer
set search_path = billing, public, extensions
as $$
  with open_meters as (
    select m.service_type, m.service_id, m.user_id, m.started_at
      from billing.service_meters m
     where m.ended_at is null
       and m.status = 'active'
  ),
  windows as (
    select o.*,
           greatest(
             date_trunc('hour', o.started_at) + interval '1 hour',
             date_trunc('hour', now() - p_window)
           ) as from_h,
           date_trunc('hour', now() - interval '75 minutes') as to_h
      from open_meters o
  ),
  expected_hours as (
    select w.service_type, w.service_id, w.user_id, w.from_h, w.to_h,
           generate_series(w.from_h, w.to_h, interval '1 hour') as h
      from windows w
     where w.to_h >= w.from_h
  ),
  marked as (
    select e.*,
           exists (
             select 1 from billing.service_charges c
              where c.service_id = e.service_id
                and c.period_start = e.h
           ) as was_billed
      from expected_hours e
  )
  select
    m.service_type,
    m.service_id,
    m.user_id,
    count(*)::integer                                        as expected,
    count(*) filter (where m.was_billed)::integer            as billed,
    count(*) filter (where not m.was_billed)::integer        as missing,
    min(m.h) filter (where not m.was_billed)                 as first_missing,
    max(m.h) filter (where not m.was_billed)                 as last_missing,
    coalesce(
      count(*) filter (where not m.was_billed) =
        (extract(epoch from (max(m.h) filter (where not m.was_billed)
                           - min(m.h) filter (where not m.was_billed))) / 3600)::integer + 1,
      true
    )                                                        as contiguous,
    case
      when count(*) filter (where not m.was_billed) = 0 then 'ok'

      -- PROVEN. The sweep recorded an arrears row for one of these hours, so
      -- the customer was genuinely short. Only this branch may accuse a
      -- customer of owing money.
      when exists (
        select 1
          from billing.transactions t
         where t.type = 'usage' and t.status = 'failed'
           and t.service_id = m.service_id
           and t.period_start in (
                 select h2.h from marked h2
                  where h2.service_id = m.service_id and not h2.was_billed
               )
      ) then 'arrears'

      -- Nothing anywhere was billed in these hours: the biller was not running.
      when not exists (
        select 1
          from billing.service_charges c
         where c.period_start in (
                 select h2.h from marked h2
                  where h2.service_id = m.service_id and not h2.was_billed
               )
      ) then 'stall'

      -- The biller WAS running and skipped this meter, with no arrears row to
      -- say the customer was short. A third cause, and the one that bit: a
      -- compute meter went unbilled for 11 hours because the deployed sweep
      -- could not resolve its price, while its owner held a large balance.
      else 'unexplained'
    end                                                      as verdict
  from marked m
  group by m.service_type, m.service_id, m.user_id
  order by missing desc, m.service_type;
$$;

comment on function billing.meter_coverage(interval) is
  'Per open meter: hours expected vs billed within p_window, with a verdict (ok, arrears, stall, unexplained). Counts are per meter (summing gives meter-hours). The newest hour judged is the one that closed at least 75 minutes ago, so the :10 sweep has had its turn.';
