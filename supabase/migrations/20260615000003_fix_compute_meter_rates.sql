-- Correct compute metering for servers that predate the plan-billing fix
-- (commit 5cebdf7b) and the P0 metering rollout (migration 20260615000002).
--
-- Two problems this fixes:
--   1. Plan-based VPS were priced with the legacy spec formula
--      (calculateHourlyCost) instead of the plan's ADVERTISED catalog price —
--      roughly 4x too high for small plans (e.g. s-2 advertised $10/mo was
--      stored at ~$43/mo). Re-rate them to instance_plans.hourly_usd.
--   2. Servers created before the metering code shipped have NO active_compute
--      row at all, so they are not being billed. Backfill a meter at the
--      correct rate.
--
-- Rate basis:
--   - Server has a known plan_slug -> the plan's advertised hourly_usd.
--   - Free-form / custom-spec server (no matching plan) -> keep the stored
--     servers.hourly_cost (the legacy spec-formula rate is intentional there).
--
-- last_billed_at is set to now() everywhere so NOTHING is charged
-- retroactively — metering at the corrected rate starts from this migration.
-- Idempotent: re-running only touches rows that are still wrong / missing.

-- (A) Re-rate existing meters for plan-based servers to the advertised price.
UPDATE billing.active_compute AS ac
SET hourly_rate = ip.hourly_usd,
    last_billed_at = now()
FROM public.servers AS s
JOIN public.instance_plans AS ip ON ip.slug = s.plan_slug
WHERE ac.service_id = s.billing_service_id
  AND s.plan_slug IS NOT NULL
  AND ip.hourly_usd >= 0.0001
  AND ip.hourly_usd <= 1000
  AND ac.hourly_rate IS DISTINCT FROM ip.hourly_usd;

-- (B) Correct the stored hourly_cost on plan-based server rows (used by the UI
--     and by final-charge proration on delete).
UPDATE public.servers AS s
SET hourly_cost = ip.hourly_usd
FROM public.instance_plans AS ip
WHERE ip.slug = s.plan_slug
  AND s.plan_slug IS NOT NULL
  AND s.hourly_cost IS DISTINCT FROM ip.hourly_usd;

-- (C) Backfill meters for live servers that have none yet, at the correct rate.
--     Plan-based -> advertised price; free-form -> stored hourly_cost.
INSERT INTO billing.active_compute (user_id, service_id, hourly_rate, status, last_billed_at)
SELECT
    s.owner_id,
    s.billing_service_id,
    COALESCE(ip.hourly_usd, s.hourly_cost),
    'active',
    now()
FROM public.servers AS s
LEFT JOIN public.instance_plans AS ip ON ip.slug = s.plan_slug
WHERE s.status IN ('running', 'stopped', 'suspended')
  AND s.owner_id IS NOT NULL
  AND s.billing_service_id IS NOT NULL
  AND COALESCE(ip.hourly_usd, s.hourly_cost) >= 0.0001
  AND COALESCE(ip.hourly_usd, s.hourly_cost) <= 1000
  AND NOT EXISTS (
    SELECT 1 FROM billing.active_compute AS ac
    WHERE ac.service_id = s.billing_service_id
  );
