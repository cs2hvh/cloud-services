// Master switch for customer balance top-ups (Stripe checkout, recurring
// checkout, and the add-balance UI).
//
// While OFF:
//   - the add-balance UI on the billing page is disabled, and
//   - the server endpoints (Stripe checkout, recurring checkout) reject any
//     top-up attempt — so a direct API call can't add balance either.
//
// It was a hard-coded `false` from 2026-08 while the credit paths were
// hardened (idempotent webhook claims, atomic credit, ledger rows). Since
// 2026-09-26 it is read from the environment, so each deployment decides:
// production stays OFF until it holds LIVE Stripe keys, a registered
// webhook for its own hostname, and an activated Stripe account, and turns
// ON by setting NEXT_PUBLIC_BILLING_TOPUPS=on and rebuilding (the value is
// inlined into the client bundle at build time, like every NEXT_PUBLIC_ var).
export const BILLING_TOPUP_ENABLED =
  (process.env.NEXT_PUBLIC_BILLING_TOPUPS ?? "").trim().toLowerCase() === "on";

export const TOPUP_DISABLED_MESSAGE =
  "Adding balance is temporarily unavailable while we upgrade our billing system.";
