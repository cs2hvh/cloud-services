-- Two fixes, both found by testing set_price.
--
-- 1. resolve_hourly_rate did not check `unit` on the markup branch at all — it
--    multiplies upstream_cost by amount and the unit never enters the maths. So
--    a markup declared in 'usd_per_hour' resolved happily, and only the table's
--    CHECK constraint stopped it reaching disk. That made the unit column
--    decorative for exactly one rate model, which is the sort of gap that grows
--    a second inconsistent code path later. It now agrees with the constraint.
--
-- 2. set_price validated via resolve_hourly_rate and therefore inherited that
--    blind spot: the invalid pairing sailed past validation and blew up as an
--    unhandled constraint violation instead of the documented
--    {success:false, error} shape. Wrapping the write means a caller gets a
--    readable answer for ANY refusal, not just the ones anticipated.
--
-- RECOVERED 2026-09-01 from supabase_migrations.schema_migrations (version
-- 20260831083229). Applied to production 2026-08-31; the file was never
-- written. Supersedes the set_price defined in 20260831083128.

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
    -- The unit does not enter the arithmetic, but it must still be the right
    -- one: a markup quoted in dollars is a different thing from a multiplier,
    -- and letting it resolve here would contradict the table constraint.
    if p_unit <> 'multiplier' then
      raise exception 'resolve_hourly_rate: markup requires unit ''multiplier'', got %', p_unit;
    end if;
    if p_upstream_cost is null then
      raise exception 'resolve_hourly_rate: markup model requires p_upstream_cost';
    end if;
    if p_upstream_cost < 0 then
      raise exception 'resolve_hourly_rate: upstream cost must be >= 0, got %', p_upstream_cost;
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

-- Belt as well as braces: any refusal from the write itself now comes back as
-- a readable {success:false, error}, whatever raised it.
create or replace function billing.set_price(
  p_service_type text,
  p_plan_key     text,
  p_rate_model   text,
  p_amount       numeric,
  p_unit         text,
  p_floor        numeric default 0,
  p_note         text    default null,
  p_actor        uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = billing, public, extensions
as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_cur  billing.service_pricing;
  v_new  uuid;
  v_action text;
begin
  if not exists (
    select 1 from public.service_plans
     where service_type = p_service_type and plan_key = p_plan_key
  ) then
    return jsonb_build_object(
      'success', false,
      'error', format('No plan %s/%s in public.service_plans. Create the plan before pricing it.',
                      p_service_type, p_plan_key));
  end if;

  begin
    perform billing.resolve_hourly_rate(
      p_rate_model, p_amount, p_unit, p_floor,
      case when p_rate_model = 'markup'      then 1.0 else null end,
      case when p_rate_model = 'per_gb_hour' then 1.0 else null end);
  exception when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
  end;

  begin
    select * into v_cur from billing.service_pricing
     where service_type = p_service_type and plan_key = p_plan_key
       and effective_to is null
     for update;

    if found and v_cur.effective_from = v_hour then
      update billing.service_pricing
         set rate_model = p_rate_model, amount = p_amount, unit = p_unit,
             floor_usd_per_hour = coalesce(p_floor, 0),
             note = p_note, created_by = coalesce(p_actor, created_by)
       where id = v_cur.id
       returning id into v_new;
      v_action := 'corrected';
    else
      if found then
        update billing.service_pricing set effective_to = v_hour where id = v_cur.id;
      end if;
      insert into billing.service_pricing
        (service_type, plan_key, rate_model, amount, unit,
         floor_usd_per_hour, effective_from, created_by, note)
      values
        (p_service_type, p_plan_key, p_rate_model, p_amount, p_unit,
         coalesce(p_floor, 0), v_hour, p_actor, p_note)
      returning id into v_new;
      v_action := case when v_cur.id is null then 'created' else 'replaced' end;
    end if;
  exception when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
  end;

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'pricingId', v_new,
    'effectiveFrom', v_hour,
    'previousId', v_cur.id,
    'hourlyEquivalent',
      case when p_rate_model = 'fixed_hourly'
           then billing.resolve_hourly_rate(p_rate_model, p_amount, p_unit, p_floor)
           else null end);
end;
$$;

revoke all on function billing.set_price(text,text,text,numeric,text,numeric,text,uuid)
  from public, anon, authenticated;
grant execute on function billing.set_price(text,text,text,numeric,text,numeric,text,uuid)
  to service_role;
