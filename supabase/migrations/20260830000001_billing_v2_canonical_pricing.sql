-- Billing v2, part 1 of 2: the canonical price book.
--
-- WHY THIS EXISTS
--
-- On 2026-08-30 an audit of live billing found a real paying customer charged
-- $4,629.91 for an EMPTY, already-DELETED object storage bucket. The correct
-- figure was about $6.43. The error was exactly 720x, and 720 is HOURS_IN_MONTH
-- in config/pricing.ts.
--
-- That is not a rounding bug or a bad multiplication. It is a MONTHLY price
-- that was written into a column meaning DOLLARS PER HOUR. Nothing in the old
-- schema could tell the difference, because `active_*.hourly_rate` is a bare
-- numeric: $60 meaning "per month" and $60 meaning "per hour" are the same
-- eight bytes.
--
-- Two more instances of the same shape were live at audit time: a compute
-- meter at $120.00/hr ($87,600/mo) and a second objectspace meter at $60.00/hr.
--
-- THE STRUCTURAL FIX
--
-- There is no hourly-rate column in this table. A price is stored in the unit
-- it was quoted in, and exactly one function (billing.resolve_hourly_rate)
-- converts to an hourly figure. You cannot write a monthly number into an
-- hourly field here, because no such field exists to write it into. The unit
-- is not a comment or a convention — it is a NOT NULL column, constrained
-- against the rate model, and it travels with the number everywhere it goes.
--
-- WHY PRICES ARE VERSIONED RATHER THAN UPDATED
--
-- Rows are never mutated. A price change closes the current row
-- (effective_to = now()) and inserts a new one. Two reasons:
--
--   * A charge records WHICH price produced it (service_charges.pricing_id).
--     "Why was I billed this?" stays answerable years later, after the price
--     has changed. With UPDATE-in-place that question becomes unanswerable the
--     moment anyone edits a price.
--   * A price edit is the highest-privilege write in the system — it is the
--     one that turned $6.43 into $4,629.91. An append-only table means a bad
--     edit is visible and reversible rather than silent and destructive.
--
-- THE ADMIN PANEL IS THE ONLY WRITER
--
-- Agreed with the admin-panel lane (separate origin, apps/admin): this schema
-- is owned here, the single write surface is owned there. Writes go through
-- AuditLogService with actor and old -> new, which pricing routes do NOT do
-- today. The manual `deduction personally from db by admin` transaction of
-- 2026-04-17 (-$680,140) is what an unaudited write path looks like after the
-- fact.

create schema if not exists billing;

-- ── Price book ───────────────────────────────────────────────────────────

create table if not exists billing.service_pricing (
  id                  uuid primary key default gen_random_uuid(),

  -- Which service this prices. Matches the service_type values already used by
  -- billing.transactions so history stays joinable: compute, gpu_pod,
  -- objectspace, spectrum, kubernetes, database, platform_apps,
  -- inference_vector, custom_image, gpu_volume.
  service_type        text        not null,

  -- Plan discriminator within a service. An instance_plans slug, a
  -- gpu_catalog_id, a platform-app size. '*' means the service has one price
  -- regardless of plan (objectspace, spectrum today).
  plan_key            text        not null default '*',

  -- How `amount` becomes money owed for one hour:
  --   fixed_hourly  — amount is a price; hourly = amount converted from `unit`
  --   markup        — amount is a multiplier over an observed upstream cost
  --                   supplied at charge time (GPU: RunPod's per-hour price)
  --   per_gb_hour   — amount is a price per GB; hourly = rate x GB measured
  --                   at charge time (object storage, custom images)
  rate_model          text        not null,

  amount              numeric(18,8) not null,

  -- The unit `amount` is quoted in. THIS IS THE COLUMN THAT PREVENTS THE BUG.
  unit                text        not null,

  -- Never sell below this hourly figure, whatever the model computes. Zero
  -- means no floor. Carried over from gpu_pricing.floor_per_hour_usd.
  floor_usd_per_hour  numeric(18,8) not null default 0,

  -- Version window. effective_to IS NULL means "this is the live price".
  effective_from      timestamptz not null default now(),
  effective_to        timestamptz,

  created_by          uuid,                      -- auth.users.id of the admin
  created_at          timestamptz not null default now(),
  note                text,                      -- why this price changed

  -- The unit has to make sense for the model. This is what makes the unit
  -- column load-bearing rather than decorative: a 'markup' row cannot claim to
  -- be dollars, and a 'per_gb_hour' row cannot claim to be a bare hourly rate.
  constraint service_pricing_unit_matches_model check (
    (rate_model = 'fixed_hourly' and unit in ('usd_per_hour','usd_per_month'))
    or (rate_model = 'markup'      and unit = 'multiplier')
    or (rate_model = 'per_gb_hour' and unit in ('usd_per_gb_month','usd_per_gb_hour'))
  ),

  constraint service_pricing_amount_non_negative check (amount >= 0),

  -- A markup below 1.0 sells under cost. computeResalePerHour() in
  -- lib/services/runpod/helpers.ts already rejects this; the database agrees
  -- rather than trusting every caller to remember.
  constraint service_pricing_markup_at_least_cost check (
    rate_model <> 'markup' or amount >= 1.0
  ),

  -- Backstop, not a policy. $1000/hr matches SECURITY_LIMITS.MAX_HOURLY_RATE in
  -- the cron worker. The real defence against a mistyped rate is the unit
  -- column plus the admin panel's median check; this only bounds the blast
  -- radius of something that defeats both.
  constraint service_pricing_hourly_sane check (
    unit <> 'usd_per_hour' or amount <= 1000
  ),

  constraint service_pricing_window_ordered check (
    effective_to is null or effective_to > effective_from
  )
);

-- At most ONE live price per (service, plan). A second live row would make the
-- charged rate depend on row order, which is the kind of bug that is invisible
-- until it is expensive. Partial unique index because the constraint applies
-- only to open-ended rows.
create unique index if not exists service_pricing_one_live_per_plan
  on billing.service_pricing (service_type, plan_key)
  where effective_to is null;

create index if not exists service_pricing_lookup
  on billing.service_pricing (service_type, plan_key, effective_from desc);

comment on table billing.service_pricing is
  'Canonical price book. Append-only: close a row and insert a new one rather '
  'than updating. Written only by the admin panel, read by billing.charge_service_hour.';

-- ── Unit conversion, in exactly one place ────────────────────────────────

-- HOURS_IN_MONTH is 720 (24 x 30) here to match config/pricing.ts. It is
-- deliberately NOT 730: the existing catalogue was priced against 720, and
-- changing the divisor would silently re-rate every service by 1.4%. If that
-- ever moves, it moves as a explicit product decision, not as a tidy-up.
create or replace function billing.hours_in_month()
returns numeric language sql immutable as $$ select 720::numeric $$;

create or replace function billing.resolve_hourly_rate(
  p_rate_model    text,
  p_amount        numeric,
  p_unit          text,
  p_floor         numeric default 0,
  p_upstream_cost numeric default null,  -- markup only: observed cost per hour
  p_quantity      numeric default null   -- per_gb_hour only: GB measured now
)
returns numeric
language plpgsql
immutable
set search_path = billing, public, extensions
as $$
declare
  v_hourly numeric;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'resolve_hourly_rate: amount must be >= 0, got %', p_amount;
  end if;

  if p_rate_model = 'fixed_hourly' then
    v_hourly := case p_unit
                  when 'usd_per_hour'  then p_amount
                  when 'usd_per_month' then p_amount / billing.hours_in_month()
                  else null
                end;

  elsif p_rate_model = 'markup' then
    -- A markup with no upstream cost is not "free", it is UNKNOWN. Returning 0
    -- would silently give away a GPU; the whole audit is a catalogue of empty
    -- values that were read as zero. Refuse instead.
    if p_upstream_cost is null then
      raise exception 'resolve_hourly_rate: markup model requires p_upstream_cost';
    end if;
    if p_upstream_cost < 0 then
      raise exception 'resolve_hourly_rate: upstream cost must be >= 0, got %', p_upstream_cost;
    end if;
    v_hourly := p_upstream_cost * p_amount;

  elsif p_rate_model = 'per_gb_hour' then
    -- Same rule: a missing measurement is not zero GB. An empty bucket is a
    -- measured 0 and must be passed as 0 explicitly.
    if p_quantity is null then
      raise exception 'resolve_hourly_rate: per_gb_hour model requires p_quantity';
    end if;
    if p_quantity < 0 then
      raise exception 'resolve_hourly_rate: quantity must be >= 0, got %', p_quantity;
    end if;
    v_hourly := case p_unit
                  when 'usd_per_gb_hour'  then p_amount * p_quantity
                  when 'usd_per_gb_month' then (p_amount * p_quantity) / billing.hours_in_month()
                  else null
                end;
  else
    raise exception 'resolve_hourly_rate: unknown rate_model %', p_rate_model;
  end if;

  if v_hourly is null then
    raise exception 'resolve_hourly_rate: unit % is not valid for model %', p_unit, p_rate_model;
  end if;

  return greatest(v_hourly, coalesce(p_floor, 0));
end;
$$;

comment on function billing.resolve_hourly_rate is
  'The only place a stored price becomes an hourly figure. Raises rather than '
  'returning 0 when an input it needs is absent — a missing measurement is '
  'unknown, not free.';

-- ── Live-price lookup ────────────────────────────────────────────────────

-- Returns the price row in force at p_at. Defaults to now(), but takes an
-- explicit timestamp so a BACKFILLED hour is priced with the price that was
-- live during that hour, not today's price. Without this, replaying a missed
-- window after a price change would bill the wrong amount and look correct.
create or replace function billing.current_price(
  p_service_type text,
  p_plan_key     text default '*',
  p_at           timestamptz default now()
)
returns billing.service_pricing
language sql
stable
set search_path = billing, public, extensions
as $$
  select p.*
    from billing.service_pricing p
   where p.service_type = p_service_type
     and p.plan_key = p_plan_key
     and p.effective_from <= p_at
     and (p.effective_to is null or p.effective_to > p_at)
   order by p.effective_from desc
   limit 1
$$;
