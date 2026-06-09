// Master kill-switch for customer balance top-ups (Stripe + crypto + recurring).
//
// While this is FALSE:
//   - the add-balance UI on the billing page is disabled, and
//   - the server endpoints (Stripe checkout, recurring checkout, crypto deposit)
//     reject any top-up attempt — so a direct API call can't add balance either.
//
// Flip back to `true` once the billing credit paths are hardened.
export const BILLING_TOPUP_ENABLED = false;

export const TOPUP_DISABLED_MESSAGE =
  "Adding balance is temporarily unavailable while we upgrade our billing system.";
