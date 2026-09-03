-- revenue_daily distinguishes collected revenue from accrual.
--
-- RECOVERED FROM supabase_migrations.schema_migrations ON 2026-09-03. Applied
-- as version 20260903153831 and never committed — the same drift as
-- 20260903130429, on the same afternoon.
--
-- SUPERSEDED. `paas_charge_writes_its_ledger_row` later routed
-- paas.charge_project_hour through billing.move_credit and backfilled 823 rows,
-- so PaaS charges are now real ledger entries and revenue_daily reports them as
-- settled = true under service_type 'platform_apps'. This file is the history,
-- not the current definition. See that migration for the live behaviour.
--
-- WHY IT WAS WRITTEN, AND THE PART I GOT WRONG
--
-- The first revenue_daily returned paas.project_charges under `revenue_usd`
-- with no qualification. Its first live run showed 'deploy' as the largest line
-- by charge count — 80 to 137 rows a day against 12 for compute — so I checked
-- for a collector and concluded there was none: no platform_apps rows in
-- service_meters, service_charges, transactions or billing.active_platform_apps.
--
-- That conclusion was WRONG, and the `settled = false` label below is wrong with
-- it. paas.charge_project_hour was calling billing.deduct_user_credit_atomic
-- inside the same savepoint as the project_charges insert all along, driven by
-- the K8s CronJob at :04 since 2026-08-28. Every one of those rows was a real
-- wallet debit. It reconciles to the cent on ved@samatva.com: +100.00 top-up
-- +5.00 coupon −5.00 objectspace setup −6.833681 service_charges −0.498628
-- project_charges = 92.667691, the live balance.
--
-- I looked for the money in billing.* and found nothing, then concluded nothing
-- had moved — rather than concluding that the money moved somewhere I had not
-- looked. The absence of a ledger row was real; "no ledger row" is not "no
-- charge". PaaS was taking money hourly with no transactions row and no
-- service_charges row, which made it invisible on the customer's billing page:
-- the eighteenth instance of the defect 46dbdac1 fixed in seventeen places
-- earlier the same day.
--
-- The `settled` column is still the right shape and is kept. Only my reading of
-- which side PaaS belonged on was wrong.

drop function if exists billing.revenue_daily(interval);

create function billing.revenue_daily(
  p_window interval default interval '30 days'
)
returns table (
  day                    date,
  service_type           text,
  settled                boolean,
  revenue_usd            numeric,
  gross_usd              numeric,
  discount_usd           numeric,
  upstream_cost_usd      numeric,
  charge_count           integer,
  upstream_covered_count integer
)
language sql
stable
security definer
set search_path to 'billing', 'public', 'paas', 'extensions'
as $function$
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

  select
    (date_trunc('day', pc.period_start))::date          as day,
    'deploy'::text                                      as service_type,
    false                                               as settled,
    sum(pc.amount_usd)                                  as revenue_usd,
    null::numeric                                       as gross_usd,
    null::numeric                                       as discount_usd,
    null::numeric                                       as upstream_cost_usd,
    count(*)::integer                                   as charge_count,
    0                                                   as upstream_covered_count
  from paas.project_charges pc
  where pc.period_start >= date_trunc('day', now() - p_window)
  group by 1, 2

  order by 1 desc, 2;
$function$;

comment on function billing.revenue_daily(interval) is
$c$Daily revenue by service, for the admin analytics tab. Read-only.
Grouped on period_start (the hour billed), not created_at.

SETTLED — READ THIS BEFORE SUMMING revenue_usd.

settled = true   billing.service_charges. charge_service_hour deducted the
                 wallet in the same transaction that wrote the row. Money moved.
settled = false  paas.project_charges (service_type deploy). An ACCRUAL table
                 with no collector: as of 2026-09-03 there were zero
                 platform_apps rows in service_meters, service_charges,
                 transactions or billing.active_platform_apps. 105 projects and
                 127 deployments have accrued $7.87 and paid nothing.

Summing revenue_usd across both claims revenue that was never collected, and
deploy is currently the LARGEST line by charge count — 80 to 137 rows a day
against 12 for compute. On a stakeholder-facing board that is not a rounding
error, it is the headline being wrong. Sum settled rows for revenue; report
unsettled separately and call it accrued.

NULL vs ZERO. deploy rows carry NULL gross, discount and upstream cost because
that table records none. Zero would assert no discount was given and 100%
margin. Exclude NULLs from denominators; do not coalesce.

MARGIN. Divide upstream_cost_usd by upstream_covered_count, never by
charge_count. upstream_cost is only written for markup-priced rows — on
2026-09-03 that was 12 of 306 rows, all compute, and gpu_pod had no charge rows
at all. Caption coverage as a computed row percentage, never a service name.

NOT INCLUDED: billing.transactions. Top-ups are money received, not revenue
earned; summing them here double-counts the same dollar as a top-up and again as
the usage it pays for. Arrears belong in their own all-time figure.$c$;

revoke all on function billing.revenue_daily(interval) from public, anon, authenticated;
grant execute on function billing.revenue_daily(interval) to service_role;
