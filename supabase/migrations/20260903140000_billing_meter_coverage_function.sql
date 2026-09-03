-- Billed coverage per open meter: hours elapsed vs hours actually charged.
--
-- WHY THIS EXISTS
--
-- "When did the sweep last run?" is the obvious health question and it is the
-- wrong one. On 2026-09-03 the answer was "minutes ago" and looked green while
-- twelve hours of a running VM had never been billed — the sweep had stalled
-- overnight, resumed at 03:00, and every hour since was perfect. Recency cannot
-- see a hole behind it. Coverage can.
--
-- The admin monitor board polls this. It previously computed the same thing by
-- fetching charge rows and counting them client-side, which had two faults this
-- function removes by construction:
--
--   1. PostgREST caps responses at 1000 rows on this project regardless of the
--      requested limit (verified: asked 3000, got 1000). Six open meters over a
--      full 7-day window is 1008 rows, so the board was days away from silently
--      truncating and reporting a growing false gap.
--   2. The numerator and denominator were computed over different windows, and
--      a Math.min() clamp hid the asymmetry — so one missing hour per meter
--      could be papered over by the current hour's charge, permanently.
--
-- Counting in SQL has neither problem: no row transfer, one window.
--
-- THE VERDICT COLUMN
--
-- A gap means one of two opposite things, needing opposite responses:
--
--   'refusal'  the customer had no balance. The biller behaved correctly and
--              somebody should chase the invoice.
--   'stall'    the biller did not run. Page someone.
--
-- They are told apart by asking whether ANY OTHER meter was billed during the
-- same missing hours. A stall cannot bill one meter and skip another in the
-- same hour; a balance problem is per-customer by definition. This is the check
-- that resolved the 2026-08-31 blackout: two volumes silent for 28 contiguous
-- hours looked exactly like a stall until a third volume turned out to have
-- billed normally throughout, and both silent ones belonged to one customer who
-- had run dry and later topped up.
--
-- Doing it hour-by-hour rather than per-meter matters: a real stall overlapping
-- a balance gap reads as 'refusal' under a meter-granular proxy as long as one
-- meter stays clean, and a single-meter platform can never say 'stall' at all.

create or replace function billing.meter_coverage(
  p_window interval default interval '7 days'
)
returns table (
  service_type   text,
  service_id     uuid,
  user_id        uuid,
  expected       integer,
  billed         integer,
  missing        integer,
  first_missing  timestamptz,
  last_missing   timestamptz,
  contiguous     boolean,
  verdict        text
)
language sql
stable
security definer
set search_path to 'billing', 'public', 'extensions'
as $function$
  with open_meters as (
    -- Both conditions, matching scripts/billing/sweep.ts exactly. Nothing
    -- enforces that they agree, so a meter counted as open here must be one the
    -- sweep would also have tried to bill — otherwise coverage measures a
    -- population the biller never looked at.
    select m.service_type, m.service_id, m.user_id, m.started_at
      from billing.service_meters m
     where m.ended_at is null
       and m.status = 'active'
  ),
  windows as (
    select o.*,
           -- First WHOLE hour the meter was open: a meter opened at 14:59 is
           -- not owed a charge for the 14:00 hour.
           greatest(
             date_trunc('hour', o.started_at) + interval '1 hour',
             date_trunc('hour', now() - p_window)
           ) as from_h,
           -- Stop before the hour in progress: it is not yet owed, and counting
           -- it would report a fresh gap every hour on a healthy platform.
           date_trunc('hour', now()) - interval '1 hour' as to_h
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
    -- An unbroken run: as many missing hours as the span between the first and
    -- last of them. Scattered gaps are a different story from one blackout.
    coalesce(
      count(*) filter (where not m.was_billed) =
        (extract(epoch from (max(m.h) filter (where not m.was_billed)
                           - min(m.h) filter (where not m.was_billed))) / 3600)::integer + 1,
      true
    )                                                        as contiguous,
    case
      when count(*) filter (where not m.was_billed) = 0 then 'ok'
      when exists (
        -- Was anyone ELSE billed during this meter's missing hours? If so the
        -- biller was running and this meter alone was refused, which is a
        -- balance problem rather than an outage.
        select 1
          from billing.service_charges c
         where c.service_id <> m.service_id
           and c.period_start in (
                 select h2.h from marked h2
                  where h2.service_id = m.service_id and not h2.was_billed
               )
      ) then 'refusal'
      else 'stall'
    end                                                      as verdict
  from marked m
  group by m.service_type, m.service_id, m.user_id
  order by missing desc, m.service_type;
$function$;

comment on function billing.meter_coverage(interval) is
  'Hours elapsed vs hours actually billed for every open meter, with a per-meter '
  'verdict separating a customer who ran out of balance (refusal) from a biller '
  'that stopped running (stall). Read-only. Recency of the last charge cannot '
  'detect a hole behind it; this can.';

-- Read-only and admin-facing: the monitor endpoint calls it with the service
-- key. No customer-facing path needs it, so nothing else gets it.
revoke all on function billing.meter_coverage(interval) from public, anon, authenticated;
grant execute on function billing.meter_coverage(interval) to service_role;
