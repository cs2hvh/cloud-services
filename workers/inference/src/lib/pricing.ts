/**
 * Customer-facing price arithmetic, shared by the catalog endpoint and the
 * usage consumer.
 *
 * Two rules this file exists to keep:
 *
 *  1. The off-peak window is evaluated in exactly one place. The catalog says
 *     "the discount is live right now" and the consumer bills the discount;
 *     if those two ever disagreed, we would quote a price we do not charge.
 *
 *  2. Nothing here touches models.upstream_pricing. What a backend charges us
 *     is not a customer-facing number and must never reach a public response.
 */

export interface ModelPricing {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
  cached_cents_per_mtok?: number;
  /** Media models are priced per unit, not per token: one of these is set. */
  cents_per_image?: number;
  cents_per_media_second?: number;
  /** Per-tier override of the unit rate, keyed by size tier ("2K") or
   *  resolution ("720p"). The flat rate above is the default. */
  tiers?: Record<string, number>;
}

/** The per-unit rate for a media model, for a tier if one applies. Null for token-priced models. */
export function unitRate(p: ModelPricing | null | undefined, tier: string | null | undefined): number | null {
  if (!p) return null;
  const flat = typeof p.cents_per_image === "number" ? p.cents_per_image
    : typeof p.cents_per_media_second === "number" ? p.cents_per_media_second
    : null;
  if (flat === null) return null;
  const tiered = tier ? p.tiers?.[tier] : undefined;
  return typeof tiered === "number" ? tiered : flat;
}

export function unitLabelOf(p: ModelPricing | null | undefined): "image" | "second" | null {
  if (typeof p?.cents_per_image === "number") return "image";
  if (typeof p?.cents_per_media_second === "number") return "second";
  return null;
}

export interface ModelOffPeak {
  window_utc?: string; // "HH:MM-HH:MM", may wrap midnight
  discount_pct?: number;
}

/**
 * Is `at` inside a "HH:MM-HH:MM" UTC window? A window whose start is after
 * its end wraps midnight ("22:00-02:00"). The end minute is exclusive, so
 * back-to-back windows do not both claim the boundary.
 *
 * Returns false for anything it cannot parse: an unreadable window is not a
 * discount, which fails towards the list price rather than towards a price we
 * never agreed to.
 */
export function isWithinUtcWindow(windowUtc: string, at: Date): boolean {
  const [startStr, endStr] = windowUtc.split("-");
  if (!startStr || !endStr) return false;

  const [sh, sm] = startStr.split(":").map((s) => Number.parseInt(s, 10));
  const [eh, em] = endStr.split(":").map((s) => Number.parseInt(s, 10));
  if (
    !Number.isFinite(sh) || !Number.isFinite(sm) ||
    !Number.isFinite(eh) || !Number.isFinite(em)
  ) {
    return false;
  }

  const mins = at.getUTCHours() * 60 + at.getUTCMinutes();
  const startMins = (sh ?? 0) * 60 + (sm ?? 0);
  const endMins = (eh ?? 0) * 60 + (em ?? 0);

  return startMins <= endMins
    ? mins >= startMins && mins < endMins
    : mins >= startMins || mins < endMins;
}

/** An off-peak block is a discount only if it names a window AND a percent. */
export function activeDiscountPct(offPeak: ModelOffPeak | null, at: Date): number {
  if (!offPeak?.window_utc || !offPeak?.discount_pct) return 0;
  return isWithinUtcWindow(offPeak.window_utc, at) ? offPeak.discount_pct : 0;
}

export interface DiscountedPrices {
  percent: number;
  window_utc: string;
  active_now: boolean;
  input: number | null;
  cached_input: number | null;
  output: number | null;
}

/**
 * The reference price a model is discounted from: the vendor's own list
 * price as OpenRouter publishes it, synced by the admin panel. What a partner
 * charges us is a different number and is never published.
 */
export interface PublicListPrices {
  input: number | null;
  cached_input: number | null;
  output: number | null;
}

/** Published prices for a media model: dollars per image or per second of output. */
export interface PublicUnitPrices {
  currency: "USD";
  unit: "per_image" | "per_second";
  price: number;
  /** Per size-tier or resolution, when the model prices by it. */
  tiers: Record<string, number> | null;
  /** The reference price the standing discount is taken from; null when none is set. */
  list_price: number | null;
  /** Standing discount off list_price, in percent. 0 when none. */
  discount_percent: number;
  discount: { percent: number; window_utc: string; active_now: boolean; price: number } | null;
  effective_price: number;
}

export interface PublicPrices {
  currency: "USD";
  unit: "per_million_tokens";
  /** The reference (list) prices the standing discount is taken from; null when none is set. */
  list: PublicListPrices | null;
  /** Standing discount off list, in percent. 0 when none. input/output below are already net of it. */
  discount_percent: number;
  input: number | null;
  cached_input: number | null;
  output: number | null;
  /** Null when no discount window is configured for this model. */
  discount: DiscountedPrices | null;
  /** What a request sent right now is billed at: discounted inside the window, list outside it. */
  effective_input: number | null;
  effective_cached_input: number | null;
  effective_output: number | null;
}

/** Cents per million tokens → dollars per million tokens, without float dust. */
function dollars(cents: number | undefined): number | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return Math.round((cents / 100) * 1e6) / 1e6;
}

function applyPct(usd: number | null, pct: number): number | null {
  if (usd === null) return null;
  return Math.round(usd * (1 - pct / 100) * 1e6) / 1e6;
}

/**
 * The price block published on GET /v1/models: list price per million tokens,
 * plus the discounted price when a model has an off-peak window.
 *
 * `cached_input` falls back to the input rate when a model publishes no cached
 * rate, because that is what the consumer bills for a cached token. A rate the
 * catalog does not carry at all is null, not zero: null reads as "not
 * published", while zero would promise free tokens.
 */
export function publicPrices(
  pricing: ModelPricing | null | undefined,
  offPeak: ModelOffPeak | null | undefined,
  now: Date = new Date(),
  listPricing: ModelPricing | null | undefined = null,
  discountPct: number | null | undefined = 0
): PublicPrices | PublicUnitPrices {
  const p = pricing ?? {};
  const discountPercent = typeof discountPct === "number" && Number.isFinite(discountPct) && discountPct > 0 ? discountPct : 0;

  // Media: one number per image or per second, optionally by tier.
  const label = unitLabelOf(p);
  if (label) {
    const flat = unitRate(p, null) as number;
    const price = dollars(flat) as number;
    const tiers = p.tiers
      ? Object.fromEntries(Object.entries(p.tiers).map(([k, v]) => [k, dollars(v) as number]))
      : null;
    const listPrice = listPricing ? dollars(unitRate(listPricing, null) ?? undefined) : null;
    const op = offPeak ?? null;
    if (op?.window_utc && op?.discount_pct) {
      const activeNow = isWithinUtcWindow(op.window_utc, now);
      const discounted = applyPct(price, op.discount_pct) as number;
      return {
        currency: "USD",
        unit: label === "image" ? "per_image" : "per_second",
        price,
        tiers,
        list_price: listPrice,
        discount_percent: discountPercent,
        discount: { percent: op.discount_pct, window_utc: op.window_utc, active_now: activeNow, price: discounted },
        effective_price: activeNow ? discounted : price,
      };
    }
    return { currency: "USD", unit: label === "image" ? "per_image" : "per_second", price, tiers, list_price: listPrice, discount_percent: discountPercent, discount: null, effective_price: price };
  }

  const lp = listPricing ?? null;
  const list: PublicListPrices | null = lp
    ? {
        input: dollars(lp.input_cents_per_mtok),
        cached_input: dollars(lp.cached_cents_per_mtok) ?? dollars(lp.input_cents_per_mtok),
        output: dollars(lp.output_cents_per_mtok),
      }
    : null;
  const input = dollars(p.input_cents_per_mtok);
  const output = dollars(p.output_cents_per_mtok);
  const cachedInput = dollars(p.cached_cents_per_mtok) ?? input;

  const op = offPeak ?? null;
  const configured = Boolean(op?.window_utc && op?.discount_pct);

  if (!configured || !op?.window_utc || !op?.discount_pct) {
    return {
      currency: "USD",
      unit: "per_million_tokens",
      list,
      discount_percent: discountPercent,
      input,
      cached_input: cachedInput,
      output,
      discount: null,
      effective_input: input,
      effective_cached_input: cachedInput,
      effective_output: output,
    };
  }

  const activeNow = isWithinUtcWindow(op.window_utc, now);
  const discount: DiscountedPrices = {
    percent: op.discount_pct,
    window_utc: op.window_utc,
    active_now: activeNow,
    input: applyPct(input, op.discount_pct),
    cached_input: applyPct(cachedInput, op.discount_pct),
    output: applyPct(output, op.discount_pct),
  };

  return {
    currency: "USD",
    unit: "per_million_tokens",
    list,
    discount_percent: discountPercent,
    input,
    cached_input: cachedInput,
    output,
    discount,
    effective_input: activeNow ? discount.input : input,
    effective_cached_input: activeNow ? discount.cached_input : cachedInput,
    effective_output: activeNow ? discount.output : output,
  };
}
