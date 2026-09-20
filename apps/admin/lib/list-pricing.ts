/**
 * The four layers of a model's price, and the one rule that binds two of them.
 *
 *   provider_pricing  what the partner actually charges us   ADMIN ONLY
 *   list_pricing      the public reference price (OpenRouter)
 *   discount_pct      how far under list we undercut
 *   pricing           what the customer is charged
 *
 * INVARIANT, maintained by the panel and by nothing else:
 *
 *   pricing = list_pricing x (1 - discount_pct / 100)
 *
 * It holds only for models that HAVE a list price. A model with no
 * list_pricing is hand-priced and stays that way; deriving a price from a
 * list price that does not exist would silently zero it.
 *
 * The invariant is enforced on write rather than computed on read, because
 * the gateway bills from `pricing` and never sees this file. A value that
 * only becomes correct when the panel renders it is not a price, it is a
 * rumour. Anything already in the table that violates the rule is reported
 * as drift rather than quietly corrected — a stale row is a fact about what
 * customers were charged, and overwriting it hides that.
 */

/** The customer-facing keys a list price can drive. Cache-write is not sold. */
export const DERIVED_PRICE_KEYS = [
  "input_cents_per_mtok",
  "output_cents_per_mtok",
  "cached_cents_per_mtok",
] as const;

export type PriceBlob = Record<string, unknown> | null | undefined;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Cents per million tokens, to four decimals. Fractional cents are real
 * (0.56 c/Mtok is a rate we actually pay), so this rounds off float dust
 * without rounding off the price.
 */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** True when this model's sell price is derived rather than hand-set. */
export function isListPriced(listPricing: PriceBlob): boolean {
  if (!listPricing) return false;
  return DERIVED_PRICE_KEYS.some((k) => num(listPricing[k]) !== null);
}

/**
 * Apply the invariant: sell price from list price and discount.
 *
 * Only keys the list price actually names are touched. A model priced per
 * image keeps its per-image key untouched, because OpenRouter has no opinion
 * about it and a missing list key is not a list price of zero.
 */
export function deriveSellPricing(
  listPricing: PriceBlob,
  discountPct: number,
  existingPricing: PriceBlob,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existingPricing ?? {}) };
  if (!listPricing) return next;
  const factor = 1 - discountPct / 100;
  for (const key of DERIVED_PRICE_KEYS) {
    const list = num(listPricing[key]);
    if (list === null) continue;
    next[key] = round4(list * factor);
  }
  return next;
}

export type DriftKey = {
  key: string;
  charged: number;
  expected: number;
};

/**
 * Where a stored sell price disagrees with list x (1 - discount).
 *
 * Reported, never auto-corrected. Drift means one of three things and the
 * panel cannot tell which: the list price moved, someone hand-edited the
 * sell price, or a write happened outside the panel. All three are worth a
 * human looking, and none is worth silently rewriting what customers pay.
 */
export function pricingDrift(
  pricing: PriceBlob,
  listPricing: PriceBlob,
  discountPct: number,
): DriftKey[] {
  if (!isListPriced(listPricing)) return [];
  const out: DriftKey[] = [];
  const factor = 1 - discountPct / 100;
  for (const key of DERIVED_PRICE_KEYS) {
    const list = num(listPricing?.[key]);
    const charged = num(pricing?.[key]);
    if (list === null || charged === null) continue;
    const expected = round4(list * factor);
    // A hundredth of a cent per Mtok is float noise, not a pricing error.
    if (Math.abs(charged - expected) > 0.01) {
      out.push({ key, charged, expected });
    }
  }
  return out;
}

/**
 * The discount a stored sell price implies, for a model that has a list
 * price but whose discount_pct was never set. Used to show what the current
 * price actually amounts to, not to write anything.
 */
export function impliedDiscountPct(
  pricing: PriceBlob,
  listPricing: PriceBlob,
): number | null {
  const list = num(listPricing?.input_cents_per_mtok);
  const charged = num(pricing?.input_cents_per_mtok);
  if (list === null || charged === null || list <= 0) return null;
  return round4((1 - charged / list) * 100);
}

/**
 * OpenRouter quotes USD per token as a decimal string. We store cents per
 * million tokens. The conversion is x1e6 for the million and x100 for cents,
 * and it is done in one place because doing it in two is how a price ends up
 * off by a factor of a hundred.
 */
export function usdPerTokenToCentsPerMtok(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return round4(n * 1_000_000 * 100);
}
