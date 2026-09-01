-- The hourly ceiling was not enough.
--
-- service_pricing_hourly_sane caps `usd_per_hour` at 1000, which stops someone
-- typing an absurd hourly rate. It does nothing for the actual bug this system
-- was built to prevent, which arrives in the OTHER unit: a number that is
-- 720x too large, stored as a monthly price.
--
-- Found while seeding kubernetes prices on 2026-08-31. Six live rows in
-- public.products carry price = 43200.00 for kubernetes node plans. 43200 / 720
-- = exactly 60.00, and the two correctly-priced kubernetes plans in the same
-- table are 60.00 and 150.00 per month. So the intent was $60/MONTH and what is
-- stored is $60/HOUR expressed as a month — the same 720x error, the same
-- factor, and the same $60 figure that was found on two objectspace meters
-- during the 2026-08-30 audit.
--
-- That rules out a one-off hand-edit. It is a repeating data-entry defect, so
-- the schema has to refuse it rather than rely on nobody making it again.
--
-- $10,000/month is deliberately generous — the largest legitimate plan in the
-- catalogue today is a database at $2,999.99/month, so this leaves better than
-- 3x headroom while still refusing 43200. It is a backstop, not a policy: the
-- admin panel's median check is the tighter, friendlier guard.
--
-- RECOVERED 2026-09-01 from supabase_migrations.schema_migrations (version
-- 20260831073236). Applied to production 2026-08-31; the file was never
-- written.

alter table billing.service_pricing
  add constraint service_pricing_monthly_sane
  check (unit <> 'usd_per_month' or amount <= 10000);

-- Same reasoning for per-GB rates. $10/GB/month is ~100x RunPod's $0.10 and
-- ~200x the $0.05 custom-image rate, so anything above it is a typo, not a plan.
alter table billing.service_pricing
  add constraint service_pricing_per_gb_sane
  check (unit not in ('usd_per_gb_month','usd_per_gb_hour') or amount <= 10);
