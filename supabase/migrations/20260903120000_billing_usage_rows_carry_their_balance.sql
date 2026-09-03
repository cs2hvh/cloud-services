-- Usage rows now carry the balance they left behind.
--
-- The billing page renders "bal $X" under every amount where balance_after is
-- present. Top-ups, coupons and refunds have it because save_transaction (now
-- move_credit) records it. Usage rows did not: billing.account_ledger hardcoded
--
--     NULL::numeric AS balance_after
--
-- for the whole usage half of the union, because service_charges never stored
-- one. So the rows a customer most wants explained — the hourly charges that
-- quietly drain a wallet — were the only ones showing no running balance.
--
-- WHY RECORD IT RATHER THAN DERIVE IT
--
-- A running balance could be computed backwards from the current balance with a
-- window function, and that was tempting because it would fix history too. It
-- would also be a lie. Ledger completeness is exactly what was broken until
-- today — the 2026-08 audit found $110 of coupon credit with no row at all, and
-- a derived balance silently absorbs every missing row into a wrong number.
-- Recording the real balance at charge time cannot drift, and rows from before
-- this migration keep a NULL that the UI already handles by showing nothing.
-- An honest gap beats a confident fabrication.
--
-- The capture sits inside charge_service_hour's existing transaction, after the
-- deduction it describes, so the number is the balance that deduction produced.

alter table billing.service_charges
  add column if not exists balance_after numeric(18,6);

comment on column billing.service_charges.balance_after is
  'Wallet balance immediately after this hour was charged, captured inside the '
  'same transaction as the deduction. NULL for rows charged before 2026-09-03, '
  'where it was never recorded — the UI shows nothing rather than guessing.';

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

  -- Discount, if this customer holds one that covers this service and hour.
  select * into v_disc
    from billing.best_discount(p_user_id, p_service_type, p_plan_key, v_period);

  if v_disc.grant_id is not null then
    v_disc_id := v_disc.discount_id;

    if v_disc.kind = 'percent' then
      v_disc_amt := round(v_gross * (v_disc.value / 100.0), 6);
    elsif v_disc.kind = 'amount_off_hour' then
      -- Never more than the hour is worth: an "amount off" larger than the
      -- charge is a discount to zero, not a payment to the customer.
      v_disc_amt := least(round(v_disc.value, 6), v_gross);
    elsif v_disc.kind = 'free_hours' then
      v_disc_amt  := v_gross;
      v_used_free := true;
    end if;

    v_amount := greatest(round(v_gross - v_disc_amt, 6), 0);
  end if;

  if v_amount <= 0 and not v_used_free then
    -- Genuinely nothing to bill (an empty per-GB resource, or a 100% discount
    -- on a zero-value hour). Nothing to record.
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

    -- Only now, with the hour definitively claimed, spend the allowance.
    if v_used_free then
      update billing.discount_grants
         set hours_remaining = hours_remaining - 1,
             status = case when hours_remaining - 1 <= 0 then 'exhausted' else status end
       where id = v_disc.grant_id;

      -- No money moved, but the balance is still worth recording: the customer
      -- sees a covered hour alongside what their balance was at the time.
      select credit_balance into v_bal
        from billing.user_credits where user_id = p_user_id;
      update billing.service_charges
         set balance_after = v_bal
       where service_type = p_service_type
         and service_id   = p_service_id
         and period_start = v_period;

      -- Fully covered: no money moves, but the ledger row stays so the customer
      -- can see the hour was used and what it would have cost.
      return 'charged-free';
    end if;

    perform billing.deduct_user_credit_atomic(p_user_id, v_amount);

    -- The balance this deduction produced, read inside the same transaction
    -- that produced it. This is what the billing page renders under the amount.
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
        return 'insufficient';
      end if;
      raise;
  end;

  return 'charged';
end;
$function$;

-- The daily rollup reports the balance left by the LAST charge of that day,
-- which is what "your balance after this day's usage" means. NULL when that
-- charge predates the column, which the UI already renders as nothing.
create or replace view billing.account_ledger as
  select t.id, t.stripe_session_id, t.stripe_invoice_id, t.amount, t.currency,
         t.status, t.type, t.balance_after, t.description, t.receipt_url,
         t.service_id, t.service_type, t.period_start, t.period_end,
         t.metadata, t.created_at, t.user_id
    from billing.transactions t
  union all
  select md5(c.user_id::text || ':' || c.service_type || ':' || c.day::text)::uuid as id,
         null::text as stripe_session_id,
         null::text as stripe_invoice_id,
         c.amount,
         'usd'::text as currency,
         'completed'::text as status,
         'usage'::text as type,
         c.balance_after,
         initcap(replace(c.service_type, '_', ' ')) || ' usage · ' || c.hours::text ||
           case when c.hours = 1 then ' hour' else ' hours' end as description,
         null::text as receipt_url,
         case when c.service_count = 1 then c.only_service_id else null::uuid end as service_id,
         c.service_type,
         c.day as period_start,
         c.day + interval '1 day' as period_end,
         jsonb_build_object('rollup', 'daily', 'hours', c.hours,
                            'resources', c.service_count, 'gross_usd', c.gross,
                            'discount_usd', c.discount) as metadata,
         c.day as created_at,
         c.user_id
    from (
      select sc.user_id,
             sc.service_type,
             date_trunc('day', sc.period_start) as day,
             sum(sc.amount_usd) as amount,
             sum(coalesce(sc.gross_usd, sc.amount_usd)) as gross,
             sum(sc.discount_usd) as discount,
             count(*) as hours,
             count(distinct sc.service_id) as service_count,
             (array_agg(sc.service_id order by sc.service_id))[1] as only_service_id,
             -- Last charge of the day wins. NULLS LAST keeps an older
             -- unrecorded row from masking a real balance recorded later.
             (array_agg(sc.balance_after order by sc.period_start desc nulls last))[1]
               as balance_after
        from billing.service_charges sc
       group by sc.user_id, sc.service_type, date_trunc('day', sc.period_start)
    ) c;
