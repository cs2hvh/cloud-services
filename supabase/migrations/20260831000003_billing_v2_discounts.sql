-- Discounts, coupons and free allowances for the v2 billing spine.
--
-- WHAT ALREADY EXISTED, AND WHY THIS IS SEPARATE
--
-- billing.promocodes + billing_redeem_promocode_atomic already handle one kind
-- of offer well: redeem a code, get credit added to your balance. That is a
-- CREDIT GRANT, and it is left exactly as it is.
--
-- A credit grant cannot express "20% off GPU for three months" or "your first
-- 100 hours of VPS are free". Those do not add money to a wallet — they change
-- what an hour COSTS, for a particular service, for a particular window. That
-- has to live where the hourly amount is computed, which is
-- billing.charge_service_hour.
--
-- THE SHAPE
--
--   billing.discounts        the offer itself — what it does and to what
--   billing.discount_grants  who has it, and how much of it they have left
--
-- Two tables rather than one because the same offer is normally held by many
-- customers, each with their own clock ("3 months from YOUR signup") and their
-- own remaining allowance. Collapsing them would mean either one row per
-- customer per offer with the definition copied into each (so editing an offer
-- edits nothing already granted), or a shared row with per-customer state
-- crammed into JSON — which is what promocodes.redeem_by does today, and why
-- it cannot answer "who redeemed this?" without scanning an array.
--
-- RULES THIS ENFORCES, each one a failure mode seen elsewhere in this system
--
--  * A discount can never take an amount below zero. A negative charge is a
--    REFUND: config/pricing.ts already carries an explicit guard against
--    negative prices because deduct(-X) silently adds credit. The same trap is
--    reachable through a 150% discount, so the floor is in the database.
--  * Percent is bounded 0-100 by a CHECK, not by the caller remembering.
--  * An expired or exhausted grant charges FULL price. It never errors and
--    never charges zero — "the discount has run out" and "this hour is free"
--    must not be the same outcome.
--  * Every discounted charge records WHICH discount applied and how much it
--    took off, alongside the gross. An invoice line that cannot explain its own
--    number is the defect this whole rebuild exists to remove.

-- ── The offer ────────────────────────────────────────────────────────────

create table if not exists billing.discounts (
  id            uuid primary key default gen_random_uuid(),

  -- Null code = automatic: it applies to whoever holds a grant without anyone
  -- typing anything (a free tier, a negotiated rate, a make-good after an
  -- outage). A non-null code is redeemable and must be unique.
  code          text unique,
  name          text        not null,
  description   text,

  -- percent          — value is 0-100, taken off the hourly amount
  -- amount_off_hour  — value is USD subtracted from each hour, floored at 0
  -- free_hours       — value is an hour allowance; each billable hour consumes
  --                    one and costs nothing until the allowance runs out
  kind          text        not null,
  value         numeric(18,6) not null,

  -- Scope. NULL means "everything": a null service_type applies platform-wide,
  -- a null plan_key applies to every plan of that service. Deliberately NOT
  -- '*' — '*' is a real plan_key value in service_pricing, and reusing it here
  -- would make "the flat-priced plan" and "any plan" indistinguishable.
  service_type  text,
  plan_key      text,

  -- Validity of the OFFER. A grant has its own window on top of this.
  starts_at     timestamptz not null default date_trunc('hour', now()),
  ends_at       timestamptz,

  -- How many grants may exist. Null = unlimited.
  max_grants    integer,

  -- When several discounts could apply to one hour, the highest priority wins.
  -- Ties break on the largest saving, then the oldest offer, so the outcome is
  -- deterministic rather than dependent on row order.
  priority      integer     not null default 0,

  is_active     boolean     not null default true,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint discounts_kind_valid check (kind in ('percent','amount_off_hour','free_hours')),

  -- A 0% discount is pointless and a 150% discount is a refund. Both are
  -- refused rather than clamped, so a mistyped offer fails at creation instead
  -- of quietly doing something unintended for a month.
  constraint discounts_percent_bounded check (
    kind <> 'percent' or (value > 0 and value <= 100)
  ),
  constraint discounts_amount_non_negative check (
    kind <> 'amount_off_hour' or value >= 0
  ),
  constraint discounts_free_hours_positive check (
    kind <> 'free_hours' or value > 0
  ),
  constraint discounts_window_ordered check (ends_at is null or ends_at > starts_at)
);

create index if not exists discounts_lookup
  on billing.discounts (service_type, plan_key) where is_active;

comment on table billing.discounts is
  'Offer definitions. A credit-adding promo code stays in billing.promocodes; '
  'this is for offers that change what an hour costs.';

-- ── Who holds it ─────────────────────────────────────────────────────────

create table if not exists billing.discount_grants (
  id              uuid primary key default gen_random_uuid(),
  discount_id     uuid        not null references billing.discounts(id) on delete cascade,
  user_id         uuid        not null,

  granted_at      timestamptz not null default now(),
  -- Per-customer window, e.g. "3 months from THIS customer's signup". Null
  -- falls back to the offer's own ends_at.
  expires_at      timestamptz,

  -- free_hours only: what is left. Decremented inside the same transaction as
  -- the charge claim, so a retried sweep cannot consume the allowance twice —
  -- the claim conflicts first and returns before anything is decremented.
  hours_remaining numeric(18,6),

  status          text        not null default 'active',
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),

  constraint discount_grants_status_valid check (status in ('active','exhausted','expired','revoked')),
  constraint discount_grants_hours_non_negative check (hours_remaining is null or hours_remaining >= 0),
  -- One grant of a given offer per customer. Two would double-apply it.
  constraint discount_grants_one_per_user unique (discount_id, user_id)
);

create index if not exists discount_grants_active
  on billing.discount_grants (user_id) where status = 'active';

comment on table billing.discount_grants is
  'Which customer holds which offer, with their own clock and remaining allowance.';

-- ── Recording the effect on a charge ─────────────────────────────────────

-- Without these a discounted charge cannot explain itself: the ledger would
-- show a number lower than the price book implies, with nothing saying why.
alter table billing.service_charges
  add column if not exists gross_usd     numeric(18,6),
  add column if not exists discount_usd  numeric(18,6) not null default 0,
  add column if not exists discount_id   uuid references billing.discounts(id);

comment on column billing.service_charges.gross_usd is
  'What the hour would have cost before any discount. amount_usd is what was actually taken.';

-- ── Choosing the discount for one hour ───────────────────────────────────

-- Returns the single best grant for this (user, service, plan) at this instant,
-- or nothing. Scope matching is most-specific-first via the ORDER BY: an offer
-- naming both service and plan outranks one naming only the service, which
-- outranks a platform-wide one.
create or replace function billing.best_discount(
  p_user_id      uuid,
  p_service_type text,
  p_plan_key     text,
  p_at           timestamptz
)
returns table (
  grant_id uuid, discount_id uuid, kind text, value numeric, hours_remaining numeric
)
language sql
stable
set search_path = billing, public, extensions
as $$
  select g.id, d.id, d.kind, d.value, g.hours_remaining
    from billing.discount_grants g
    join billing.discounts d on d.id = g.discount_id
   where g.user_id = p_user_id
     and g.status = 'active'
     and d.is_active
     and d.starts_at <= p_at
     and (d.ends_at is null or d.ends_at > p_at)
     and (g.expires_at is null or g.expires_at > p_at)
     -- NULL scope means "any", so a null column matches everything.
     and (d.service_type is null or d.service_type = p_service_type)
     and (d.plan_key    is null or d.plan_key    = p_plan_key)
     -- A free-hours grant with nothing left must not win the selection and
     -- then discount nothing; it is simply not applicable any more.
     and (d.kind <> 'free_hours' or coalesce(g.hours_remaining, 0) > 0)
   order by d.priority desc,
            (d.service_type is not null) desc,
            (d.plan_key is not null) desc,
            d.created_at asc
   limit 1
$$;

comment on function billing.best_discount is
  'The one discount that applies to a given hour. Deterministic: priority, then '
  'scope specificity, then age — never row order.';

-- ── Applying it: charge_service_hour, updated ────────────────────────────
--
-- ORDER MATTERS AND IS DELIBERATE:
--   resolve price -> compute gross -> apply discount -> claim -> consume
--   free hours -> deduct
--
-- The free-hours allowance is decremented AFTER the claim insert, inside the
-- same block. If the hour was already charged the insert conflicts and the
-- function returns before touching the allowance — so a sweep that runs twice
-- cannot burn two hours of somebody's free tier for one hour of usage. If the
-- deduction then fails, the whole block rolls back and the allowance returns
-- with it. There is a test pinning exactly this.
--
-- A discount can never produce a negative amount. greatest(x, 0) is not
-- decoration: deduct(-X) silently ADDS credit, which is why config/pricing.ts
-- already carries a guard against negative prices. A 150% discount is the same
-- trap by another route.
--
-- 'charged-free' is a fully-covered hour: the ledger row is written (so the
-- customer can see the hour and what it would have cost) but no money moves.
-- It is distinct from 'zero-cost', which means there was nothing to bill at all
-- and writes no row.
--
-- The function body is identical to the one applied as migration
-- billing_v2_charge_applies_discounts; see that migration in the Supabase
-- history for the applied statement.
