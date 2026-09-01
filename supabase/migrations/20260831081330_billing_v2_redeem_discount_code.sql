-- Turning a typed discount code into a grant.
--
-- The counterpart of billing_redeem_promocode_atomic, and modelled on it
-- deliberately — that function is the one piece of the old billing system that
-- got concurrency right, and there is no reason to invent a second pattern.
--
--   * SELECT ... FOR UPDATE on the offer row serialises concurrent redemptions,
--     so the max_grants cap cannot be overshot by two people redeeming at once.
--   * The per-user unique constraint is the real defence against a double
--     grant; the explicit check exists only to return a readable message
--     instead of a constraint violation.
--   * Returns jsonb {success, error?} rather than raising, so a bad code is an
--     ordinary answer and not an exception the caller has to catch.
--
-- Unlike a promo code this moves NO money. It grants an entitlement that
-- changes what future hours cost, which is why it cannot simply reuse the
-- promocodes path.
--
-- RECOVERED 2026-09-01 from supabase_migrations.schema_migrations (version
-- 20260831081330). Applied to production 2026-08-31; the file was never
-- written.

create or replace function billing.redeem_discount_code(
  p_code    text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = billing, public, extensions
as $$
declare
  v_d       billing.discounts%rowtype;
  v_code    text := upper(btrim(coalesce(p_code, '')));
  v_now     timestamptz := now();
  v_granted integer;
  v_grant   uuid;
begin
  if v_code = '' then
    return jsonb_build_object('success', false, 'error', 'Discount code is required');
  end if;
  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;

  select * into v_d from billing.discounts
   where upper(code) = v_code
   for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'You have entered an invalid discount code');
  end if;
  if v_d.is_active is distinct from true then
    return jsonb_build_object('success', false, 'error', 'This discount code is no longer available');
  end if;
  if v_d.starts_at > v_now then
    return jsonb_build_object('success', false, 'error', 'This discount code is not active yet');
  end if;
  if v_d.ends_at is not null and v_d.ends_at <= v_now then
    return jsonb_build_object('success', false, 'error', 'This discount code has expired');
  end if;

  if exists (select 1 from billing.discount_grants
              where discount_id = v_d.id and user_id = p_user_id) then
    return jsonb_build_object('success', false, 'error', 'You have already redeemed this discount code');
  end if;

  if v_d.max_grants is not null then
    select count(*) into v_granted from billing.discount_grants where discount_id = v_d.id;
    if v_granted >= v_d.max_grants then
      return jsonb_build_object('success', false, 'error', 'This discount code has reached its limit');
    end if;
  end if;

  -- free_hours seeds the customer's allowance from the offer's value; the other
  -- kinds carry no per-customer state and leave it null.
  insert into billing.discount_grants (discount_id, user_id, hours_remaining)
  values (v_d.id, p_user_id,
          case when v_d.kind = 'free_hours' then v_d.value else null end)
  returning id into v_grant;

  return jsonb_build_object(
    'success', true,
    'grantId', v_grant,
    'name', v_d.name,
    'kind', v_d.kind,
    'value', v_d.value,
    'serviceType', v_d.service_type,
    'expiresAt', v_d.ends_at
  );
end;
$$;

revoke all on function billing.redeem_discount_code(text, uuid) from public, anon;
grant execute on function billing.redeem_discount_code(text, uuid) to service_role;

comment on function billing.redeem_discount_code is
  'Turns a typed discount code into a grant. Grants an entitlement; moves no money.';
