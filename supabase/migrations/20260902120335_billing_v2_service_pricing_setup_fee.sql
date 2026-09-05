-- Recovered 2026-09-05 from supabase_migrations.schema_migrations.statements
-- (version 20260902120335). It was applied on 2026-09-02 through the Supabase
-- MCP and never committed, which is exactly the gap scripts/ci/migration-drift.ts
-- exists to catch; the check has been red since its first run because of this
-- file and one renamed sibling. The SQL below is the applied statement verbatim.
--
-- A one-off setup fee belongs in the price book, or it disappears.
--
-- The old catalogue carried two numbers per product: `price` (recurring) and
-- `fixed_price` (charged once at provision). billing.service_pricing only ever
-- modelled the recurring half, which was fine while nothing read it for
-- quoting. The moment the app starts quoting from the price book — which is
-- the point of this whole exercise — every setup fee silently becomes zero,
-- and the admin panel has no field to put it back.
--
-- It is not hypothetical revenue. From the archive:
--   kubernetes      8 of 8 plans   $5.00
--   platform-apps   3 of 5 sizes   $5.00
--   object-storage  1 of 1         $5.00
--   database        2 of 48        $5.00
--
-- So the column comes across with the prices it belongs to.

alter table billing.service_pricing
  add column if not exists setup_fee_usd numeric(18,4) not null default 0;

alter table billing.service_pricing
  drop constraint if exists service_pricing_setup_fee_sane;

-- Same reasoning as the recurring bounds: a mistyped setup fee is refused by
-- the database rather than by whoever is reviewing the admin form. $500 is far
-- above the $5 every real fee uses and far below the amount that would matter.
alter table billing.service_pricing
  add constraint service_pricing_setup_fee_sane
  check (setup_fee_usd >= 0 and setup_fee_usd <= 500);

comment on column billing.service_pricing.setup_fee_usd is
  'One-off charge at provision time, in USD. Separate from the recurring amount, which is per `unit`. Was products.fixed_price.';

-- ── Backfill from the archive ────────────────────────────────────────────

-- kubernetes and database key on the old products.id; platform_apps on `sub`;
-- object storage is the single '*' row.
update billing.service_pricing sp
   set setup_fee_usd = p.fixed_price
  from pricing_archive_20260831.products p
 where sp.effective_to is null
   and sp.service_type in ('kubernetes', 'database')
   and sp.plan_key = p.id::text
   and coalesce(p.fixed_price, 0) > 0;

update billing.service_pricing sp
   set setup_fee_usd = p.fixed_price
  from pricing_archive_20260831.products p
 where sp.effective_to is null
   and sp.service_type = 'platform_apps'
   and p.type = 'platform-apps'
   and sp.plan_key = p.sub
   and coalesce(p.fixed_price, 0) > 0;

update billing.service_pricing sp
   set setup_fee_usd = p.fixed_price
  from pricing_archive_20260831.products p
 where sp.effective_to is null
   and sp.service_type = 'objectspace'
   and p.type = 'object-storage'
   and coalesce(p.fixed_price, 0) > 0;

-- ── set_price learns about it ────────────────────────────────────────────
--
-- Dropped and recreated rather than replaced: adding a parameter makes a
-- DIFFERENT function, and leaving both would make the panel's existing
-- 8-argument named call ambiguous between the old one and the new one falling
-- back on its default — which fails at call time, not at deploy. One
-- signature. The default means the panel's current call keeps working
-- untouched and simply preserves the existing fee.

drop function if exists billing.set_price(text, text, text, numeric, text, numeric, text, uuid);

create or replace function billing.set_price(
  p_service_type text,
  p_plan_key     text,
  p_rate_model   text,
  p_amount       numeric,
  p_unit         text,
  p_floor        numeric default 0,
  p_note         text    default null,
  p_actor        uuid    default null,
  p_setup_fee    numeric default null   -- null = keep whatever is there
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
  v_fee  numeric;
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

  if p_setup_fee is not null and (p_setup_fee < 0 or p_setup_fee > 500) then
    return jsonb_build_object(
      'success', false,
      'error', format('setup_fee must be between 0 and 500, got %s', p_setup_fee));
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

    -- Omitting the fee CARRIES IT FORWARD rather than zeroing it. A caller
    -- changing only the hourly rate must not silently drop a setup fee it
    -- never mentioned.
    v_fee := coalesce(p_setup_fee, v_cur.setup_fee_usd, 0);

    if found and v_cur.effective_from = v_hour then
      update billing.service_pricing
         set rate_model = p_rate_model, amount = p_amount, unit = p_unit,
             floor_usd_per_hour = coalesce(p_floor, 0),
             setup_fee_usd = v_fee,
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
         floor_usd_per_hour, setup_fee_usd, effective_from, created_by, note)
      values
        (p_service_type, p_plan_key, p_rate_model, p_amount, p_unit,
         coalesce(p_floor, 0), v_fee, v_hour, p_actor, p_note)
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
    'setupFee', v_fee,
    'hourlyEquivalent',
      case when p_rate_model = 'fixed_hourly'
           then billing.resolve_hourly_rate(p_rate_model, p_amount, p_unit, p_floor)
           else null end);
end;
$$;

revoke all on function billing.set_price(text,text,text,numeric,text,numeric,text,uuid,numeric)
  from public, anon, authenticated;
grant execute on function billing.set_price(text,text,text,numeric,text,numeric,text,uuid,numeric)
  to service_role;

comment on function billing.set_price is
  'The only sanctioned way to change a price. Closes the current row and inserts a new one atomically; corrects in place within the same (unbilled) hour. Omitting p_setup_fee carries the existing fee forward.';
