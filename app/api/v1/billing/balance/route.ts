import { withV1Auth, v1Ok, v1Error } from "@/lib/api/v1-middleware";
import { Billing } from "@/lib/supabase/queries/billing";

/**
 * GET /api/v1/billing/balance
 *
 * Returns the current credit balance for the authenticated user.
 * Supports both session auth (browser) and PAT (API tokens).
 *
 * Response:
 *   { data: { credit_balance: number, promo_credits: number, topup_credits: number } }
 */
export const GET = withV1Auth("billing:balance:read", async (_req, auth) => {
  try {
    const credits = await Billing.get_user_credits(auth.userId);
    return v1Ok({ data: credits });
  } catch (err) {
    console.error("[v1/billing/balance]", err);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch credit balance");
  }
});
