/**
 * Two pricing shapes live in inference.models.pricing, and conflating them
 * produces confident nonsense.
 *
 *   TOKEN models  { input_cents_per_mtok, output_cents_per_mtok, cached_… }
 *   MEDIA models  { cents_per_image | cents_per_media_second, tiers: { … } }
 *
 * Media rows carry no per-Mtok keys at all, so the token margin math returns
 * blanks for them — and a blank margin on a model that is in fact earning
 * 93% reads as "we don't know" when we do. Margin for media is computed per
 * unit, per tier: (price − upstream) / price.
 *
 * `tiers` OVERRIDES the flat number for the sizes it names; the flat value is
 * the default for anything not listed. Upstream mirrors the same shape and
 * may be fractional cents (0.56), so nothing here rounds to integers.
 */

export const TOKEN_KEYS = [
  "input_cents_per_mtok",
  "output_cents_per_mtok",
  "cached_cents_per_mtok",
] as const;

export type PricingJson = Record<string, unknown> | null;

export type Tier = {
  tier: string;
  priceCents: number;
  costCents: number | null;
  marginPct: number | null;
};

export type UnitPricing = {
  /** "image" or "second" — what one unit of this model is. */
  unit: string;
  /** The flat default, applied to any tier not named. */
  flat: Tier | null;
  tiers: Tier[];
};

/** Which key holds the flat per-unit price for this modality. */
export function unitPriceKey(modality: string): string | null {
  if (modality === "image") return "cents_per_image";
  if (modality === "video") return "cents_per_media_second";
  return null;
}

export function unitNoun(modality: string): string {
  if (modality === "image") return "image";
  if (modality === "video") return "second";
  return "unit";
}

/** True when this model is priced per unit rather than per token. */
export function isUnitPriced(modality: string, pricing: PricingJson): boolean {
  const key = unitPriceKey(modality);
  if (!key) return false;
  if (pricing && typeof pricing[key] === "number") return true;
  // A tiers object with no flat key is still unit pricing.
  return Boolean(pricing && typeof pricing.tiers === "object" && pricing.tiers);
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function marginPct(price: number | null, cost: number | null): number | null {
  if (price === null || cost === null || price <= 0) return null;
  return ((price - cost) / price) * 100;
}

function tiersOf(p: PricingJson): Record<string, unknown> {
  const t = p?.tiers;
  return t && typeof t === "object" ? (t as Record<string, unknown>) : {};
}

/**
 * Per-unit pricing with margin, tier by tier. Tiers present in either the
 * customer or the upstream object are reported, so a tier we price but do
 * not know the cost of shows a null margin rather than vanishing.
 */
export function unitPricing(
  modality: string,
  pricing: PricingJson,
  upstream: PricingJson,
): UnitPricing | null {
  const key = unitPriceKey(modality);
  if (!key || !isUnitPriced(modality, pricing)) return null;

  const flatPrice = num(pricing?.[key]);
  const flatCost = num(upstream?.[key]);
  const priceTiers = tiersOf(pricing);
  const costTiers = tiersOf(upstream);

  const names = [
    ...new Set([...Object.keys(priceTiers), ...Object.keys(costTiers)]),
  ].sort((a, b) => {
    // Resolution-ish names sort naturally by their leading number.
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });

  return {
    unit: unitNoun(modality),
    flat:
      flatPrice === null
        ? null
        : {
            tier: "default",
            priceCents: flatPrice,
            costCents: flatCost,
            marginPct: marginPct(flatPrice, flatCost),
          },
    tiers: names.map((tier) => {
      // A tier absent from one side falls back to that side's flat value,
      // which is exactly how the gateway resolves it.
      const price = num(priceTiers[tier]) ?? flatPrice;
      const cost = num(costTiers[tier]) ?? flatCost;
      return {
        tier,
        priceCents: price ?? 0,
        costCents: cost,
        marginPct: marginPct(price, cost),
      };
    }),
  };
}

/** Cents → dollars for display, keeping sub-cent precision visible. */
export function centsToUsd(cents: number | null): string {
  if (cents === null) return "—";
  const usd = cents / 100;
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
