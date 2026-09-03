-- A markup over nothing is not free, it is unknown.
--
-- resolve_hourly_rate refused a NULL upstream cost and accepted 0. A resold
-- resource whose frozen rate is 0 (a servers.hourly_cost that was never
-- written, a pod whose runpod_cost_per_hr defaulted) therefore resolved
-- through the compute/* or gpu_pod/* passthrough to an hourly rate of 0,
-- charge_service_hour returned 'zero-cost', and the sweep counted that as a
-- normal outcome. The customer was quoted a price and billed nothing, and the
-- report said all was well.
--
-- Zero is now refused for the markup model, the same way NULL is. The sweep
-- (scripts/billing/sweep.ts) also stops treating 'zero-cost' as benign.

create or replace function billing.resolve_hourly_rate(
  p_rate_model    text,
  p_amount        numeric,
  p_unit          text,
  p_floor         numeric default 0,
  p_upstream_cost numeric default null,
  p_quantity      numeric default null
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
    if p_unit <> 'multiplier' then
      raise exception 'resolve_hourly_rate: markup requires unit ''multiplier'', got %', p_unit;
    end if;
    if p_upstream_cost is null then
      raise exception 'resolve_hourly_rate: markup model requires p_upstream_cost';
    end if;
    -- A resold resource that costs us nothing does not exist. A zero here is a
    -- rate that was never written, and multiplying it is how a customer gets
    -- billed nothing for something they were quoted a price for.
    if p_upstream_cost <= 0 then
      raise exception 'resolve_hourly_rate: markup model requires a positive upstream cost, got %', p_upstream_cost;
    end if;
    v_hourly := p_upstream_cost * p_amount;

  elsif p_rate_model = 'per_gb_hour' then
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
