-- Write the ledger rows the PaaS should have written since 2026-08-28.
--
-- Every row in paas.project_charges was a completed wallet debit (see
-- 20260903191000). The balances already reflect them; the ledger does not.
-- This inserts one completed 'usage' transaction per historical charge so a
-- customer's billing page explains the money that left. balance_after is left
-- NULL — the balance at the time was not recorded, and deriving it backwards
-- would absorb every other missing row into a wrong number. An honest gap
-- beats a confident fabrication.
--
-- Idempotent: rows are tagged in metadata and skipped on re-run.

insert into billing.transactions (
  user_id, amount, currency, status, type, description,
  service_id, service_type, period_start, period_end, metadata, completed_at, created_at
)
select
  pc.user_id,
  pc.amount_usd,
  'usd',
  'completed',
  'usage',
  format('Deploy usage: %s tier, %s instance(s)', pc.tier, pc.instances),
  pc.project_id,
  'platform_apps',
  pc.period_start,
  pc.period_start + interval '1 hour',
  jsonb_build_object('spine', 'paas', 'tier', pc.tier, 'instances', pc.instances,
                     'backfilled', true, 'backfilled_at', now()),
  pc.created_at,
  pc.created_at
from paas.project_charges pc
where pc.amount_usd > 0
  and not exists (
    select 1 from billing.transactions t
     where t.type = 'usage' and t.status = 'completed'
       and t.service_type = 'platform_apps'
       and t.service_id = pc.project_id
       and t.period_start = pc.period_start
  );
