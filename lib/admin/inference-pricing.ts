/**
 * Pricing maths for the AI model catalog admin — pure, DB-free, UI-free.
 *
 * Everything here is a function of its arguments so the rules that decide what a
 * customer pays can be unit-tested without a database, a session, or a browser.
 * The routes (app/api/admin/inference/pricing/*) do auth + IO and call into this;
 * the screen (components/admin/inference-pricing/*) renders what it returns.
 *
 * Units: every price is CENTS PER MILLION TOKENS, matching inference.models'
 * `pricing` / `upstream_pricing` jsonb exactly. No conversion happens anywhere,
 * so what an operator reads on screen is literally what the biller charges.
 *
 * Doc: nextstespsAI/21-admin-platform.md (§4, section A1).
 */

/** The stored jsonb. Open-ended because it also holds per-unit SKU rates
 *  (cents_per_image, cents_per_page, tts/stt/video) this screen must not touch. */
export type Pricing = Record<string, unknown>;

/** The three token prices the pricing screen edits. */
export const TOKEN_FIELDS = ["input_cents_per_mtok", "cached_cents_per_mtok", "output_cents_per_mtok"] as const;
export type TokenField = (typeof TOKEN_FIELDS)[number];

export const TOKEN_FIELD_LABELS: Record<TokenField, string> = {
  input_cents_per_mtok: "Input",
  cached_cents_per_mtok: "Cached",
  output_cents_per_mtok: "Output",
};

export interface ModelPricingRow {
  model_id: string;
  display_name?: string | null;
  is_active: boolean;
  serving_type?: string | null;
  pricing: Pricing | null;
  upstream_pricing: Pricing | null;
}

/** Per-unit SKU rates share this prefix: cents_per_image, cents_per_page, … */
export const PER_UNIT_PREFIX = "cents_per_";

/** The per-unit rates a model carries, sorted for stable rendering. */
export function perUnitRates(pricing: Pricing | null | undefined): Array<{ key: string; value: number }> {
  return Object.entries(pricing ?? {})
    .filter(([key, value]) => key.startsWith(PER_UNIT_PREFIX) && typeof value === "number")
    .map(([key, value]) => ({ key, value: value as number }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** "cents_per_1k_chars" -> "1k chars", for column headers and labels. */
export function unitLabel(key: string): string {
  return key.replace(PER_UNIT_PREFIX, "").replace(/_/g, " ");
}

/** Read one numeric price out of a jsonb blob, tolerating nulls and junk. */
export function readPrice(pricing: Pricing | null | undefined, field: string): number | null {
  const value = pricing?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Which price a model is actually judged on. */
export type PricingBasis = "output" | "input" | "unit" | "none";

/**
 * Pick the price that represents what a model earns.
 *
 * Output for chat models, where output tokens dominate spend. But EMBEDDING
 * models bill on input and have `output_cents_per_mtok: 0` by nature — judging
 * them on output made their margin permanently unreadable, even once a cost
 * source exists (found reviewing the live catalog, 2026-07-28). Per-unit SKUs
 * are judged on neither; they have their own rates.
 */
export function pricingBasis(pricing: Pricing | null): PricingBasis {
  if (!isTokenBilled({ pricing })) return "unit";
  const output = readPrice(pricing, "output_cents_per_mtok");
  if (output !== null && output > 0) return "output";
  const input = readPrice(pricing, "input_cents_per_mtok");
  if (input !== null && input > 0) return "input";
  return "none";
}

/** The jsonb key a basis reads, or null when there isn't one. */
export function basisField(basis: PricingBasis): TokenField | null {
  if (basis === "output") return "output_cents_per_mtok";
  if (basis === "input") return "input_cents_per_mtok";
  return null;
}

/**
 * Margin on whichever price the model actually earns from. Null when either
 * side is unknown: a missing cost basis must read as "unknown", never as 0%.
 */
export function marginPct(pricing: Pricing | null, upstream: Pricing | null): number | null {
  const field = basisField(pricingBasis(pricing));
  if (!field) return null;
  const ours = readPrice(pricing, field);
  const theirs = readPrice(upstream, field);
  if (ours === null || theirs === null || ours <= 0) return null;
  return ((ours - theirs) / ours) * 100;
}

/** Whether we can tell if this model is profitable at all. */
export function hasCostBasis(row: Pick<ModelPricingRow, "pricing" | "upstream_pricing">): boolean {
  const field = basisField(pricingBasis(row.pricing));
  if (!field) return false;
  return readPrice(row.upstream_pricing, field) !== null;
}

/**
 * True when a model is billed per TOKEN (the only shape this screen prices).
 *
 * The catalog has a second shape: per-unit SKUs priced with `cents_per_image`,
 * `cents_per_page`, `cents_per_1k_chars`, `cents_per_media_second`,
 * `cents_per_1k_rerank`, `cents_per_1k_moderation` — image gen, OCR, voice,
 * video, music, rerank, moderation. They must never be repriced by the token
 * rule: the sync writes token-shaped *upstream* costs onto them (image-gen
 * carries output_cents_per_mtok: 250 while actually charging 3¢ per image), so
 * a naive rule would happily invent a token price for a model that is not sold
 * by the token. Found on the live screen, 2026-07-28.
 */
export function isTokenBilled(row: Pick<ModelPricingRow, "pricing">): boolean {
  const pricing = row.pricing ?? {};
  const hasToken = TOKEN_FIELDS.some((field) => readPrice(pricing, field) !== null);
  if (hasToken) return true;
  // No token price AND a per-unit price present → it's a per-unit SKU.
  return !Object.keys(pricing).some((key) => key.startsWith("cents_per_"));
}

/**
 * The price that yields `targetMarginPct` on a known cost:
 *   price = cost / (1 - margin)
 * Rounded UP, so rounding never lands us a cent below the target.
 */
export function priceForMargin(costCents: number, targetMarginPct: number): number {
  if (!Number.isFinite(costCents) || costCents <= 0) throw new Error("costCents must be > 0");
  if (!Number.isFinite(targetMarginPct) || targetMarginPct < 0 || targetMarginPct >= 100) {
    throw new Error("targetMarginPct must be in [0, 100)");
  }
  return Math.ceil(costCents / (1 - targetMarginPct / 100));
}

export type PriceTone = "loss" | "thin" | "healthy" | "unknown";

/** Shared severity so the table, badges and summary can't disagree. */
export function priceTone(margin: number | null, costKnown: boolean): PriceTone {
  if (!costKnown || margin === null) return "unknown";
  if (margin <= 0) return "loss";
  if (margin < 20) return "thin";
  return "healthy";
}

// ── Single-model edit ────────────────────────────────────────────────────────

export interface PriceViolation {
  field: TokenField;
  value: number;
  cost: number;
}

export interface PriceUpdatePlan {
  /** The merged jsonb to persist. Only valid when ok is true. */
  next: Pricing;
  /** Fields priced below known upstream cost (empty when force was set). */
  violations: PriceViolation[];
  /** Fields whose supplied value wasn't a usable number. */
  invalid: TokenField[];
  ok: boolean;
}

/**
 * Merge a price patch into a model's stored pricing and enforce the floor.
 *
 * Two rules carry the weight:
 *  1. MERGE, never replace — `pricing` also holds per-unit SKU rates. Writing a
 *     fresh object would wipe image/audio/OCR pricing for that model.
 *  2. FLOOR — refuse a price below known upstream cost unless `force` is set.
 *     A deliberate loss-leader is a legitimate business call; silent drift
 *     below cost (which is how 20 models ended up underwater) is not.
 */
export function planPriceUpdate(input: {
  existing: Pricing | null;
  upstream: Pricing | null;
  patch: Partial<Record<TokenField, number | null>>;
  /** Per-unit rates (cents_per_image, cents_per_page, …). Only keys the model
   *  already carries are accepted — this screen edits rates, it doesn't invent
   *  new SKUs. No floor is applied: upstream per-unit costs are unreliable
   *  (image-gen reports cents_per_image: 0), so there is nothing to compare to. */
  unitPatch?: Record<string, number | null>;
  force?: boolean;
}): PriceUpdatePlan {
  const next: Pricing = { ...(input.existing ?? {}) };
  const violations: PriceViolation[] = [];
  const invalid: TokenField[] = [];

  for (const [key, raw] of Object.entries(input.unitPatch ?? {})) {
    if (!key.startsWith(PER_UNIT_PREFIX)) continue;
    if (!(key in (input.existing ?? {}))) continue; // never invent a new SKU rate
    if (raw === null) {
      delete next[key];
      continue;
    }
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) next[key] = value;
  }

  for (const field of TOKEN_FIELDS) {
    if (!(field in input.patch)) continue;
    const raw = input.patch[field];

    if (raw === null || raw === undefined) {
      delete next[field];
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      invalid.push(field);
      continue;
    }
    const cost = readPrice(input.upstream, field);
    if (cost !== null && value < cost && !input.force) {
      violations.push({ field, value, cost });
    }
    next[field] = value;
  }

  return { next, violations, invalid, ok: violations.length === 0 && invalid.length === 0 };
}

// ── Bulk reprice ─────────────────────────────────────────────────────────────

export interface RepriceChange {
  model_id: string;
  field: TokenField;
  from: number | null;
  to: number;
  cost: number;
}

export interface RepriceSkip {
  model_id: string;
  reason: string;
}

export interface RepricePlan {
  target_margin_pct: number;
  changes: RepriceChange[];
  updates: Array<{ model_id: string; pricing: Pricing }>;
  skipped: RepriceSkip[];
}

export interface RepriceOptions {
  targetMarginPct: number;
  /** Default true: touch only models currently sold at or below cost. */
  onlyUnderwater?: boolean;
  /** Restrict to an explicit set; null/undefined means "all candidates". */
  modelIds?: string[] | null;
}

/**
 * Work out what a bulk reprice WOULD do. Returns a plan; writing it is the
 * caller's job, so a preview and a real run are guaranteed to agree.
 *
 * Models without a cost basis are never repriced — that would be guesswork —
 * and are reported in `skipped` rather than silently dropped, so the screen can
 * say what it didn't touch.
 */
export function planReprice(models: ModelPricingRow[], options: RepriceOptions): RepricePlan {
  const { targetMarginPct, onlyUnderwater = true, modelIds = null } = options;
  const changes: RepriceChange[] = [];
  const updates: Array<{ model_id: string; pricing: Pricing }> = [];
  const skipped: RepriceSkip[] = [];

  for (const model of models) {
    if (modelIds && !modelIds.includes(model.model_id)) continue;
    if (!model.is_active) continue;

    // Per-unit SKUs (image/OCR/voice/video/rerank) are not sold by the token —
    // repricing them with the token rule would invent a meaningless price.
    if (!isTokenBilled(model)) {
      skipped.push({ model_id: model.model_id, reason: "priced per unit, not per token" });
      continue;
    }

    const costOut = readPrice(model.upstream_pricing, "output_cents_per_mtok");
    if (costOut === null) {
      skipped.push({ model_id: model.model_id, reason: "no upstream cost basis" });
      continue;
    }

    const ourOut = readPrice(model.pricing, "output_cents_per_mtok");
    if (onlyUnderwater && ourOut !== null && ourOut > costOut) continue; // already profitable

    const next: Pricing = { ...(model.pricing ?? {}) };
    let touched = false;

    for (const field of TOKEN_FIELDS) {
      const cost = readPrice(model.upstream_pricing, field);
      if (cost === null || cost <= 0) continue; // nothing to base a price on
      const to = priceForMargin(cost, targetMarginPct);
      const from = readPrice(model.pricing, field);
      if (from === to) continue;
      changes.push({ model_id: model.model_id, field, from, to, cost });
      next[field] = to;
      touched = true;
    }

    if (touched) updates.push({ model_id: model.model_id, pricing: next });
  }

  return { target_margin_pct: targetMarginPct, changes, updates, skipped };
}

// ── Summary ──────────────────────────────────────────────────────────────────

export interface CatalogSummary {
  total: number;
  active: number;
  /** Token-billed models we genuinely cannot judge — no upstream cost. */
  cost_unknown: number;
  /** Per-unit SKUs: priced (3c/image, 2c/page), just not token-comparable. */
  per_unit: number;
  at_or_below_cost: number;
  thin_margin: number;
}

/**
 * Counting rule that matters: per-unit SKUs are NOT "margin unknowable".
 *
 * Lumping them into cost_unknown reported 22 unjudgeable models when only 8
 * genuinely were — the other 14 (image, video, voice, OCR, rerank, moderation)
 * carry real prices, they simply aren't comparable on a token basis. Splitting
 * them keeps the alarming number honest.
 */
export function summarize(models: ModelPricingRow[]): CatalogSummary {
  const active = models.filter((m) => m.is_active);
  let costUnknown = 0;
  let perUnit = 0;
  let underwater = 0;
  let thin = 0;

  for (const m of active) {
    if (pricingBasis(m.pricing) === "unit") {
      perUnit++;
      continue;
    }
    const tone = priceTone(marginPct(m.pricing, m.upstream_pricing), hasCostBasis(m));
    if (tone === "unknown") costUnknown++;
    else if (tone === "loss") underwater++;
    else if (tone === "thin") thin++;
  }

  return {
    total: models.length,
    active: active.length,
    cost_unknown: costUnknown,
    per_unit: perUnit,
    at_or_below_cost: underwater,
    thin_margin: thin,
  };
}
