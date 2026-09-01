-- charge_service_hour now applies discounts.
--
-- ORDER MATTERS AND IS DELIBERATE:
--   resolve price -> compute gross -> apply discount -> claim -> consume
--   free hours -> deduct
--
-- The free-hours allowance is decremented AFTER the claim insert, inside the
-- same block. If the hour was already charged the insert conflicts and the
-- function returns before touching the allowance — so a sweep that runs twice
-- cannot burn two hours of somebody's free tier for one hour of usage. And if
-- the deduction then fails, the whole block rolls back and the allowance comes
-- back with it.
--
-- A discount can never produce a negative amount. greatest(x, 0) is not
-- defensive decoration: billing.deduct_user_credit_atomic rejects a
-- non-positive amount, but a negative would have to get there first, and
-- config/pricing.ts already carries a guard against negative prices for the
-- same reason — deduct(-X) is a silent credit.
--
-- A fully-discounted hour returns 'zero-cost' and writes NO ledger row. That is
-- the same treatment an empty per-GB bucket gets: there is nothing to charge,
-- so there is nothing to record, and the ledger stays free of dust.
--
-- NOTE FOR CALLERS: this version adds a SEVENTH outcome, 'charged-free' — the
-- hour was claimed and recorded but no money moved because a free-hours
-- allowance covered it. Anything switching on the return value has to handle
-- it; treating it as an error would report a working free tier as a fault.
--
-- RECOVERED 2026-09-01 from supabase_migrations.schema_migrations (version
-- 20260831081120). Applied to production 2026-08-31; the file was never
-- written. This supersedes 20260831063455.

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
  v_period   timestamptz := date_trunc('hour', p_period_start);
  v_price    billing.service_pricing;
  v_hourly   numeric;
  v_gross    numeric;
  v_amount   numeric;
  v_disc     record;
  v_disc_id  uuid   := null;
  v_disc_amt numeric := 0;
  v_used_free boolean := false;
begin
  if p_user_id is null then
    return 'invalid-amount';
  end if;

  v_price := billing.current_price(p_service_type, p_plan_key, v_period);
  if v_price.id is null then
    return 'no-price';
  end if;

  v_hourly := billing.resolve_hourly_rate(
    v_price.rate_model, v_price.amount, v_price.unit,
    v_price.floor_usd_per_hour, p_upstream_cost, p_quantity
  );

  v_gross  := round(v_hourly * coalesce(p_units, 1), 6);
  v_amount := v_gross;

  -- Discount, if this customer holds one that covers this service and hour.
  select * into v_disc
    from billing.best_discount(p_user_id, p_service_type, p_plan_key, v_period);

  if v_disc.grant_id is not null then
    v_disc_id := v_disc.discount_id;

    if v_disc.kind = 'percent' then
      v_disc_amt := round(v_gross * (v_disc.value / 100.0), 6);
    elsif v_disc.kind = 'amount_off_hour' then
      -- Never more than the hour is worth: an "amount off" larger than the
      -- charge is a discount to zero, not a payment to the customer.
      v_disc_amt := least(round(v_disc.value, 6), v_gross);
    elsif v_disc.kind = 'free_hours' then
      v_disc_amt  := v_gross;
      v_used_free := true;
    end if;

    v_amount := greatest(round(v_gross - v_disc_amt, 6), 0);
  end if;

  if v_amount <= 0 and not v_used_free then
    -- Genuinely nothing to bill (an empty per-GB resource, or a 100% discount
    -- on a zero-value hour). Nothing to record.
    return 'zero-cost';
  end if;

  begin
    insert into billing.service_charges (
      service_type, service_id, period_start, user_id, amount_usd,
      pricing_id, hourly_rate, quantity, upstream_cost,
      gross_usd, discount_usd, discount_id
    )
    values (
      p_service_type, p_service_id, v_period, p_user_id, v_amount,
      v_price.id, v_hourly, p_quantity, p_upstream_cost,
      v_gross, v_disc_amt, v_disc_id
    )
    on conflict (service_type, service_id, period_start) do nothing;

    if not found then
      return 'already-charged';
    end if;

    -- Only now, with the hour definitively claimed, spend the allowance.
    if v_used_free then
      update billing.discount_grants
         set hours_remaining = hours_remaining - 1,
             status = case when hours_remaining - 1 <= 0 then 'exhausted' else status end
       where id = v_disc.grant_id;
      -- Fully covered: no money moves, but the ledger row stays so the customer
      -- can see the hour was used and what it would have cost.
      return 'charged-free';
    end if;

    perform billing.deduct_user_credit_atomic(p_user_id, v_amount);

  exception
    when others then
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

grant execute on function billing.charge_service_hour(
  text, uuid, uuid, timestamptz, text, numeric, numeric, numeric
) to service_role;
