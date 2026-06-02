-- H4 (HIGH) — extend billing.transactions.service_type allowlist to every billable
-- service type.
--
-- 20260610000002 set the CHECK to only 6 types
-- (database/kubernetes/objectspace/spectrum/platform_apps/domain), but the app and
-- the hourly cron write 'setup'/'usage' ledger rows with service_type gpu_pod,
-- compute, custom_image, inference_finetune, inference_serving, inference_deployment
-- and inference_vector. Each such INSERT hit a 23514 CHECK violation, which
-- save_transaction() treats as "ledger migration not applied" and SWALLOWS — but only
-- AFTER Billing.deduct already moved the money. Net effect: every GPU / inference /
-- compute charge debited the customer's balance with NO transactions row, and one
-- failure latched the whole Node process to "legacy" mode for 60s
-- (markServiceLedgerLegacy), suppressing ledger rows for other valid charges as well.
-- The running balance stayed correct, but the customer-facing ledger silently
-- under-reported real charges (dispute / chargeback exposure).
--
-- Extending the allowlist makes these inserts succeed, so the swallow/latch path is
-- never reached. Keep it in lockstep with BillableServiceType in
-- lib/supabase/queries/billing.ts.

ALTER TABLE billing.transactions
  DROP CONSTRAINT IF EXISTS transactions_service_type_check;

ALTER TABLE billing.transactions
  ADD CONSTRAINT transactions_service_type_check CHECK (
    service_type IS NULL
    OR service_type IN (
      'database',
      'kubernetes',
      'objectspace',
      'spectrum',
      'platform_apps',
      'domain',
      'gpu_pod',
      'compute',
      'custom_image',
      'inference_finetune',
      'inference_serving',
      'inference_deployment',
      'inference_vector'
    )
  );
