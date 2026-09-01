-- Mechanically convert the archived v1 catalogue into candidate price rows.
--
-- Returns candidates; writes NOTHING. The admin panel renders these for review
-- and then puts each approved row through billing.set_price(), so the audit
-- trail starts at row one and no price enters the book unreviewed.
--
-- WHY A FUNCTION RATHER THAN EXPOSING THE ARCHIVE SCHEMA
--
-- The admin-panel lane offered both and preferred this, correctly. The risky
-- part of seeding is not reading the old rows, it is CONVERTING them — and the
-- conversion is precisely where the 720x defect lives. Exposing
-- pricing_archive_20260831 over PostgREST would put that conversion in
-- TypeScript, in a second place, where it can drift from the rules the database
-- enforces. Here it is written once, next to the constraints it has to satisfy.
--
-- THE ONE RULE THIS FOLLOWS
--
-- Every amount is emitted IN THE UNIT IT WAS ALREADY QUOTED IN. Monthly stays
-- usd_per_month, hourly stays usd_per_hour, a markup stays a multiplier. There
-- is not a single division or multiplication in this function. That is
-- deliberate and it is the whole point: the audit found a MONTHLY figure
-- written into a column meaning dollars-per-hour, wrong by exactly 720, and
-- every hand conversion is another chance to do it again.
--
-- Candidates are emitted only for plans that exist in public.service_plans,
-- because set_price refuses anything else — better to omit a row here than to
-- hand the panel a candidate that cannot be written.
--
-- RECOVERED 2026-09-01 from supabase_migrations.schema_migrations (version
-- 20260831084114). Applied to production 2026-08-31; the file was never
-- written.
--
-- NOTE ON REPRODUCIBILITY: this function reads pricing_archive_20260831 and
-- names it in its search_path. It is a one-time seeding aid tied to that dated
-- archive, not a permanent fixture — on a database rebuilt without the archive
-- it will create successfully but fail when called. Drop it once the price
-- book is seeded and reviewed.

create or replace function billing.price_seed_candidates()
returns table (
  service_type   text,
  plan_key       text,
  plan_name      text,
  rate_model     text,
  amount         numeric,
  unit           text,
  source         text,
  review_flag    text
)
language sql
stable
security definer
set search_path = billing, public, extensions, pricing_archive_20260831
as $$
with candidates as (
  -- compute: hourly_usd is the column the live meters matched, so it is the
  -- billed one. NOTE monthly_usd disagrees with it in the archive (a-1 is
  -- $0.01/hr = $7.20/mo while advertising $7.00) — seeding from the billed
  -- column preserves behaviour; reconciling the two is a product decision.
  select 'compute'::text, p.slug::text, 'fixed_hourly'::text,
         p.hourly_usd::numeric, 'usd_per_hour'::text,
         'archive.instance_plans.hourly_usd'::text
    from pricing_archive_20260831.instance_plans p
   where p.is_active and p.hourly_usd > 0

  union all
  select 'database', p.id::text, 'fixed_hourly', p.price, 'usd_per_month',
         'archive.products.price (database)'
    from pricing_archive_20260831.products p
   where p.type = 'database' and p.price > 0

  union all
  select 'kubernetes', p.id::text, 'fixed_hourly', p.price, 'usd_per_month',
         'archive.products.price (kubernetes)'
    from pricing_archive_20260831.products p
   where p.type = 'kubernetes' and p.price > 0

  union all
  select 'platform_apps', p.sub::text, 'fixed_hourly', p.price, 'usd_per_month',
         'archive.products.price (platform-apps)'
    from pricing_archive_20260831.products p
   where p.type = 'platform-apps' and p.sub is not null and p.price > 0

  union all
  select 'objectspace', '*', 'fixed_hourly', p.price, 'usd_per_month',
         'archive.products.price (object-storage)'
    from pricing_archive_20260831.products p
   where p.type = 'object-storage' and p.price > 0

  union all
  select 'spectrum', '*', 'fixed_hourly', p.price, 'usd_per_month',
         'archive.products.price (network-ddos)'
    from pricing_archive_20260831.products p
   where p.type = 'network-ddos' and p.price > 0

  -- GPU compute: a markup over the live upstream price, NOT an absolute rate.
  -- 1.000 is the at-cost product decision of 2026-08-26 and is preserved
  -- exactly; changing it here would quietly reverse a deliberate call.
  union all
  select 'gpu_pod', '*', 'markup', max(g.markup_pct), 'multiplier',
         'archive.gpu_pricing.markup_pct (at-cost decision 2026-08-26)'
    from pricing_archive_20260831.gpu_pricing g
   having max(g.markup_pct) is not null

  -- These three never had a products row; they lived as constants in
  -- config/pricing.ts and lib/services/runpod/helpers.ts. Carried across at the
  -- same values so the seed reproduces current intent rather than inventing it.
  union all select 'inference_vector', '*', 'fixed_hourly', 8.00,   'usd_per_month',    'config/pricing.ts fallback'
  union all select 'custom_image',     '*', 'per_gb_hour',  0.0500, 'usd_per_gb_month', 'config/pricing.ts fallback'
  union all select 'gpu_pod_storage',  '*', 'per_gb_hour',  0.1000, 'usd_per_gb_month', 'RunPod local disk, at cost'
  union all select 'gpu_volume',       '*', 'per_gb_hour',  0.0875, 'usd_per_gb_month', 'network volume, 1.25x of $0.07/GB/mo cost'
)
select c.service_type, c.plan_key, sp.display_name, c.rate_model, c.amount, c.unit, c.source,
       case
         -- Within 2x of a bound the database would refuse. Not wrong, but the
         -- shape a mistyped price takes, so a human should look.
         when c.unit = 'usd_per_month'    and c.amount >  5000 then 'REVIEW: within 2x of the $10,000/mo bound'
         when c.unit = 'usd_per_hour'     and c.amount >   500 then 'REVIEW: within 2x of the $1,000/hr bound'
         when c.unit like 'usd_per_gb%'   and c.amount >     5 then 'REVIEW: within 2x of the $10/GB bound'
         when c.rate_model = 'markup'     and c.amount =     1 then 'NOTE: at cost, zero margin (deliberate 2026-08-26)'
         -- 720 is the specific fingerprint of the bug this system exists to
         -- stop. Any monthly amount that is a clean multiple of it is suspect.
         when c.unit = 'usd_per_month' and c.amount >= 720 and (c.amount::numeric % 720) = 0
              then 'SUSPECT: exact multiple of 720 — check this is not an hourly rate stored as monthly'
         else null
       end
  from candidates c(service_type, plan_key, rate_model, amount, unit, source)
  join public.service_plans sp
    on sp.service_type = c.service_type and sp.plan_key = c.plan_key
 order by c.service_type, c.amount;
$$;

revoke all on function billing.price_seed_candidates() from public, anon, authenticated;
grant execute on function billing.price_seed_candidates() to service_role;

comment on function billing.price_seed_candidates is
  'Candidate price rows converted from pricing_archive_20260831. Writes nothing. Every amount stays in the unit it was already quoted in — there is no arithmetic in this function, deliberately.';
