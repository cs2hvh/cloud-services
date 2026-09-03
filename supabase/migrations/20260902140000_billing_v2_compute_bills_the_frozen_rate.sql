-- Compute charging: resold VMs bill the rate frozen on the server at create.
--
-- THE BUG
--
-- charge_service_hour resolves a price by (service_type, plan_key) and returns
-- 'no-price' — writing nothing — when it misses. Compute has two disjoint key
-- spaces:
--
--   billing.service_pricing  a-1, s-2..s-9, d-2..d-32   self-hosted   13 rows
--   public.linode_types      g6-standard-N, g1-*        resold        75 rows
--
-- A Linode VM opens a meter keyed `g6-standard-4`. No such row exists, so the
-- charge function returned 'no-price' every hour, forever. Quoted at markup,
-- billed nothing. The same held for a NULL plan_slug, which normalises to '*' —
-- also absent for compute.
--
-- lib/billing/meters.ts:64 documents this exact failure in order to prevent it,
-- then strips the `linode:` prefix and stops — `linode:g6-standard-4` becomes
-- `g6-standard-4`, which is still not `s-3`. The guard names two key spaces and
-- only removes a prefix; it never translates between them.
--
-- WHY THE FROZEN RATE AND NOT A LIVE MARKUP
--
-- servers.hourly_cost is already written at create by both create paths
-- (markup x Linode list, at that moment). Billing it back is what makes the
-- quote and the charge the same number by construction rather than by
-- agreement, and it is what the admin panel already tells operators happens:
-- "Prices freeze onto servers at create time." A markup change re-prices new
-- VMs and leaves running ones on the price they were sold at.
--
-- Maintaining a book row per Linode type was the alternative. It drifts by
-- construction — Linode's catalogue moves and ours would not.

-- ── 1. The plan the price hangs off ──────────────────────────────────────────
-- set_price refuses to price a plan that does not exist in service_plans. '*'
-- is the established convention for a service priced as a whole rather than per
-- plan (7 services already use it). is_active = false because this is NOT a
-- plan anyone can select — it is the resolution target for resold keys.

insert into public.service_plans
  (service_type, plan_key, display_name, description,
   allowed_regions, is_active, sort_order)
values
  ('compute', '*', 'Resold compute (frozen rate)',
   'Not selectable. Resolution target for provider-resold compute, which bills the rate frozen onto the server row at create time.',
   '{}', false, 999)
on conflict (service_type, plan_key) do nothing;

-- ── 2. Resolution falls back to '*' ──────────────────────────────────────────
-- Exact match still wins, so self-hosted s-3 is untouched and keeps its
-- fixed_hourly row. Only a key with NO row of its own reaches the '*' row.
--
-- This also aligns the charge side with the quote side: lib/pricing/price-book
-- findPrice() has always fallen back to '*'. The two resolvers disagreeing is
-- its own latent defect — a quote and a charge that use different rules are
-- only ever accidentally equal.
--
-- Services with no '*' row (database, kubernetes, platform_apps) are unaffected:
-- a bad key finds nothing and still fails loudly.

create or replace function billing.current_price(
  p_service_type text,
  p_plan_key     text default '*',
  p_at           timestamptz default now()
)
returns billing.service_pricing
language sql
stable
set search_path to 'billing', 'public', 'extensions'
as $function$
  select p.*
    from billing.service_pricing p
   where p.service_type = p_service_type
     and p.plan_key in (p_plan_key, '*')
     and p.effective_from <= p_at
     and (p.effective_to is null or p.effective_to > p_at)
   order by (p.plan_key = p_plan_key) desc, p.effective_from desc
   limit 1
$function$;

comment on function billing.current_price(text, text, timestamptz) is
  'Live price for (service, plan) at an instant. Prefers an exact plan_key and '
  'falls back to the service''s ''*'' row. Mirrors findPrice() in '
  'lib/pricing/price-book.ts — the quote and the charge must resolve alike.';

-- ── 3. The passthrough price ─────────────────────────────────────────────────
-- 1.0 x upstream, where the sweep supplies servers.hourly_cost as "upstream".
-- This is plumbing, not a margin: the markup is already baked into hourly_cost
-- at create time. Changing this multiplier re-prices EVERY compute VM at once,
-- which is why the admin panel should not offer it as an editable price.

select billing.set_price(
  p_service_type := 'compute',
  p_plan_key     := '*',
  p_rate_model   := 'markup',
  p_amount       := 1.0,
  p_unit         := 'multiplier',
  p_floor        := 0,
  p_note         := 'passthrough (1.0x) — resold compute bills servers.hourly_cost, the rate frozen at create. Not a margin; the markup is already in that number.',
  p_setup_fee    := 0
);
