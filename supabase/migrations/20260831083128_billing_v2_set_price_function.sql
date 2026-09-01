-- The only sanctioned way to change a price.
--
-- Requested by the admin-panel lane, and they are right: rule 3 ("never UPDATE
-- a price, close it and insert a new row") is currently a convention that every
-- client has to remember. A client that forgets it and UPDATEs in place
-- silently rewrites history — every past charge that references that row now
-- claims to have been made at a price that was never in force. Making the
-- close-then-insert atomic and server-side turns the rule into something no
-- caller can get wrong.
--
-- THE SAME-HOUR CASE, which is the fiddly one
--
-- Prices change on hour boundaries, so closing a price at
-- date_trunc('hour', now()) when it was ALSO created in the current hour would
-- produce effective_to = effective_from — a zero-length window, refused by
-- service_pricing_window_ordered. That case is a correction, not a change: the
-- sweep bills the hour that has COMPLETED, so a price set at 10:15 and revised
-- at 10:45 never priced anything. It is updated in place.
--
-- Any earlier price is closed, never touched otherwise, because it may have
-- priced real charges.
--
-- RECOVERED 2026-09-01 from supabase_migrations.schema_migrations (version
-- 20260831083128). Applied to production 2026-08-31; the file was never
-- written. SUPERSEDED the same day by 20260831083229, which wraps the write in
-- its own exception handler — keep both so the sequence replays faithfully.

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
  -- The plan must exist. Without this a typo in plan_key creates a price that
  -- can never match a meter, and the only symptom is a service that silently
  -- bills nothing — the failure mode this whole rebuild exists to remove.
  if not exists (
    select 1 from public.service_plans
     where service_type = p_service_type and plan_key = p_plan_key
  ) then
    return jsonb_build_object(
      'success', false,
      'error', format('No plan %s/%s in public.service_plans. Create the plan before pricing it.',
                      p_service_type, p_plan_key));
  end if;

  -- Validate by construction: resolve_hourly_rate raises on a bad
  -- model/unit pairing, so a nonsensical combination is refused here rather
  -- than at 03:00 when the sweep runs.
  begin
    perform billing.resolve_hourly_rate(
      p_rate_model, p_amount, p_unit, p_floor,
      case when p_rate_model = 'markup'      then 1.0 else null end,
      case when p_rate_model = 'per_gb_hour' then 1.0 else null end);
  exception when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
  end;

  select * into v_cur from billing.service_pricing
   where service_type = p_service_type and plan_key = p_plan_key
     and effective_to is null
   for update;

  if found and v_cur.effective_from = v_hour then
    -- Same hour: a correction to a price that never took effect.
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

comment on function billing.set_price is
  'The only sanctioned way to change a price. Closes the current row and inserts a new one atomically; corrects in place only within the same (unbilled) hour. Validates the plan exists and the model/unit pairing resolves.';
