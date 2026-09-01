-- Fix: a failed deduction was leaving a ledger row behind.
--
-- FOUND BY TEST, and the test is the only reason it was found — the previous
-- version carried a comment asserting the opposite behaviour.
--
-- PL/pgSQL establishes a savepoint at the start of a block that has an
-- EXCEPTION clause, and a caught exception rolls back only to THAT savepoint.
-- The INSERT sat before the block, so it was never inside the savepoint's
-- scope and survived the rollback. The result: a service_charges row saying
-- the customer was billed for that hour, with no money taken — and because the
-- row is what makes the operation idempotent, the hour could never be retried.
-- A free hour, recorded as paid.
--
-- The claim and the deduction now sit in ONE block, so they roll back together.
--
-- Second change: `when others` no longer means "insufficient". Only the two
-- conditions deduct_user_credit_atomic actually raises for a funding problem
-- map to 'insufficient'; anything else is re-raised. Reporting a genuine fault
-- as "this customer is broke" would suspend a paying customer and hide a bug,
-- which is the same shape of defect as reading an empty result as a clean one.
-- The conditions are matched on message text because that function raises all
-- three of its errors as bare P0001 with no distinguishing SQLSTATE.
--
-- The same defect existed in paas.charge_project_hour and was fixed there by
-- 20260831063808_paas_charge_hour_claim_must_share_the_savepoint.sql.
--
-- RECOVERED 2026-09-01 from supabase_migrations.schema_migrations (version
-- 20260831063455). Applied to production 2026-08-31; the file was never
-- written.

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

  v_price := billing.current_price(p_service_type, p_plan_key, v_period);
  if v_price.id is null then
    return 'no-price';
  end if;

  v_hourly := billing.resolve_hourly_rate(
    v_price.rate_model, v_price.amount, v_price.unit,
    v_price.floor_usd_per_hour, p_upstream_cost, p_quantity
  );

  v_amount := round(v_hourly * coalesce(p_units, 1), 6);

  if v_amount <= 0 then
    return 'zero-cost';
  end if;

  -- Claim and payment in one savepoint scope. If the deduction throws, the
  -- claim goes with it.
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

    -- FOUND is false when the conflict swallowed the insert. This idiom is
    -- what turns a duplicate sweep into a no-op; do not rewrite it as
    -- RETURNING ... INTO, which behaves differently here.
    if not found then
      return 'already-charged';
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
