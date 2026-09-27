/**
 * Inference usage settles to wallets every hour. Three states, and they are
 * NOT interchangeable:
 *
 *   COLLECTED  billing.transactions, service_type 'inference', type 'usage',
 *              status 'completed'. Money that left a wallet. This is revenue.
 *   UNPAID     same, status 'failed'. The sweep caps a debit at the balance
 *              and never takes a wallet negative, so a shortfall is recorded
 *              as owed, not collected. This is a debt, not revenue.
 *   ACCRUED    inference.usage rows with settled_at IS NULL. Served, priced,
 *              not yet swept. At most an hour old, give or take a run.
 *
 * The trap is settled_at. The sweep stamps it on every row it processes,
 * INCLUDING the ones it could not collect - so "usage rows with settled_at
 * set" equals collected PLUS unpaid. On 2026-09-27 that was $11,078.38
 * against $10,384.60 actually collected: reading settled rows as revenue
 * would have booked $693.78 that nobody paid. It reconciles to the cent,
 * which is how we know the sweep is consistent - and why revenue is read
 * from the ledger, never from settled_at.
 */
export const INFERENCE_SERVICE_TYPE = "inference";

/** A wallet can be served while empty; say what the receipts prove. */
export const ENFORCEMENT_NOTE =
  "Balance enforcement is a worker setting (BALANCE_ENFORCEMENT in workers/inference/wrangler.toml), not stored in the database, so the panel cannot read it. What it can see: unpaid inference is still being recorded, which only happens when an empty wallet is served.";
