-- The guarded write for the GPU quote-path markup.
--
-- Counterpart to billing.set_price, which guards the CHARGE path. GPU has two
-- price books: public.gpu_pricing prices the customer's QUOTE (per GPU model),
-- billing.service_pricing prices what they are actually BILLED (one global
-- markup). They are not connected, so editing one silently diverges from the
-- other — quoted one price, charged another, with no error anywhere.
--
-- This cannot merge the books; that is a schema decision still open. What it
-- can do is refuse a bad write and REPORT the drift it just created or closed,
-- so the admin panel never has to guess.
--
-- ⚠️ SUPERSEDED IMMEDIATELY by 20260901132827, which fixes the parameter type.
-- gpu_catalog.id is TEXT (RunPod's own ids), not uuid. This version compiles
-- and its blanket path works; the TARGETED path fails at call time with
-- "operator does not exist: text = uuid". Kept so the migration sequence
-- replays faithfully — do not copy this signature.

create or replace function billing.set_gpu_markup(
  p_gpu_catalog_id uuid    default null,   -- null = every model (blanket)
  p_cloud_type     text    default null,
  p_interruptible  boolean default null,
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

  if p_markup_pct < 1 then
    return jsonb_build_object(
      'success', false,
      'error', 'markup_pct must be >= 1.000 — below 1 sells GPU under what the upstream charges us');
  end if;

  if p_floor_per_hour is null or p_floor_per_hour < 0 then
    return jsonb_build_object('success', false, 'error', 'floor_per_hour_usd must be >= 0');
  end if;

  if p_gpu_catalog_id is not null
     and not exists (select 1 from public.gpu_catalog where id = p_gpu_catalog_id) then
    return jsonb_build_object(
      'success', false,
      'error', format('No GPU %s in public.gpu_catalog', p_gpu_catalog_id));
  end if;

  update public.gpu_pricing g
     set markup_pct         = p_markup_pct,
         floor_per_hour_usd = p_floor_per_hour
   where (p_gpu_catalog_id is null or g.gpu_catalog_id = p_gpu_catalog_id)
     and (p_cloud_type      is null or g.cloud_type    = p_cloud_type)
     and (p_interruptible   is null or g.interruptible = p_interruptible);

  get diagnostics v_updated = row_count;

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
      'agrees',         (v_min = v_max and v_charge is not null and v_min = v_charge),
      'quoteIsUniform', (v_min = v_max)
    ));
end;
$$;

revoke all on function billing.set_gpu_markup(uuid, text, boolean, numeric, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function billing.set_gpu_markup(uuid, text, boolean, numeric, numeric, text, uuid)
  to service_role;
