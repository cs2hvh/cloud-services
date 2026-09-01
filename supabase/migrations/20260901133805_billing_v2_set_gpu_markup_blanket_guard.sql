-- Move the blanket-edit guard out of the admin panel's route and into the
-- function, where no caller can opt out of it.
--
-- The panel already refuses an unconfirmed blanket edit, and does it well
-- (types ALL, states the row count, names the book it does not touch). But
-- that guard lives in a route, which is the same layer the below-cost rule was
-- deliberately kept OUT of: a script, a future route, or somebody at a psql
-- prompt calling set_gpu_markup(p_markup_pct => 2.0) with no filters moves
-- every GPU price with nothing to stop it.
--
-- "The only caller today" is exactly how this service ended up with two
-- disconnected GPU price books.
--
-- WHY DROP AND RECREATE RATHER THAN `create or replace`
--
-- Adding a parameter makes a DIFFERENT function, not a replacement — Postgres
-- keys functions on their argument list. Leaving both in place would make a
-- 7-argument named call ambiguous between the old function and the new one
-- using its default, which errors at call time rather than at deploy. One
-- signature only. The drop and create share this migration's transaction, so
-- there is no window where the function is missing.
--
-- A partial filter is NOT a blanket edit: naming a cloud_type is a deliberate
-- choice even when it matches many rows (96 of 192 today). The guard fires
-- only when nothing at all was specified, which is the case that happens by
-- accident.
--
-- Sequenced with the panel lane: their route was changed FIRST to send
-- p_blanket, with a fallback to the old signature, so neither ordering broke
-- anything (commit 471608d5 on feat/separate-admin-panel).

drop function if exists billing.set_gpu_markup(text, text, boolean, numeric, numeric, text, uuid);

create or replace function billing.set_gpu_markup(
  p_gpu_catalog_id text    default null,   -- null = every model
  p_cloud_type     text    default null,   -- null = every cloud type
  p_interruptible  boolean default null,   -- null = both
  p_markup_pct     numeric default null,
  p_floor_per_hour numeric default 0,
  p_note           text    default null,
  p_actor          uuid    default null,
  p_blanket        boolean default false   -- required to edit EVERY model
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
  v_scope   integer;
begin
  if p_markup_pct is null then
    return jsonb_build_object('success', false, 'error', 'markup_pct is required');
  end if;

  -- Below cost is refused in the DATABASE, not just in the route. The same
  -- rule already guards billing.service_pricing and computeResalePerHour().
  if p_markup_pct < 1 then
    return jsonb_build_object(
      'success', false,
      'error', 'markup_pct must be >= 1.000 — below 1 sells GPU under what the upstream charges us');
  end if;

  if p_floor_per_hour is null or p_floor_per_hour < 0 then
    return jsonb_build_object('success', false, 'error', 'floor_per_hour_usd must be >= 0');
  end if;

  -- Nothing specified = every GPU price in the catalogue. Must be deliberate.
  if p_gpu_catalog_id is null
     and p_cloud_type is null
     and p_interruptible is null
     and p_blanket is not true then
    select count(*) into v_scope from public.gpu_pricing;
    return jsonb_build_object(
      'success', false,
      'error', format(
        'This would change every GPU price (%s rows). Pass p_blanket => true to confirm a blanket edit.',
        v_scope),
      'wouldAffect', v_scope);
  end if;

  -- A targeted edit must name a row that exists. Without this a typo'd catalog
  -- id updates nothing and reports success.
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
  -- typo'd a cloud_type must be told nothing changed.
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
    'blanket',      (p_blanket is true),
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

revoke all on function billing.set_gpu_markup(text, text, boolean, numeric, numeric, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function billing.set_gpu_markup(text, text, boolean, numeric, numeric, text, uuid, boolean)
  to service_role;

comment on function billing.set_gpu_markup is
  'Guarded write for public.gpu_pricing (the GPU quote path). Refuses markup < 1, unmatched filters, and an unconfirmed blanket edit (p_blanket). Returns drift against billing.service_pricing gpu_pod. Does not audit — the caller must.';
