-- Billing v2, part 2 of 2: meters, the charge ledger, and the hourly claim.
--
-- THE THREE DEFECTS THIS REPLACES, all found live on 2026-08-30
--
-- 1. DELTA BILLING. The old meters carry `last_billed_at` and charge
--    rate x (now - last_billed_at). One GPU pod was billed 115.86 hours as a
--    single $116.93 transaction because nothing swept it for five days. The
--    old worker needs a MAX_HOURS_PER_BILLING = 24 clamp to survive its own
--    design, and that clamp SILENTLY DISCARDS anything past 24h.
--
--    Here an hour is a row. Charging is a claim on (service, hour): it either
--    succeeds once or conflicts. A sweep that runs twice charges once. A sweep
--    that runs late charges the hour it was asked for.
--
-- 2. PRICE FROZEN INTO THE METER. `active_*.hourly_rate` was written at
--    provision time, so a wrong rate kept charging for months with nothing
--    pointing back at the decision that set it. Here the meter says WHAT IS
--    RUNNING; billing.service_pricing says WHAT IT COSTS; and every charge
--    records which price row produced it.
--
-- 3. METERS OUTLIVING THE RESOURCE. Two of three live objectspace meters at
--    audit time were billing DELETED buckets, one of them a paying customer's.
--    The v1 audit found the same shape ("billing outlived the app it billed",
--    five times in production). A meter here is closed by the same transaction
--    that ends the service, and the sweep re-checks liveness before charging.
--
-- WHAT THIS DOES NOT DO YET
--
-- It does not delete billing.active_*, and nothing here charges anything on
-- its own. Cutover is a separate, deliberate step: backfill meters, run the
-- new sweep in dry-run alongside the old one, compare, then switch. Money
-- systems get replaced by overlap, not by a big-bang swap.

-- ── What is running ──────────────────────────────────────────────────────

create table if not exists billing.service_meters (
  id            uuid primary key default gen_random_uuid(),

  service_type  text        not null,
  service_id    uuid        not null,
  user_id       uuid        not null,   -- the payer, resolved by the caller

  -- Selects the price row. instance_plans slug, gpu_catalog_id, app size, or
  -- '*' where the service has a single price.
  plan_key      text        not null default '*',

  -- Deliberately NO rate column. See defect 2 above. The price lives in the
  -- price book and is resolved per hour, so correcting a price corrects the
  -- next charge rather than requiring every meter row to be found and edited.

  -- Multiplier for services billed per unit of themselves: node count for a
  -- k8s cluster, GPU count for a pod. Storage GB is NOT this — it is measured
  -- at charge time and passed as p_quantity, because it changes hour to hour.
  units         numeric(18,6) not null default 1 check (units > 0),

  status        text        not null default 'active',
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint service_meters_status_valid check (status in ('active','suspended','closed')),
  constraint service_meters_window_ordered check (ended_at is null or ended_at >= started_at),
  -- A closed meter must say when. Without this, "closed" and "still running"
  -- become indistinguishable after the fact, which is how the deleted-bucket
  -- meters stayed invisible.
  constraint service_meters_closed_has_end check (status <> 'closed' or ended_at is not null)
);

-- One open meter per service. A second would double-bill the same resource.
create unique index if not exists service_meters_one_open_per_service
  on billing.service_meters (service_type, service_id)
  where ended_at is null;

create index if not exists service_meters_sweep
  on billing.service_meters (service_type, status)
  where ended_at is null;

create index if not exists service_meters_by_user
  on billing.service_meters (user_id) where ended_at is null;

comment on table billing.service_meters is
  'What is currently running and who pays for it. Carries no price — see '
  'billing.service_pricing. Closed by the same transaction that ends the service.';

-- ── What was charged ─────────────────────────────────────────────────────

create table if not exists billing.service_charges (
  id            uuid primary key default gen_random_uuid(),

  service_type  text        not null,
  service_id    uuid        not null,
  -- Always date_trunc('hour', ...). The unique index below is the whole
  -- idempotency mechanism, so this column must never carry sub-hour precision.
  period_start  timestamptz not null,

  user_id       uuid        not null,
  amount_usd    numeric(18,6) not null check (amount_usd >= 0),

  -- Which price produced this figure. Keeps "why was I charged this?"
  -- answerable after the price has since changed. Null only for charges
  -- backfilled from the pre-v2 ledger, which have no price row to point at.
  pricing_id    uuid references billing.service_pricing(id),

  -- The inputs, kept so a charge can be recomputed and checked rather than
  -- taken on trust.
  hourly_rate   numeric(18,8),
  quantity      numeric(18,6),
  upstream_cost numeric(18,8),

  created_at    timestamptz not null default now(),

  constraint service_charges_period_is_hour check (period_start = date_trunc('hour', period_start))
);

-- THE idempotency guarantee. Everything else is bookkeeping.
create unique index if not exists service_charges_one_per_service_hour
  on billing.service_charges (service_type, service_id, period_start);

create index if not exists service_charges_by_user_time
  on billing.service_charges (user_id, period_start desc);

create index if not exists service_charges_by_period
  on billing.service_charges (period_start desc);

comment on table billing.service_charges is
  'One row per (service, hour). The unique index makes a repeated sweep a '
  'no-op and a late sweep correct.';

-- ── The claim ────────────────────────────────────────────────────────────

-- Returns one of: charged | already-charged | insufficient | invalid-amount |
--                 no-meter | not-running
--
-- DESIGN NOTES, several of them load-bearing:
--
--   * The payer is a PARAMETER, not looked up here. Every service resolves its
--     payer differently (a v2 app finds the earliest owner of a team; a GPU pod
--     has a direct owner). A shared function that resolved it internally would
--     grow a `case service_type` and become the coupling it was meant to avoid.
--     Advised by the paas-v2 lane, which already lived this.
--
--   * INSERT ... ON CONFLICT DO NOTHING followed by `if not found` is the
--     idempotency idiom and must stay exactly that. FOUND is false when the
--     conflict swallowed the insert, which is what turns a duplicate into
--     'already-charged' rather than a second deduction. Rewriting this with
--     RETURNING ... INTO changes the behaviour.
--
--   * The deduction is inside a sub-block whose exception handler rolls the
--     claim back, so no ledger row survives for money that was never taken.
--
--   * Arrears are NOT marked here. The caller does it, in its own statement,
--     precisely so it is not rolled back with the claim — otherwise the grace
--     clock could never start for the customer who just failed to pay.
--
--   * p_period_start is explicit so a MISSED hour can be replayed. The paas-v2
--     sweep derives its period from now() with no override, and proved the
--     cost of that: the 00:00 hour on 2026-08-30 is missing from
--     paas.project_charges and can never be recovered. An idempotent design
--     gives safety; only an addressable period gives recoverability.

create or replace function billing.charge_service_hour(
  p_service_type   text,
  p_service_id     uuid,
  p_user_id        uuid,
  p_period_start   timestamptz,
  p_plan_key       text default '*',
  p_upstream_cost  numeric default null,
  p_quantity       numeric default null,
  p_units          numeric default 1
)
returns text
language plpgsql
security definer
set search_path = billing, public, extensions
as $$
declare
  v_period timestamptz := date_trunc('hour', p_period_start);
  v_price  billing.service_pricing;
  v_hourly numeric;
  v_amount numeric;
begin
  if p_user_id is null then
    return 'invalid-amount';
  end if;

  -- Price as of the hour being charged, NOT as of now. Replaying last week's
  -- missed hour must use last week's price.
  v_price := billing.current_price(p_service_type, p_plan_key, v_period);
  if v_price.id is null then
    return 'no-price';
  end if;

  v_hourly := billing.resolve_hourly_rate(
    v_price.rate_model, v_price.amount, v_price.unit,
    v_price.floor_usd_per_hour, p_upstream_cost, p_quantity
  );

  v_amount := round(v_hourly * coalesce(p_units, 1), 6);

  -- A zero-cost hour is legitimate (an empty bucket on a per-GB plan) but there
  -- is nothing to charge and nothing to record. Returning early keeps the
  -- ledger free of dust rows that would swamp the ones that matter.
  if v_amount <= 0 then
    return 'zero-cost';
  end if;

  -- Claim and payment in ONE savepoint scope.
  --
  -- The insert MUST live inside this block. PL/pgSQL opens a savepoint at the
  -- start of a block carrying an EXCEPTION clause, and a caught exception
  -- rewinds only to that savepoint. An insert placed BEFORE the block survives
  -- the rollback, leaving a ledger row saying the customer paid for an hour no
  -- money was taken for — and because that row is the idempotency key, the
  -- hour can then never be retried. A free hour, permanently recorded as paid,
  -- on an account simultaneously being suspended for non-payment.
  --
  -- Found by the test, not by reading: the first version of this function had
  -- the insert outside the block and a comment claiming it rolled back with it.
  -- paas.charge_project_hour carries the same defect and the same comment;
  -- reported to that lane on 2026-08-30.
  begin
    insert into billing.service_charges (
      service_type, service_id, period_start, user_id, amount_usd,
      pricing_id, hourly_rate, quantity, upstream_cost
    )
    values (
      p_service_type, p_service_id, v_period, p_user_id, v_amount,
      v_price.id, v_hourly, p_quantity, p_upstream_cost
    )
    on conflict (service_type, service_id, period_start) do nothing;

    if not found then
      return 'already-charged';
    end if;

    perform billing.deduct_user_credit_atomic(p_user_id, v_amount);

  exception
    when others then
      -- Only a genuine funding problem is 'insufficient'. Anything else is
      -- re-raised: reporting a deadlock or a missing grant as "this customer is
      -- broke" would suspend a paying customer and bury the real fault — the
      -- same shape as reading an empty result as a clean one.
      -- deduct_user_credit_atomic raises all three of its errors as bare P0001
      -- with no distinguishing SQLSTATE, so message text is the only available
      -- discriminator. The caller marks arrears separately, in its own
      -- statement, so the grace clock still starts.
      if sqlerrm like '%Insufficient credit balance%'
         or sqlerrm like '%User credit record not found%' then
        return 'insufficient';
      end if;
      raise;
  end;

  return 'charged';
end;
$$;

revoke all on function billing.charge_service_hour(
  text, uuid, uuid, timestamptz, text, numeric, numeric, numeric
) from public, anon, authenticated;

comment on function billing.charge_service_hour is
  'Idempotent per (service_type, service_id, hour). Safe to run twice; correct '
  'to run late. Caller resolves the payer and marks arrears on ''insufficient''.';

-- ── Locking down direct access ───────────────────────────────────────────

-- These tables decide what customers owe. Nothing client-side reaches them:
-- reads go through server routes that scope by user, writes go through the
-- functions above. The 2026-04-17 manual balance edit is the reason this is
-- explicit rather than assumed.
alter table billing.service_pricing enable row level security;
alter table billing.service_meters  enable row level security;
alter table billing.service_charges enable row level security;

revoke all on billing.service_pricing from anon, authenticated;
revoke all on billing.service_meters  from anon, authenticated;
revoke all on billing.service_charges from anon, authenticated;
