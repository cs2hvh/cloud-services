-- Daily revenue rollup for the admin analytics tab.
--
-- WHY A FUNCTION RATHER THAN A CLIENT-SIDE SCAN
--
-- The panel was paging .range() over billing.service_charges and
-- paas.project_charges and aggregating in TypeScript. That works at ~1.1k rows
-- across 30 days and stops working without warning: this project caps every
-- PostgREST response at 1000 rows regardless of the limit requested (verified:
-- asked 3000, got 1000). The same trap already nearly shipped on the coverage
-- node, where six aged meters would have crossed 1008 rows and produced a
-- growing false gap. Requested early, before truncation bit, rather than after.
--
-- WHY 'deploy' ROWS CARRY NULLs AND NOT ZEROS
--
-- paas.project_charges has no gross_usd, no discount_usd, no upstream_cost:
--
--   id, project_id, period_start, user_id, amount_usd, tier, instances, created_at
--
-- Returning 0 for those would assert two things that are false — that no
-- discount was given, and that the margin is 100%. It already caused a real
-- defect: deploy dollars were being added to the gross denominator, diluting
-- the platform discount rate by claiming a discount-free service. NULL means
-- "this service does not record it", which is the truth and which forces a
-- caller to exclude those rows from a denominator rather than quietly absorbing
-- them.
--
-- WHY upstream_covered_count EXISTS
--
-- upstream_cost is only written when the price row is a markup. On 2026-09-03
-- that was 12 of 306 charge rows — 3.9%, all compute, and only since the
-- compute passthrough landed the previous afternoon. gpu_volume and objectspace
-- record none, and gpu_pod has no charge rows at all.
--
-- Without a covered count, a caller cannot tell a genuine zero margin from an
-- unmeasured one. That is the same defect as a count with no denominator, and
-- the analytics tab had captioned its margin "compute today" — a service name
-- reads as "all of compute" and goes stale in the flattering direction, while a
-- computed row percentage cannot.
--
-- WHY billing.transactions IS NOT IN HERE
--
-- Top-ups are money RECEIVED, not revenue EARNED, and coupons are credit
-- granted. Summing them into a per-day revenue series double-counts: the same
-- dollar appears once as a top-up and again as the usage it later pays for.
-- Arrears (failed usage rows) belong in their own all-time figure, not here.

create or replace function billing.revenue_daily(
  p_window interval default interval '30 days'
)
returns table (
  day                    date,
  service_type           text,
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
  -- Metered hourly charges. Grouped on period_start — the hour BILLED — not
  -- created_at, which is when the row happened to be written and which a
  -- backfill would scatter.
  select
    (date_trunc('day', sc.period_start))::date          as day,
    sc.service_type,
    sum(sc.amount_usd)                                  as revenue_usd,
    sum(coalesce(sc.gross_usd, sc.amount_usd))          as gross_usd,
    sum(sc.discount_usd)                                as discount_usd,
    -- sum() skips NULLs, so this is the cost of the covered rows only. Divide
    -- by upstream_covered_count, never by charge_count.
    sum(sc.upstream_cost)                               as upstream_cost_usd,
    count(*)::integer                                   as charge_count,
    count(sc.upstream_cost)::integer                    as upstream_covered_count
  from billing.service_charges sc
  where sc.period_start >= date_trunc('day', now() - p_window)
  group by 1, 2

  union all

  -- Platform-apps project charges, surfaced as service_type 'deploy'.
  --
  -- gross/discount/upstream are NULL because this table does not record them.
  -- upstream_covered_count is 0 rather than NULL: zero rows were covered is a
  -- true count, not an unknown.
  select
    (date_trunc('day', pc.period_start))::date          as day,
    'deploy'::text                                      as service_type,
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

NULL vs ZERO. Rows with service_type 'deploy' come from paas.project_charges,
which records no gross, discount or upstream cost — those columns are NULL,
meaning "not recorded", NOT zero. Zero would assert that no discount was given
and that margin is 100%. Exclude NULL rows from any denominator; do not
coalesce them.

MARGIN. Divide upstream_cost_usd by upstream_covered_count, never by
charge_count. upstream_cost is only written for markup-priced rows — on
2026-09-03 that was 12 of 306 rows, all compute, and gpu_pod had no charge rows
at all. A caller that assumes full coverage reports a margin it has not
measured. Caption coverage as a computed row percentage, never as a service
name: a name reads as "all of that service" and goes stale in the direction that
flatters the number.

NOT INCLUDED: billing.transactions. Top-ups are money received, not revenue
earned, and coupons are credit granted; summing them here double-counts, since
the same dollar appears once as a top-up and again as the usage it pays for.
Arrears belong in their own all-time figure.$c$;

revoke all on function billing.revenue_daily(interval) from public, anon, authenticated;
grant execute on function billing.revenue_daily(interval) to service_role;

-- ── Superseded 2026-09-03 by billing_revenue_daily_marks_unsettled_accrual ───
--
-- The version above returned paas.project_charges under `revenue_usd` with no
-- qualification. Its first live run showed 'deploy' as the LARGEST line by
-- charge count — 80 to 137 rows a day against 12 for compute — so I checked
-- whether anything collects it:
--
--   billing.service_meters      platform_apps rows: 0
--   billing.service_charges     platform_apps rows: 0
--   billing.transactions        platform_apps rows: 0
--   billing.active_platform_apps            rows: 0
--
-- Nothing does. paas.project_charges is an ACCRUAL table with no collector:
-- 105 projects, 127 deployments, 813 rows, $7.87 accrued, nothing deducted
-- from any wallet. Settled revenue over the same window is $9.18.
--
-- So the function was reporting $17.05 of 'revenue' where $7.87 had never been
-- collected — on a board explicitly built for stakeholders. That is not a
-- rounding error, it is the headline being wrong, and it is the same defect as
-- the NULL-vs-zero one it was written to avoid, one level up: a number that was
-- recorded standing in for money that moved.
--
-- The replacement adds a `settled` boolean. Adding a column changes the return
-- type, so it is DROP then CREATE in one transaction rather than
-- CREATE OR REPLACE — the same signature lesson set_price taught earlier.
