-- Money and its ledger row now commit together, or neither does.
--
-- THE DEFECT
--
-- Twenty-one call sites moved a balance and then wrote billing.transactions as
-- a separate, optional step. Two shapes, both discarding the failure:
--
--   Billing.save_transaction({...}).catch(e => console.warn("failed:", e));
--
--   try { await Billing.save_transaction({...}); }
--   catch { console.error("Failed to save ... transaction:"); }
--
-- The money has already moved by the time either runs. There is no retry, no
-- queue, no reconciliation — a failed write is simply lost, and the balance
-- keeps the change. At least seventeen of the twenty-one behaved this way:
-- domain purchases, refunds and renewals; game provisioning and renewals;
-- platform-app bandwidth; inference deployments and fine-tunes; kubernetes;
-- coupons.
--
-- It is not hypothetical. The 2026-08 audit found $110 of coupon credit with no
-- ledger row, and on 2026-09-02 a failed provision deducted $0.0075 leaving no
-- meter, no charge row and no transaction.
--
-- The intent was defensible — don't fail a customer's purchase because logging
-- failed — but the ledger is not logging. It IS the record of the transaction.
-- A balance that changes with nothing explaining why makes a billing dispute
-- unanswerable: the balance is authoritative and the history is best-effort.
--
-- THE FIX
--
-- billing.charge_service_hour already had this right — it claims the hour by
-- INSERT and deducts inside one transaction, so money cannot move without a
-- row. This gives every other money movement the same property.
--
-- A PL/pgSQL function body is one transaction. If the INSERT violates a
-- constraint, the balance UPDATE rolls back with it. The failure becomes loud
-- and total instead of silent and partial.

create or replace function billing.move_credit(
  p_user_id               uuid,
  p_amount                numeric,                    -- always positive
  p_direction             text,                       -- 'debit' | 'credit'
  p_type                  text,
  p_status                text        default 'completed',
  p_description           text        default null,
  p_currency              text        default 'usd',
  p_service_id            uuid        default null,
  p_service_type          text        default null,
  p_period_start          timestamptz default null,
  p_period_end            timestamptz default null,
  p_stripe_session_id     text        default null,
  p_stripe_payment_intent text        default null,
  p_stripe_invoice_id     text        default null,
  p_receipt_url           text        default null,
  p_metadata              jsonb       default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'billing', 'public', 'extensions'
as $function$
declare
  v_balance numeric;
  v_txn_id  uuid;
begin
  -- The amount is always positive; `type` and `direction` carry the sense.
  -- transactions_amount_positive enforces the same rule on the row, and a
  -- negative amount here would otherwise become a silent inverse movement.
  if p_amount is null or p_amount <= 0 or p_amount::text = 'NaN' then
    raise exception 'move_credit: amount must be > 0, got %', p_amount;
  end if;

  if p_direction not in ('debit', 'credit') then
    raise exception 'move_credit: direction must be debit or credit, got %', p_direction;
  end if;

  if p_user_id is null then
    raise exception 'move_credit: user_id is required';
  end if;

  -- Lock the balance row for the whole movement. Two concurrent debits against
  -- the same wallet must not both read the pre-debit balance and both pass the
  -- sufficiency check.
  select credit_balance into v_balance
    from billing.user_credits
   where user_id = p_user_id
     for update;

  if p_direction = 'debit' then
    if not found then
      raise exception 'move_credit: no credit record for user %', p_user_id;
    end if;
    if v_balance < p_amount then
      raise exception 'Insufficient credit balance';
    end if;
    update billing.user_credits
       set credit_balance = credit_balance - p_amount
     where user_id = p_user_id
     returning credit_balance into v_balance;
  else
    if not found then
      -- First credit for this user. The unique_violation arm covers a
      -- concurrent insert that beat us between the SELECT and here.
      begin
        insert into billing.user_credits (user_id, credit_balance)
        values (p_user_id, p_amount)
        returning credit_balance into v_balance;
      exception when unique_violation then
        update billing.user_credits
           set credit_balance = credit_balance + p_amount
         where user_id = p_user_id
         returning credit_balance into v_balance;
      end;
    else
      update billing.user_credits
         set credit_balance = credit_balance + p_amount
       where user_id = p_user_id
       returning credit_balance into v_balance;
    end if;
  end if;

  -- Same transaction as the movement above. A constraint violation here — an
  -- unknown type, an unknown service_type — rolls the balance change back
  -- rather than leaving it unexplained.
  insert into billing.transactions (
    user_id, amount, currency, status, type, balance_after, description,
    service_id, service_type, period_start, period_end,
    stripe_session_id, stripe_payment_intent, stripe_invoice_id, receipt_url,
    metadata, completed_at
  )
  values (
    p_user_id, p_amount, coalesce(p_currency, 'usd'), p_status, p_type,
    v_balance, p_description,
    p_service_id, p_service_type, p_period_start, p_period_end,
    p_stripe_session_id, p_stripe_payment_intent, p_stripe_invoice_id,
    p_receipt_url, coalesce(p_metadata, '{}'::jsonb),
    case when p_status = 'completed' then now() else null end
  )
  returning id into v_txn_id;

  return jsonb_build_object(
    'balance', v_balance,
    'transactionId', v_txn_id
  );
end;
$function$;

comment on function billing.move_credit is
  'Moves a wallet balance and writes its billing.transactions row in ONE transaction. '
  'Use instead of deduct/topup followed by save_transaction: those could leave a '
  'balance changed with no record, which is what made a billing dispute unanswerable.';

revoke all on function billing.move_credit(
  uuid, numeric, text, text, text, text, text, uuid, text, timestamptz,
  timestamptz, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function billing.move_credit(
  uuid, numeric, text, text, text, text, text, uuid, text, timestamptz,
  timestamptz, text, text, text, text, jsonb
) to service_role;
