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
 * - is_active is DECORATIVE — true on every row including codes expired in
 *   2025. The real gate is valid_till. Never filter or badge on is_active.
 * - coupon_type 'one-time' means once PER USER, not once total;
 *   max_redemptions is a separate TOTAL cap. Show semantics, not labels.
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

/** Live/expired from valid_till and the total cap — never from is_active. */
export function promoStatus(p: Promocode): "live" | "expired" | "exhausted" {
  const redemptions = p.redeem_by?.length ?? 0;
  if (p.max_redemptions !== null && redemptions >= p.max_redemptions) {
    return "exhausted";
  }
  if (p.valid_till && Date.parse(p.valid_till) < Date.now()) return "expired";
  return "live";
}
