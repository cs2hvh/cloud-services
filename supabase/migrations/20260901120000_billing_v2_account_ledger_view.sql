-- The customer's account statement: top-ups AND what they were actually charged.
--
-- THE BUG THIS FIXES
--
-- The Transactions tab reads billing.transactions. On 2026-09-01 that table
-- held 65 rows and every single one was type='topup'. billing.service_charges
-- held 86 rows of real hourly charges. charge_service_hour writes the charge
-- row and deducts the balance; it has never written a transactions row, and
-- neither has the sweep.
--
-- So a customer could watch their balance fall and find NOTHING in their
-- transaction history explaining why. Money left the account with no
-- customer-visible record. v1 wrote usage rows (199,283 of them survive in
-- billing_archive_20260831), so this is a regression introduced by the v2
-- rebuild, not a feature that never existed.
--
-- WHY A VIEW RATHER THAN WRITING LEDGER ROWS FROM charge_service_hour
--
-- Writing both would mean two records of one event that can disagree. That is
-- precisely the phantom-ledger failure already fixed once in this function:
-- an INSERT outside the savepoint left a row claiming a payment that never
-- happened. Deriving the statement from the charge table means they cannot
-- diverge, because there is only one fact.
--
-- It also keeps the hot path clean. The sweep charges every service every
-- hour; adding a second INSERT per charge doubles the write volume for a
-- number that is already recorded.
--
-- WHY USAGE IS ROLLED UP BY DAY
--
-- One row per service per HOUR is the truth, and it is unreadable. Three
-- services bill ~72 rows a day, ~2,160 a month, through a 10-per-page list.
-- v1 did exactly this and accumulated 199,283 rows nobody could read.
--
-- A customer asking "why did my balance drop $12 yesterday?" wants
-- "compute · Sep 1 · 24 hours · $0.29", not 24 rows of $0.012. The hour-level
-- record stays in billing.service_charges for support and audit, where
-- precision matters and readability does not.
--
-- Top-ups, refunds and coupons are NOT rolled up: they are discrete events a
-- customer initiated and expects to see individually, with their Stripe
-- receipt attached.

create or replace view billing.account_ledger
with (security_invoker = true)
as
-- ── Discrete money events: top-ups, refunds, coupons, setup fees ─────────
select
  t.id,
  t.stripe_session_id,
  t.stripe_invoice_id,
  t.amount,
  t.currency,
  t.status,
  t.type,
  t.balance_after,
  t.description,
  t.receipt_url,
  t.service_id,
  t.service_type,
  t.period_start,
  t.period_end,
  t.metadata,
  t.created_at,
  t.user_id
from billing.transactions t

union all

-- ── Metered usage, one row per service per day ───────────────────────────
select
  -- Deterministic id so the same day/service always renders the same row.
  -- Not a real primary key — usage rollups have no external identity, and a
  -- customer searching for a transaction id is looking for a Stripe payment.
  --
  -- md5 rather than uuid_generate_v5: uuid-ossp lives in the `extensions`
  -- schema, and a view carries no search_path, so that call would have to be
  -- schema-qualified and would break if the extension moved. md5 is built in.
  md5(c.user_id::text || ':' || c.service_type || ':' || c.day::text)::uuid
                                                 as id,
  null::text                                     as stripe_session_id,
  null::text                                     as stripe_invoice_id,
  c.amount                                       as amount,
  'usd'::text                                    as currency,
  'completed'::text                              as status,
  'usage'::text                                  as type,
  null::numeric                                  as balance_after,
  -- Human-readable and self-explaining: what, and over how long.
  initcap(replace(c.service_type, '_', ' '))
    || ' usage · ' || c.hours::text
    || case when c.hours = 1 then ' hour' else ' hours' end
                                                 as description,
  null::text                                     as receipt_url,
  -- A day's usage can span several resources of one type, so no single
  -- service_id is honest. Null rather than an arbitrary pick.
  case when c.service_count = 1 then c.only_service_id else null end
                                                 as service_id,
  c.service_type                                 as service_type,
  c.day                                          as period_start,
  c.day + interval '1 day'                       as period_end,
  jsonb_build_object(
    'rollup',        'daily',
    'hours',         c.hours,
    'resources',     c.service_count,
    'gross_usd',     c.gross,
    'discount_usd',  c.discount
  )                                              as metadata,
  -- Sort by the period, not by when the sweep happened to run. A catch-up run
  -- after downtime writes many hours at one created_at; the customer cares
  -- when the usage occurred.
  c.day                                          as created_at,
  c.user_id
from (
  select
    sc.user_id,
    sc.service_type,
    date_trunc('day', sc.period_start)      as day,
    sum(sc.amount_usd)                      as amount,
    sum(coalesce(sc.gross_usd, sc.amount_usd)) as gross,
    sum(sc.discount_usd)                    as discount,
    count(*)                                as hours,
    count(distinct sc.service_id)           as service_count,
    -- array_agg not min: Postgres has no min(uuid).
    (array_agg(sc.service_id order by sc.service_id))[1] as only_service_id
  from billing.service_charges sc
  group by sc.user_id, sc.service_type, date_trunc('day', sc.period_start)
) c;

comment on view billing.account_ledger is
  'The customer-facing account statement. Top-ups and refunds verbatim from billing.transactions; metered usage derived from billing.service_charges and rolled up per service per day. Derived, never written — the charge table is the single record of a charge.';

-- security_invoker means RLS on the underlying tables still applies, so this
-- view cannot be used to read another customer''s ledger. The API filters by
-- user_id as well; both, not either.
grant select on billing.account_ledger to service_role, authenticated;
