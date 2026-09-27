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

// Second switch, for the crypto deposit path only (ZX Gateway). OFF by
// default since 2026-09-27: Stripe is the one payment method at launch, so
// the billing page offers only Stripe, the page does not ask the gateway for
// its currency list, and the deposit server action refuses to create a
// payment. Turn it on with NEXT_PUBLIC_BILLING_CRYPTO=on and a rebuild.
//
// The gateway callback (/api/billing/crypto-callback) is NOT gated: a deposit
// created while crypto was on must still credit the wallet when it settles.
export const BILLING_CRYPTO_ENABLED =
  BILLING_TOPUP_ENABLED &&
  (process.env.NEXT_PUBLIC_BILLING_CRYPTO ?? "").trim().toLowerCase() === "on";

export const CRYPTO_DISABLED_MESSAGE =
  "Crypto deposits are not available right now. Please add balance with a card.";
