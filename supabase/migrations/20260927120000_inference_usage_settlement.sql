-- Inference usage is settled against the payer's wallet.
--
-- APPLIED BY HAND on 2026-09-27 through the Supabase SQL editor (the session's
-- tooling could not apply it), then settled once with
-- `select * from billing.settle_inference_usage(true);` at 08:18 UTC. This
-- file records exactly what is live.
--
-- Until then inference.usage rows were priced (cost_cents) and shown on the
-- usage page, but nothing ever debited them from a balance: the hourly sweep
-- settled compute and PaaS meters only. Every org's inference spend was free,
-- and one customer had used $5.6k against a $5k balance that still read $5k.
--
-- This migration:
--   0. lets billing.transactions carry service_type 'inference' (the first
--      settlement attempt failed on transactions_service_type_check);
--   1. marks usage rows as settled (inference.usage.settled_at) so a row is
--      charged exactly once;
--   2. adds billing.settle_inference_usage(), which the hourly sweep calls
--      (scripts/billing/sweep.ts settleInference): per org it sums unsettled
--      successful usage, debits the payer through billing.move_credit (one
--      ledger row per org per run, visible in the transactions tab), records
--      any shortfall as a failed 'usage' row the way charge_service_hour
--      records unpaid hours, and stamps the rows;
--   3. makes inference.lookup_api_key return the payer's balance so the
--      gateway can refuse with 402 once the balance is exhausted. The gateway
--      ships that check behind BALANCE_ENFORCEMENT, off until switched on.

-- 0. The ledger accepts 'inference' ----------------------------------------

alter table billing.transactions drop constraint transactions_service_type_check;
alter table billing.transactions add constraint transactions_service_type_check
  check (service_type is null or service_type = any (array[
    'database','kubernetes','objectspace','spectrum','platform_apps','domain',
    'gpu_pod','compute','custom_image','inference_finetune','inference_serving',
    'inference_deployment','inference_vector','game_server','gpu_volume',
    'gpu_pod_storage','inference']));

-- 1. Settlement stamp ------------------------------------------------------

alter table inference.usage add column if not exists settled_at timestamptz;

comment on column inference.usage.settled_at is
  'When billing.settle_inference_usage debited this row from the payer''s balance '
  '(or recorded it as unpaid). NULL = not settled yet.';

create index if not exists idx_usage_unsettled
  on inference.usage (org_id, created_at)
  where settled_at is null and status = 'success' and cost_cents > 0;

-- 2. Settlement --------------------------------------------------------------
--
-- p_apply = false (the default, like the sweep's dry run) reports what would
-- happen and moves nothing. p_until bounds the rows considered so a run does
-- not chase rows still arriving from the usage queue; late rows are picked up
-- by the next run because the stamp, not the time, decides what is open.
--
-- Payer = the org's billing user, else its owner. The debit is capped at the
-- balance, so a wallet never goes below zero here (move_credit refuses that),
-- and whatever could not be taken is recorded as a failed 'usage' transaction
-- ("Unpaid inference usage") that the transactions tab shows and that a later
-- top-up does not retroactively collect. The gateway's 402 is what stops an
-- exhausted account from running further.

create or replace function billing.settle_inference_usage(
  p_apply  boolean     default false,
  p_until  timestamptz default date_trunc('hour', now()),
  p_org_id uuid        default null
)
returns table (
  org_id uuid, payer_user_id uuid, requests bigint, due_usd numeric,
  charged_usd numeric, unpaid_usd numeric, balance_after numeric, outcome text
)
language plpgsql security definer
set search_path = billing, inference, public, extensions
as $$
declare
  r record; v_bal numeric; v_charge numeric; v_unpaid numeric;
  v_res jsonb; v_desc text; v_meta jsonb;
begin
  for r in
    select u.org_id, coalesce(o.billing_user_id, o.owner_user_id) as payer,
           count(*) as requests, sum(u.cost_cents) as cents,
           sum(u.input_tokens) as input_tokens, sum(u.output_tokens) as output_tokens,
           min(u.created_at) as from_at, max(u.created_at) as to_at,
           array_agg(u.id) as ids
      from inference.usage u
      join inference.orgs o on o.id = u.org_id
     where u.settled_at is null and u.status = 'success' and u.cost_cents > 0
       and u.created_at < p_until
       and (p_org_id is null or u.org_id = p_org_id)
     group by u.org_id, o.billing_user_id, o.owner_user_id
     order by sum(u.cost_cents) desc
  loop
    org_id := r.org_id; payer_user_id := r.payer; requests := r.requests;
    due_usd := round(r.cents / 100.0, 6);
    charged_usd := 0; unpaid_usd := 0; balance_after := null;

    if r.payer is null then
      outcome := 'no-payer'; return next; continue;
    end if;

    if not p_apply then
      select uc.credit_balance into v_bal from billing.user_credits uc where uc.user_id = r.payer;
      balance_after := v_bal;
      outcome := case when coalesce(v_bal, 0) >= due_usd then 'would-charge'
                      when coalesce(v_bal, 0) > 0 then 'would-charge-partial'
                      else 'would-record-unpaid' end;
      return next; continue;
    end if;

    perform pg_advisory_xact_lock(hashtext('settle_inference_usage'), hashtext(r.org_id::text));

    select uc.credit_balance into v_bal from billing.user_credits uc
     where uc.user_id = r.payer for update;
    v_bal := coalesce(v_bal, 0);
    v_charge := least(due_usd, greatest(v_bal, 0));
    v_unpaid := due_usd - v_charge;

    v_desc := format('Inference usage · %s request%s', r.requests,
                     case when r.requests = 1 then '' else 's' end);
    v_meta := jsonb_build_object('source', 'inference_usage', 'org_id', r.org_id,
      'requests', r.requests, 'input_tokens', r.input_tokens,
      'output_tokens', r.output_tokens, 'due_usd', due_usd, 'settled_until', p_until);

    if v_charge > 0 then
      v_res := billing.move_credit(r.payer, v_charge, 'debit', 'usage', 'completed',
        v_desc, 'usd', r.org_id, 'inference', r.from_at, r.to_at,
        null, null, null, null, v_meta || jsonb_build_object('unpaid_usd', v_unpaid));
      balance_after := (v_res ->> 'balance')::numeric;
    else
      balance_after := v_bal;
    end if;

    if v_unpaid > 0 then
      insert into billing.transactions as t (
        user_id, amount, currency, status, type, service_id, service_type,
        period_start, period_end, description, metadata)
      values (r.payer, v_unpaid, 'usd', 'failed', 'usage', r.org_id, 'inference',
        p_until, now(), 'Unpaid inference usage (insufficient balance)',
        v_meta || jsonb_build_object('reason', 'insufficient_balance', 'charged_usd', v_charge))
      on conflict (service_type, service_id, period_start)
        where status = 'failed' and type = 'usage'
        do update set
          amount = t.amount + excluded.amount,
          metadata = t.metadata || jsonb_build_object(
            'requests', coalesce((t.metadata ->> 'requests')::bigint, 0)
                        + coalesce((excluded.metadata ->> 'requests')::bigint, 0),
            'due_usd', coalesce((t.metadata ->> 'due_usd')::numeric, 0)
                       + coalesce((excluded.metadata ->> 'due_usd')::numeric, 0),
            'merged_runs', coalesce((t.metadata ->> 'merged_runs')::int, 1) + 1);
    end if;

    update inference.usage u set settled_at = now()
     where u.id = any (r.ids) and u.settled_at is null;

    charged_usd := v_charge; unpaid_usd := v_unpaid;
    outcome := case when v_unpaid = 0 then 'charged'
                    when v_charge > 0 then 'charged-partial' else 'unpaid' end;
    return next;
  end loop;
end;
$$;

revoke all on function billing.settle_inference_usage(boolean, timestamptz, uuid) from public, anon, authenticated;
grant execute on function billing.settle_inference_usage(boolean, timestamptz, uuid) to service_role;

-- 3. The gateway learns the payer's balance ---------------------------------

drop function if exists inference.lookup_api_key(text);
create function inference.lookup_api_key(p_hash text)
returns table (
  key_id uuid, org_id uuid, agent_id uuid, key_tier text, allowed_origins text[],
  allowed_models text[], allowed_ip_cidrs cidr[], zdr_enabled boolean,
  monthly_budget_cents bigint, hard_cap_cents bigint, org_monthly_budget_cents bigint,
  org_hard_cap_cents bigint, semantic_cache_enabled boolean,
  org_semantic_cache_threshold numeric, rate_limit_rpm integer,
  is_internal_service boolean, expires_at timestamptz, payer_balance_cents bigint
)
language sql stable
as $$
  select k.id, k.org_id, k.agent_id, k.key_tier, k.allowed_origins,
         k.allowed_models, k.allowed_ip_cidrs, k.zdr_enabled,
         k.monthly_budget_cents, k.hard_cap_cents,
         o.monthly_budget_cents, o.hard_cap_cents,
         k.semantic_cache_enabled, o.semantic_cache_threshold,
         k.rate_limit_rpm, k.is_internal_service, k.expires_at,
         (select floor(uc.credit_balance * 100)::bigint from billing.user_credits uc
           where uc.user_id = coalesce(o.billing_user_id, o.owner_user_id))
    from inference.api_keys k
    join inference.orgs o on o.id = k.org_id
   where k.key_hash = p_hash and k.revoked_at is null
     and (k.expires_at is null or k.expires_at > now());
$$;

revoke all on function inference.lookup_api_key(text) from public, anon, authenticated;
grant execute on function inference.lookup_api_key(text) to service_role;
