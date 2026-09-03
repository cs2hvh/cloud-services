-- An hour a customer could not afford is now owed, not forgotten.
--
-- THE DEFECT
--
-- charge_service_hour claims the hour by INSERT, then deducts. When the deduct
-- raises "Insufficient credit balance" the PL/pgSQL exception block rolls the
-- savepoint back — taking the service_charges row with it — and returns
-- 'insufficient'. Nothing is written. The sweep moves on and never revisits
-- that hour, because it only ever bills the hour in front of it.
--
-- So a customer who runs out of balance gets their usage free, and the evidence
-- erases itself the moment they top up: coverage goes green again and the gap
-- behind it looks like history.
--
-- Live case. ved@samatva.com ran two GPU volumes through 2026-08-31 07:00 to
-- 2026-09-01 10:00 with no balance. 28 contiguous hours, both volumes, nothing
-- recorded. A third volume belonging to another customer billed normally
-- throughout, which is how the blackout was eventually told apart from a sweep
-- stall. They topped up $100 at 11:41 and billing resumed at the next sweep.
-- 56 meter-hours, $3.59, written off in silence.
--
-- The amount is nothing. The mechanism is that unpaid usage cannot be seen,
-- chased, or settled, because no row for it exists anywhere.
--
-- billing.close_active_service ALREADY does the right thing here: at teardown
-- it writes a status='failed' usage transaction so an unaffordable final charge
-- "stays observable and can be settled on a later top-up rather than written
-- off". The pattern was in the codebase; the hourly sweep just never got it.
-- This gives it the same one.
--
-- WHY NOT A service_charges ROW
--
-- service_charges means money that moved. Putting unpaid hours in it would make
-- every sum over that table wrong, and the coverage monitor reads it to answer
-- "was this hour billed" — an arrears row there would report the hour as
-- covered when nobody paid for it. Arrears belong in the ledger as a failed
-- charge, which is exactly what status='failed' is for.

-- ── 1. The ledger has to accept the service types that actually meter ────────
--
-- transactions_service_type_check predates gpu_volume and gpu_pod_storage, both
-- of which are live billable types with open meters today. Without this the
-- arrears INSERT below would raise INSIDE the exception handler — turning a
-- clean 'insufficient' return into a hard error, and breaking the sweep for
-- precisely the meters that most need arrears. ved@samatva.com's two silent
-- volumes are gpu_volume.

alter table billing.transactions drop constraint if exists transactions_service_type_check;

alter table billing.transactions add constraint transactions_service_type_check
  check (
    service_type is null or service_type = any (array[
      -- existing, preserved exactly
      'database', 'kubernetes', 'objectspace', 'spectrum', 'platform_apps',
      'domain', 'gpu_pod', 'compute', 'custom_image', 'inference_finetune',
      'inference_serving', 'inference_deployment', 'inference_vector',
      'game_server',
      -- live metered types the ledger could not name
      'gpu_volume', 'gpu_pod_storage'
    ])
  );

-- ── 2. One arrears row per unpaid hour ──────────────────────────────────────
--
-- The sweep retries every hour and will re-attempt the same unaffordable hour
-- indefinitely. Without this index each attempt would add another arrears row
-- and a day of insolvency would produce hundreds of duplicates.

create unique index if not exists transactions_arrears_unique
  on billing.transactions (service_type, service_id, period_start)
  where status = 'failed' and type = 'usage';

-- ── 3. Record the debt ──────────────────────────────────────────────────────

create or replace function billing.charge_service_hour(
  p_service_type text,
  p_service_id uuid,
  p_user_id uuid,
  p_period_start timestamptz,
  p_plan_key text default '*',
  p_upstream_cost numeric default null,
  p_quantity numeric default null,
  p_units numeric default 1
)
returns text
language plpgsql
security definer
set search_path to 'billing', 'public', 'extensions'
as $function$
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
  v_bal      numeric;
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

  select * into v_disc
    from billing.best_discount(p_user_id, p_service_type, p_plan_key, v_period);

  if v_disc.grant_id is not null then
    v_disc_id := v_disc.discount_id;

    if v_disc.kind = 'percent' then
      v_disc_amt := round(v_gross * (v_disc.value / 100.0), 6);
    elsif v_disc.kind = 'amount_off_hour' then
      v_disc_amt := least(round(v_disc.value, 6), v_gross);
    elsif v_disc.kind = 'free_hours' then
      v_disc_amt  := v_gross;
      v_used_free := true;
    end if;

    v_amount := greatest(round(v_gross - v_disc_amt, 6), 0);
  end if;

  if v_amount <= 0 and not v_used_free then
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

    if v_used_free then
      update billing.discount_grants
         set hours_remaining = hours_remaining - 1,
             status = case when hours_remaining - 1 <= 0 then 'exhausted' else status end
       where id = v_disc.grant_id;

      select credit_balance into v_bal
        from billing.user_credits where user_id = p_user_id;
      update billing.service_charges
         set balance_after = v_bal
       where service_type = p_service_type
         and service_id   = p_service_id
         and period_start = v_period;

      return 'charged-free';
    end if;

    perform billing.deduct_user_credit_atomic(p_user_id, v_amount);

    select credit_balance into v_bal
      from billing.user_credits where user_id = p_user_id;
    update billing.service_charges
       set balance_after = v_bal
     where service_type = p_service_type
       and service_id   = p_service_id
       and period_start = v_period;

  exception
    when others then
      if sqlerrm like '%Insufficient credit balance%'
         or sqlerrm like '%User credit record not found%' then

        -- The savepoint has already rolled back, so the service_charges row is
        -- gone and this INSERT runs in the outer transaction. That is what we
        -- want: no charge was made, and the hour is recorded as OWED rather
        -- than vanishing.
        --
        -- ON CONFLICT because the sweep will retry this hour on every pass for
        -- as long as the customer is short.
        insert into billing.transactions (
          user_id, amount, currency, status, type,
          service_id, service_type, period_start, period_end,
          description, metadata
        )
        values (
          p_user_id, v_amount, 'usd', 'failed', 'usage',
          p_service_id, p_service_type, v_period, v_period + interval '1 hour',
          format('Unpaid %s usage (insufficient balance)',
                 replace(p_service_type, '_', ' ')),
          jsonb_build_object(
            'reason', 'insufficient_balance',
            'hourly_rate', v_hourly,
            'pricing_id', v_price.id
          )
        )
        on conflict (service_type, service_id, period_start)
          where status = 'failed' and type = 'usage'
          do nothing;

        return 'insufficient';
      end if;
      raise;
  end;

  return 'charged';
end;
$function$;
