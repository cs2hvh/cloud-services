-- The ledger row must carry the exact amount the wallet moved.
--
-- billing.transactions.amount was numeric(10,2) and balance_after
-- numeric(18,2), while billing.user_credits.credit_balance is numeric(20,6)
-- and move_credit debits the exact figure. So an hourly PaaS charge metered
-- at 0.009589 moved 0.009589 from the wallet and was RECORDED as 0.01; the
-- basic tier's 0.016438 was recorded as 0.02. Statements overstated by up
-- to 9% per day (144 rows: 1.5452 moved, 1.68 shown), and balance_after
-- disagreed with the wallet by up to a cent on every row. Found 2026-09-27
-- while reconciling the books. No money was mis-moved.
--
-- account_ledger depends on the column, so it is dropped and recreated
-- unchanged (definition as of 20260901120000 + 20260903 rollup), with the
-- same grants.

begin;

drop view billing.account_ledger;

alter table billing.transactions alter column amount type numeric(18,6);
alter table billing.transactions alter column balance_after type numeric(18,6);

comment on column billing.transactions.amount is
  'Exact amount moved, USD, six decimals. Was numeric(10,2) until 2026-09-27: hourly PaaS rows metered at 0.009589 were recorded as 0.01, so statements overstated by up to 9%/day while the wallet moved the exact figure.';

create view billing.account_ledger as
 SELECT t.id, t.stripe_session_id, t.stripe_invoice_id, t.amount, t.currency, t.status, t.type, t.balance_after, t.description, t.receipt_url,
        t.service_id, t.service_type, t.period_start, t.period_end, t.metadata, t.created_at, t.user_id
   FROM billing.transactions t
UNION ALL
 SELECT md5((((c.user_id::text || ':'::text) || c.service_type) || ':'::text) || c.day::text)::uuid AS id,
        NULL::text AS stripe_session_id, NULL::text AS stripe_invoice_id, c.amount, 'usd'::text AS currency, 'completed'::text AS status, 'usage'::text AS type,
        c.balance_after,
        ((initcap(replace(c.service_type, '_'::text, ' '::text)) || ' usage · '::text) || c.hours::text) || CASE WHEN c.hours = 1 THEN ' hour'::text ELSE ' hours'::text END AS description,
        NULL::text AS receipt_url,
        CASE WHEN c.service_count = 1 THEN c.only_service_id ELSE NULL::uuid END AS service_id,
        c.service_type, c.day AS period_start, c.day + '1 day'::interval AS period_end,
        jsonb_build_object('rollup', 'daily', 'hours', c.hours, 'resources', c.service_count, 'gross_usd', c.gross, 'discount_usd', c.discount) AS metadata,
        c.day AS created_at, c.user_id
   FROM ( SELECT sc.user_id, sc.service_type, date_trunc('day'::text, sc.period_start) AS day,
                 sum(sc.amount_usd) AS amount, sum(COALESCE(sc.gross_usd, sc.amount_usd)) AS gross, sum(sc.discount_usd) AS discount,
                 count(*) AS hours, count(DISTINCT sc.service_id) AS service_count,
                 (array_agg(sc.service_id ORDER BY sc.service_id))[1] AS only_service_id,
                 (array_agg(sc.balance_after ORDER BY sc.period_start DESC NULLS LAST))[1] AS balance_after
            FROM billing.service_charges sc
           GROUP BY sc.user_id, sc.service_type, (date_trunc('day'::text, sc.period_start))) c;

grant select, update on billing.account_ledger to service_role;
grant select on billing.account_ledger to authenticated;

commit;
