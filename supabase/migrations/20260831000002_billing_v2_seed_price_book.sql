-- Seed the v2 price book from the sources authoritative TODAY.
--
-- The goal is deliberately NOT to improve any price. It is to make the new
-- engine reproduce the current intended numbers exactly, so that when the new
-- sweep runs beside the old one the difference is zero — and any difference
-- that does appear is a bug worth chasing rather than a repricing to argue
-- about. Changing prices is a separate act, through the admin panel, after.
--
-- WHERE EACH NUMBER COMES FROM
--
--   compute        instance_plans.hourly_usd. Chosen over monthly_usd because
--                  the live meters match hourly_usd exactly. NOTE the two
--                  columns DISAGREE — a-1 is $0.01/hr (= $7.20/mo) but
--                  advertises $7.00/mo; s-7 is $154.08/mo by the hour but
--                  advertises $160. Seeding from the billed column preserves
--                  behaviour; the drift is reported rather than silently
--                  resolved, because picking a side here would change what
--                  customers pay as a side effect of a refactor.
--   objectspace    products('object-storage').price = $5/month
--   spectrum       products('network-ddos').price = $300/month
--   platform_apps  products('platform-apps').price per size
--   inference_vector  $8/month (config/pricing.ts fallback; no product row)
--   custom_image   $0.05/GB/month (config/pricing.ts fallback)
--   gpu_pod        gpu_pricing.markup_pct = 1.000 — the at-cost product
--                  decision of 2026-08-26 (migration 20260826000002)
--   gpu_pod_storage  RunPod local disk at its own $0.10/GB/month
--   gpu_volume     $0.0875/GB/month, the 1.25x that gpu_network_volumes
--                  already implies ($113.75 billed against $91.00 cost)
--
-- effective_from is hour-truncated to satisfy service_pricing_from_on_hour.

insert into billing.service_pricing
  (service_type, plan_key, rate_model, amount, unit, effective_from, note)
select 'compute', p.slug, 'fixed_hourly', p.hourly_usd, 'usd_per_hour',
       date_trunc('hour', now()), 'seeded from instance_plans.hourly_usd'
from public.instance_plans p
where p.is_active = true and p.hourly_usd is not null and p.hourly_usd > 0
on conflict do nothing;

insert into billing.service_pricing
  (service_type, plan_key, rate_model, amount, unit, effective_from, note)
values
  ('objectspace',      '*', 'fixed_hourly',   5.00, 'usd_per_month', date_trunc('hour', now()), 'products.object-storage'),
  ('spectrum',         '*', 'fixed_hourly', 300.00, 'usd_per_month', date_trunc('hour', now()), 'products.network-ddos'),
  ('inference_vector', '*', 'fixed_hourly',   8.00, 'usd_per_month', date_trunc('hour', now()), 'config/pricing.ts fallback')
on conflict do nothing;

insert into billing.service_pricing
  (service_type, plan_key, rate_model, amount, unit, effective_from, note)
select 'platform_apps', pr.sub, 'fixed_hourly', pr.price, 'usd_per_month',
       date_trunc('hour', now()), 'products.platform-apps'
from public.products pr
where pr.type = 'platform-apps' and pr.sub is not null and pr.price > 0
on conflict do nothing;

insert into billing.service_pricing
  (service_type, plan_key, rate_model, amount, unit, effective_from, note)
values
  ('custom_image',    '*', 'per_gb_hour', 0.0500, 'usd_per_gb_month', date_trunc('hour', now()), 'config/pricing.ts fallback'),
  ('gpu_pod_storage', '*', 'per_gb_hour', 0.1000, 'usd_per_gb_month', date_trunc('hour', now()), 'RunPod local disk, at cost'),
  ('gpu_volume',      '*', 'per_gb_hour', 0.0875, 'usd_per_gb_month', date_trunc('hour', now()), 'network volume, 1.25x of $0.07/GB/mo cost')
on conflict do nothing;

-- plan_key '*' because markup_pct is currently uniform across every
-- (gpu, cloud_type, interruptible) row. Per-GPU pricing later means inserting
-- rows keyed by gpu_catalog_id; nothing here has to change to allow it.
insert into billing.service_pricing
  (service_type, plan_key, rate_model, amount, unit, effective_from, note)
select 'gpu_pod', '*', 'markup', max(g.markup_pct), 'multiplier',
       date_trunc('hour', now()),
       'gpu_pricing.markup_pct — at-cost product decision 2026-08-26'
from public.gpu_pricing g
having max(g.markup_pct) is not null
on conflict do nothing;
