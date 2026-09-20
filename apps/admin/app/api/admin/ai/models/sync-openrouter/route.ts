import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit";
import {
  DERIVED_PRICE_KEYS,
  deriveSellPricing,
  round4,
  usdPerTokenToCentsPerMtok,
} from "@admin/lib/list-pricing";

export const dynamic = "force-dynamic";

/**
 * List prices from OpenRouter, previewed before they are applied.
 *
 * OpenRouter publishes what the market charges for the models we resell. That
 * is our list price - the number we position against - and it is NOT what we
 * pay and NOT what we charge. It feeds `list_pricing`; the customer price is
 * then derived as list x (1 - discount_pct/100).
 *
 * GET previews and writes nothing. POST applies only the ids it is given.
 * The split is the point: this endpoint can move the price of every model we
 * sell in one call, so the operator sees each before/after and chooses.
 *
 * The catalogue is public and needs no key, so a missing OPENROUTER_API_KEY
 * is not a reason for this to fail.
 */

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const FETCH_TIMEOUT_MS = 15000;

type OpenRouterModel = {
  id?: string;
  name?: string;
  pricing?: Record<string, unknown>;
};

/** OpenRouter's key names for the three rates we sell. */
const KEY_MAP: Record<string, (typeof DERIVED_PRICE_KEYS)[number]> = {
  prompt: "input_cents_per_mtok",
  completion: "output_cents_per_mtok",
  input_cache_read: "cached_cents_per_mtok",
};

function listPricingFrom(
  pricing: Record<string, unknown> | undefined,
): Record<string, number> | null {
  if (!pricing) return null;
  const out: Record<string, number> = {};
  for (const [their, ours] of Object.entries(KEY_MAP)) {
    const cents = usdPerTokenToCentsPerMtok(pricing[their]);
    // -1 means "variable" on OpenRouter and comes back null here; a rate we
    // cannot read is left absent rather than guessed at.
    if (cents === null) continue;
    out[ours] = cents;
  }
  if (out.input_cents_per_mtok === undefined) return null;
  return out;
}

async function fetchCatalogue(): Promise<
  { ok: true; models: Map<string, OpenRouterModel> } | { ok: false; error: string }
> {
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `OpenRouter returned ${res.status}` };
    }
    const json = (await res.json()) as { data?: OpenRouterModel[] };
    const map = new Map<string, OpenRouterModel>();
    for (const m of json.data ?? []) {
      if (typeof m?.id === "string") map.set(m.id.toLowerCase(), m);
    }
    if (map.size === 0) {
      return { ok: false, error: "OpenRouter returned an empty catalogue" };
    }
    return { ok: true, models: map };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unreachable";
    return { ok: false, error: `Could not reach OpenRouter (${msg})` };
  }
}

type Row = {
  id: string;
  model_id: string;
  display_name: string | null;
  openrouter_id: string | null;
  is_active: boolean;
  upstream_provider: string | null;
  pricing: Record<string, unknown> | null;
  list_pricing: Record<string, unknown> | null;
  provider_pricing: Record<string, Record<string, unknown>> | null;
  upstream_pricing: Record<string, unknown> | null;
  discount_pct: number | string | null;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const pctChange = (from: number | null, to: number | null): number | null =>
  from === null || to === null || from === 0 ? null : round4(((to - from) / from) * 100);

async function loadCatalogueRows(): Promise<Row[]> {
  const supabase = await createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inference = (supabase as any).schema("inference");
  const { data, error } = await inference
    .from("models")
    .select(
      "id, model_id, display_name, openrouter_id, is_active, upstream_provider, pricing, list_pricing, provider_pricing, upstream_pricing, discount_pct",
    )
    // List prices apply to models we resell. A fine-tune on our own pods has
    // no OpenRouter equivalent, and matching one by name would price our pod
    // like somebody else's API.
    .eq("serving_type", "proxy");
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

/** The cost that matters is the partner who actually carries the model. */
function realCostOf(row: Row): Record<string, unknown> | null {
  const partner = String(row.upstream_provider ?? "");
  const perProvider = row.provider_pricing ?? {};
  return (
    (perProvider[partner] as Record<string, unknown> | undefined) ??
    row.upstream_pricing ??
    null
  );
}

function buildPreview(
  row: Row,
  or: OpenRouterModel | undefined,
  discountOverride: number | null,
) {
  // The discount decides the sell price, so the preview has to be able to
  // show one that has not been saved yet. Syncing list prices without also
  // choosing where to sit under them is how every model on the platform
  // silently jumps to somebody else's rack rate.
  const discount =
    discountOverride === null ? Number(row.discount_pct ?? 0) : discountOverride;
  const newList = or ? listPricingFrom(or.pricing) : null;

  const currentList = row.list_pricing ?? null;
  const currentSellIn = num(row.pricing?.input_cents_per_mtok);
  const currentSellOut = num(row.pricing?.output_cents_per_mtok);

  const newSell = newList ? deriveSellPricing(newList, discount, row.pricing) : null;
  const newSellIn = newSell ? num(newSell.input_cents_per_mtok) : null;
  const newSellOut = newSell ? num(newSell.output_cents_per_mtok) : null;

  const cost = realCostOf(row);
  const costIn = num(cost?.input_cents_per_mtok);
  const costOut = num(cost?.output_cents_per_mtok);

  // A sell price at or below what we pay is the one outcome this preview
  // exists to catch, so it is computed here rather than left to the eye.
  const marginPct = (price: number | null, c: number | null) =>
    price === null || c === null || price <= 0
      ? null
      : round4(((price - c) / price) * 100);

  // OpenRouter lists some models at zero (free tiers, promos). Applying that
  // would set our price to nothing at all, so it is flagged and never
  // selected by default.
  const zeroList =
    newList !== null &&
    (newList.input_cents_per_mtok ?? 0) === 0 &&
    (newList.output_cents_per_mtok ?? 0) === 0;

  return {
    id: row.id,
    modelId: row.model_id,
    displayName: row.display_name,
    matchedBy: row.openrouter_id ? "openrouter_id" : "model_id",
    matchKey: row.openrouter_id || row.model_id,
    matched: Boolean(newList),
    isActive: row.is_active,
    discountIsProposed: discountOverride !== null,
    currentDiscountPct: Number(row.discount_pct ?? 0),
    provider: row.upstream_provider,
    discountPct: discount,
    currentList: {
      input: num(currentList?.input_cents_per_mtok),
      output: num(currentList?.output_cents_per_mtok),
    },
    newList: {
      input: newList ? (newList.input_cents_per_mtok ?? null) : null,
      output: newList ? (newList.output_cents_per_mtok ?? null) : null,
      cached: newList ? (newList.cached_cents_per_mtok ?? null) : null,
    },
    currentSell: { input: currentSellIn, output: currentSellOut },
    newSell: { input: newSellIn, output: newSellOut },
    sellChangePct: {
      input: pctChange(currentSellIn, newSellIn),
      output: pctChange(currentSellOut, newSellOut),
    },
    // Admin-only. Never rendered on any customer-facing surface.
    realCost: { input: costIn, output: costOut },
    newMarginPct: {
      input: marginPct(newSellIn, costIn),
      output: marginPct(newSellOut, costOut),
    },
    belowCost:
      newSellIn !== null && costIn !== null ? newSellIn < costIn : false,
    zeroList,
    listPricingToWrite: newList,
  };
}

/** A proposed discount from the query string, or null to use each row's own. */
function parseDiscount(raw: string | null): number | null | "invalid" {
  if (raw === null || raw.trim() === "") return null;
  const d = Number(raw);
  if (!Number.isFinite(d) || d < 0 || d >= 100) return "invalid";
  return d;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const discount = parseDiscount(
    new URL(request.url).searchParams.get("discount"),
  );
  if (discount === "invalid") {
    return NextResponse.json(
      { error: "Discount must be a number from 0 to 99.99" },
      { status: 400 },
    );
  }

  const catalogue = await fetchCatalogue();
  if (!catalogue.ok) {
    return NextResponse.json({ error: catalogue.error }, { status: 502 });
  }

  try {
    const rows = await loadCatalogueRows();
    const previews = rows.map((row) =>
      buildPreview(
        row,
        catalogue.models.get(String(row.openrouter_id || row.model_id).toLowerCase()),
        discount,
      ),
    );

    const matched = previews.filter((p) => p.matched);
    const unmatched = previews
      .filter((p) => !p.matched)
      .map((p) => ({
        id: p.id,
        modelId: p.modelId,
        displayName: p.displayName,
        matchKey: p.matchKey,
        isActive: p.isActive,
      }));

    return NextResponse.json({
      source: OPENROUTER_MODELS_URL,
      fetchedAt: new Date().toISOString(),
      catalogueSize: catalogue.models.size,
      proposedDiscountPct: discount,
      summary: {
        proxyModels: rows.length,
        matched: matched.length,
        unmatched: unmatched.length,
        // Counted on active rows only: a delisted model's price moving is
        // not a customer-visible event.
        wouldChange: matched.filter(
          (p) =>
            p.isActive &&
            (p.sellChangePct.input !== null || p.sellChangePct.output !== null) &&
            (Math.abs(p.sellChangePct.input ?? 0) > 0.01 ||
              Math.abs(p.sellChangePct.output ?? 0) > 0.01),
        ).length,
        belowCost: matched.filter((p) => p.isActive && p.belowCost).length,
        zeroList: matched.filter((p) => p.zeroList).length,
        // A price rise reaches customers. It is counted separately from a
        // cut because the two are not the same kind of mistake.
        wouldRise: matched.filter(
          (p) => p.isActive && (p.sellChangePct.input ?? 0) > 0.01,
        ).length,
        wouldFall: matched.filter(
          (p) => p.isActive && (p.sellChangePct.input ?? 0) < -0.01,
        ).length,
      },
      rows: matched,
      unmatched,
    });
  } catch (err) {
    console.error("[Admin AI] openrouter preview failed:", err);
    return NextResponse.json({ error: "Preview failed" }, { status: 500 });
  }
}

/**
 * Apply the previewed list prices to the ids given, and nothing else.
 *
 * The catalogue is re-fetched rather than trusting numbers posted back by
 * the browser: a price the client could edit in flight is a price nobody
 * approved. The preview shown and the values written therefore come from
 * the same source, a few seconds apart.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    ids?: unknown;
    discount_pct?: unknown;
  };
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No models selected" }, { status: 400 });
  }

  // Optional: set the discount on the same models in the same action. The
  // sell price depends on both, so applying a list price without the
  // discount that was previewed alongside it would write a price the
  // operator never actually saw.
  let discountOverride: number | null = null;
  if (body.discount_pct !== undefined && body.discount_pct !== null) {
    const d = Number(body.discount_pct);
    if (!Number.isFinite(d) || d < 0 || d >= 100) {
      return NextResponse.json(
        { error: "Discount must be a number from 0 to 99.99" },
        { status: 400 },
      );
    }
    discountOverride = d;
  }

  const catalogue = await fetchCatalogue();
  if (!catalogue.ok) {
    return NextResponse.json({ error: catalogue.error }, { status: 502 });
  }

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const selected = new Set(ids);
    const rows = (await loadCatalogueRows()).filter((r) => selected.has(r.id));

    const applied: { modelId: string; input: number | null }[] = [];
    const skipped: { modelId: string; reason: string }[] = [];

    for (const row of rows) {
      const or = catalogue.models.get(
        String(row.openrouter_id || row.model_id).toLowerCase(),
      );
      const newList = or ? listPricingFrom(or.pricing) : null;
      if (!newList) {
        skipped.push({ modelId: row.model_id, reason: "no longer matched" });
        continue;
      }

      const discount =
        discountOverride === null ? Number(row.discount_pct ?? 0) : discountOverride;
      const pricing = deriveSellPricing(newList, discount, row.pricing);

      const write: Record<string, unknown> = { list_pricing: newList, pricing };
      if (discountOverride !== null) write.discount_pct = discountOverride;

      const { error } = await inference
        .from("models")
        .update(write)
        .eq("id", row.id);

      if (error) {
        console.error(
          `[Admin AI] list price write failed for ${row.model_id}:`,
          error.message,
        );
        skipped.push({ modelId: row.model_id, reason: "write failed" });
        continue;
      }

      applied.push({
        modelId: row.model_id,
        input: num(pricing.input_cents_per_mtok),
      });

      try {
        await AuditLogService.create({
          user_id: admin.userId || "",
          user_email: admin.email,
          user_role: "admin",
          action: "update",
          service_type: "ai_agent",
          service_id: row.model_id,
          service_name: row.display_name || row.model_id,
          metadata: {
            operation: "admin.inference.model.list_price_sync",
            source: OPENROUTER_MODELS_URL,
            discount_pct: discount,
            before: {
              list_pricing: row.list_pricing,
              pricing: row.pricing,
              discount_pct: Number(row.discount_pct ?? 0),
            },
            after: { list_pricing: newList, pricing, discount_pct: discount },
          },
          user_agent: request.headers.get("user-agent") || undefined,
        });
      } catch {
        // audit must never fail the action
      }
    }

    return NextResponse.json({
      applied: applied.length,
      skipped,
      models: applied,
    });
  } catch (err) {
    console.error("[Admin AI] openrouter sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
