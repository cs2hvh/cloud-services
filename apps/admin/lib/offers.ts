/**
 * Coupons & discounts — two different instruments, deliberately kept apart
 * (billing-lane reconciliation, 2026-09-01):
 *
 * - A PROMOCODE is a credit grant: it puts money in a wallet. Legacy table
 *   billing.promocodes, redeemed via billing_redeem_promocode_atomic.
 * - A DISCOUNT changes what an hour costs: billing.discounts +
 *   discount_grants, exactly one applies per charge (best_discount), no
 *   stacking.
 *
 * Promocode data honesty, learned the hard way:
 * - is_active IS a redemption gate (the atomic function refuses inactive
 *   codes) and since 2026-09-02 the panel manages it — but on legacy rows
 *   it is stale-true (codes expired in 2025 still say active), so status
 *   is never computed from it ALONE: expiry and caps come first.
 * - coupon_type 'one-time' means once PER USER, not once total, on legacy
 *   rows; max_redemptions is the real TOTAL cap. Panel-created "one-time"
 *   codes get max_redemptions = 1 at write so the label finally means what
 *   it says. Show semantics, not labels.
 * - ~8 pre-2026 redemptions ($370) have no ledger row — the coupon
 *   transaction type didn't exist yet. "Not recorded" is the honest render.
 */

export interface Promocode {
  id: string;
  code: string;
  amount: number;
  redeem_by: Array<{ email?: string; userId?: string; redeemedAt?: string }> | null;
  valid_till: string | null;
  coupon_type: string | null;
  max_redemptions: number | null;
  is_active: boolean | null;
  created_at: string;
}

export interface Discount {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  kind: "percent" | "amount_off_hour" | "free_hours";
  value: number;
  service_type: string | null;
  plan_key: string | null;
  starts_at: string | null;
  ends_at: string | null;
  max_grants: number | null;
  priority: number;
  is_active: boolean;
  created_at: string;
}

export const DISCOUNT_KINDS = ["percent", "amount_off_hour", "free_hours"] as const;

export function discountValueLabel(kind: Discount["kind"], value: number): string {
  switch (kind) {
    case "percent":
      return `${value}% off`;
    case "amount_off_hour":
      return `$${value}/hr off`;
    case "free_hours":
      return `${value} free hours`;
  }
}

/**
 * Cap and expiry outrank is_active so a 'limited' code auto-deactivated at
 * its cap reads "exhausted" (what happened), not "suspended" (an operator
 * act) — and stale-true legacy rows stay honest.
 */
export function promoStatus(
  p: Promocode,
): "live" | "expired" | "exhausted" | "suspended" {
  const redemptions = p.redeem_by?.length ?? 0;
  if (p.max_redemptions !== null && redemptions >= p.max_redemptions) {
    return "exhausted";
  }
  if (p.valid_till && Date.parse(p.valid_till) < Date.now()) return "expired";
  if (p.is_active === false) return "suspended";
  return "live";
}
