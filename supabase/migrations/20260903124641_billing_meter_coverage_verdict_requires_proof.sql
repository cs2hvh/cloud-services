-- The coverage verdict accused a customer who owed nothing.
--
-- 20260903140000 shipped a two-way verdict: a gap was a 'refusal' if any OTHER
-- meter was billed during the same hours (so the biller was clearly running),
-- and a 'stall' otherwise. That discriminator resolved a real incident — two
-- volumes silent for 28 hours while a third billed normally, which turned out
-- to be one customer out of balance — and it looked sound.
--
-- Its first run on live data disproved it.
--
--   compute 04b3bf00   missing 11   verdict 'refusal'
--
-- That meter belongs to an account holding a balance of $656,041,754. It was
-- never refused anything. The eleven hours went unbilled because the deployed
-- sweep could not resolve a price for compute at the time — the biller was
-- running, other meters were billing, and this one failed for a reason that had
-- nothing to do with money.
--
-- So the two-way split was a false dichotomy. There is a third cause: the
-- biller ran, skipped this meter, and the customer was solvent throughout. The
-- old logic swept that into 'refusal', which on a monitoring board means "chase
-- this customer for payment" — sending an operator after someone who owes
-- nothing, with the confidence of a computed verdict behind it.
--
-- That is the exact failure this board was built to avoid, reproduced inside
-- the board. It is worth recording rather than quietly amending, because the
-- inference felt well-evidenced right up until it was checked against a case it
-- had not been derived from.
--
-- THE FIX: only 'arrears' may accuse, and only with a receipt.
--
--   ok           nothing missing
--   arrears      PROVEN short — billing.transactions holds a failed usage row
--                for one of the missing hours (written by charge_service_hour
--                as of 20260903160000)
--   stall        nothing at all was billed in those hours; the biller was down
--   unexplained  the biller ran, this meter did not bill, and no arrears row
--                says the customer was short. A human decides.
--
-- Historical gaps predate arrears rows, so they resolve to 'unexplained' rather
-- than 'refusal'. That is a loss of apparent precision and a gain in honesty:
-- we inferred those, we did not record them. Refusals from here forward leave
-- a receipt and earn the stronger label.

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
    coalesce(
      count(*) filter (where not m.was_billed) =
        (extract(epoch from (max(m.h) filter (where not m.was_billed)
                           - min(m.h) filter (where not m.was_billed))) / 3600)::integer + 1,
      true
    )                                                        as contiguous,
    case
      when count(*) filter (where not m.was_billed) = 0 then 'ok'

      -- Only branch permitted to say a customer owes money, and only on the
      -- strength of a row that says so.
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

      when not exists (
        select 1
          from billing.service_charges c
         where c.period_start in (
                 select h2.h from marked h2
                  where h2.service_id = m.service_id and not h2.was_billed
               )
      ) then 'stall'

      else 'unexplained'
    end                                                      as verdict
  from marked m
  group by m.service_type, m.service_id, m.user_id
  order by missing desc, m.service_type;
$function$;

comment on function billing.meter_coverage(interval) is
  'Hours elapsed vs hours actually billed per open meter. Verdicts: ok; arrears '
  '(PROVEN short — a failed usage row exists); stall (nothing at all billed in '
  'those hours); unexplained (the biller ran, skipped this meter, and left no '
  'arrears row — needs a human). Never infers that a customer owed money '
  'without a record saying so.';

revoke all on function billing.meter_coverage(interval) from public, anon, authenticated;
grant execute on function billing.meter_coverage(interval) to service_role;
