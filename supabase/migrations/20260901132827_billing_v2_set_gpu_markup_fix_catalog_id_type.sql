-- gpu_catalog.id and gpu_pricing.gpu_catalog_id are TEXT (RunPod's own ids,
-- e.g. "NVIDIA A100 80GB PCIe"), not uuid. The first cut of this function
-- typed the parameter as uuid, which compiled fine and failed at CALL time
-- with "operator does not exist: text = uuid" — the comparison only runs when
-- a caller passes a non-null id, so the blanket path would have worked and the
-- targeted path would have broken in production.
--
-- Worth recording the shape rather than just the fix: a PL/pgSQL body is not
-- type-checked against the tables it touches until the branch executes, so
-- "it created successfully" says nothing about whether it runs. The only thing
-- that caught this was calling it with each argument that should be refused.
drop function if exists billing.set_gpu_markup(uuid, text, boolean, numeric, numeric, text, uuid);

create or replace function billing.set_gpu_markup(
  p_gpu_catalog_id text    default null,   -- null = every model (blanket)
  p_cloud_type     text    default null,   -- null = every cloud type
  p_interruptible  boolean default null,   -- null = both
  p_markup_pct     numeric default null,
  p_floor_per_hour numeric default 0,
  p_note           text    default null,
  p_actor          uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = billing, public, extensions
as $$
declare
  v_updated integer;
  v_charge  numeric;
  v_min     numeric;
  v_max     numeric;
begin
  if p_markup_pct is null then
    return jsonb_build_object('success', false, 'error', 'markup_pct is required');
  end if;

  -- Below cost is refused in the DATABASE, not just in the route. The same
  -- rule already guards billing.service_pricing and computeResalePerHour(); a
  -- third caller must not opt out of it by writing here instead.
  if p_markup_pct < 1 then
    return jsonb_build_object(
      'success', false,
      'error', 'markup_pct must be >= 1.000 — below 1 sells GPU under what the upstream charges us');
  end if;

  if p_floor_per_hour is null or p_floor_per_hour < 0 then
    return jsonb_build_object('success', false, 'error', 'floor_per_hour_usd must be >= 0');
  end if;

  -- A targeted edit must name a row that exists. Without this a typo'd catalog
  -- id updates nothing and reports success, and the operator believes a price
  -- changed when it did not.
  if p_gpu_catalog_id is not null
     and not exists (select 1 from public.gpu_catalog c where c.id = p_gpu_catalog_id) then
    return jsonb_build_object(
      'success', false,
      'error', format('No GPU %L in public.gpu_catalog', p_gpu_catalog_id));
  end if;

  update public.gpu_pricing g
     set markup_pct         = p_markup_pct,
         floor_per_hour_usd = p_floor_per_hour
   where (p_gpu_catalog_id is null or g.gpu_catalog_id = p_gpu_catalog_id)
     and (p_cloud_type      is null or g.cloud_type    = p_cloud_type)
     and (p_interruptible   is null or g.interruptible = p_interruptible);

  get diagnostics v_updated = row_count;

  -- Zero matched rows is a FAILURE, not a quiet success. An operator who
  -- filtered to a cloud_type that does not exist must be told nothing changed,
  -- or they will believe a price moved when it did not.
  if v_updated = 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'No pricing rows matched those filters — nothing was changed');
  end if;

  select amount into v_charge
    from billing.service_pricing
   where service_type = 'gpu_pod' and plan_key = '*' and effective_to is null;

  select min(markup_pct), max(markup_pct) into v_min, v_max from public.gpu_pricing;

  return jsonb_build_object(
    'success',      true,
    'rowsUpdated',  v_updated,
    'markupPct',    p_markup_pct,
    'floorPerHour', p_floor_per_hour,
    'note',         p_note,
    'actor',        p_actor,
    'drift', jsonb_build_object(
      'chargeMarkup',   v_charge,
      'quoteMarkupMin', v_min,
      'quoteMarkupMax', v_max,
      -- Uniform across every model AND equal to the charge markup. Anything
      -- else means a customer can be quoted one rate and billed another.
      'agrees',         (v_min = v_max and v_charge is not null and v_min = v_charge),
      'quoteIsUniform', (v_min = v_max)
    ));
end;
$$;

revoke all on function billing.set_gpu_markup(text, text, boolean, numeric, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function billing.set_gpu_markup(text, text, boolean, numeric, numeric, text, uuid)
  to service_role;

comment on function billing.set_gpu_markup is
  'Guarded write for public.gpu_pricing (the GPU quote path). Refuses markup < 1 and unmatched filters; returns drift against billing.service_pricing gpu_pod. Does not audit — the caller must.';
