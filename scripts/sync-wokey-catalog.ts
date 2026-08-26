/**
 * sync-wokey-catalog.ts
 *
 * Reads Wokey's PUBLIC model catalog and writes `inference.model_routes` rows
 * for the models we already sell. No API key is required — their pricing
 * endpoint is unauthenticated:
 *
 *     GET https://api.wokey.ai/v1/models/pricing
 *
 * WHAT IT WRITES, and what it must never touch
 * ────────────────────────────────────────────
 *   writes:  upstream_model_id, upstream_pricing,
 *            catalog_present, catalog_available, catalog_synced_at
 *   never:   enabled            ← operator policy. A route this script has just
 *                                 discovered stays OFF until a human enables it.
 *   never:   DELETE             ← a delisted model sets catalog_present = false
 *                                 and keeps its row, so an operator's veto
 *                                 survives the model coming back.
 *
 * See docs/inference/supply-routing-plan.md §9.2.
 *
 * MATCHING. Wokey is inconsistent about separators — Anthropic models are
 * 'claude-sonnet-4-6' while OpenAI ones keep the dot as 'gpt-5.5'. So ids are
 * compared on a normalised form (vendor prefix dropped, separators stripped)
 * rather than by a rewrite rule, and a normalised form that is ambiguous on
 * either side is skipped rather than guessed.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/sync-wokey-catalog.ts [--apply]
 *
 * Dry-run unless --apply, same discipline as sync-or-model-pricing.ts.
 */

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = !process.argv.includes("--apply");
const WOKEY_PRICING_URL =
  process.env.WOKEY_PRICING_URL ?? "https://api.wokey.ai/v1/models/pricing";

/** One priced unit of a Wokey model. `price_usd` is USD per `quantity` units. */
interface WokeySku {
  meter: string;
  unit: string;
  quantity: number;
  price_usd: string;
  reference_price_usd?: string;
}

interface WokeyModel {
  id: string;
  name?: string;
  owned_by?: string;
  available?: boolean;
  pricing_mode?: string;
  architecture?: { modality?: string };
  pricing_skus?: WokeySku[];
}

/** Our storage unit is CENTS per million tokens; theirs is USD per million. */
function toCentsPerMtok(sku: WokeySku | undefined): number | null {
  if (!sku) return null;
  const usd = Number.parseFloat(sku.price_usd);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  // Guard the assumption rather than trusting it: every token SKU they publish
  // is quoted per 1,000,000 units. If that ever changes, skip it rather than
  // silently storing a price that is out by six orders of magnitude.
  if (sku.quantity !== 1_000_000) return null;
  return Math.round(usd * 100);
}

interface UpstreamPricing {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
  cached_cents_per_mtok?: number;
  cache_write_cents_per_mtok?: number;
  cache_write_1h_cents_per_mtok?: number;
}

function buildPricing(model: WokeyModel): UpstreamPricing {
  const by = new Map((model.pricing_skus ?? []).map((s) => [s.meter, s]));
  const p: UpstreamPricing = {};
  const set = (key: keyof UpstreamPricing, meter: string) => {
    const v = toCentsPerMtok(by.get(meter));
    if (v != null) p[key] = v;
  };
  set("input_cents_per_mtok", "input_tokens");
  set("output_cents_per_mtok", "output_tokens");
  set("cached_cents_per_mtok", "cache_read_tokens");
  // Prefer the explicit 5-minute meter; some models publish only a generic one.
  set("cache_write_cents_per_mtok", "cache_write_5m_tokens");
  if (p.cache_write_cents_per_mtok == null) set("cache_write_cents_per_mtok", "cache_write_tokens");
  set("cache_write_1h_cents_per_mtok", "cache_write_1h_tokens");
  return p;
}

/** 'anthropic/claude-sonnet-4.6' and 'claude-sonnet-4-6' -> 'claudesonnet46'. */
function normalise(id: string): string {
  return id.split("/").pop()!.toLowerCase().replace(/[.\-_\s]/g, "");
}

/** Build a lookup, dropping any key that is ambiguous — a wrong match would
 *  route traffic to a different model than the customer asked for. */
function uniqueIndex<T>(items: T[], key: (t: T) => string): Map<string, T> {
  const seen = new Map<string, T>();
  const dupes = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) dupes.add(k);
    seen.set(k, item);
  }
  for (const d of dupes) seen.delete(d);
  return seen;
}

async function main() {
  const sbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl) { console.error("SUPABASE_URL not set"); process.exit(1); }
  if (!sbKey) { console.error("SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(1); }

  console.log(`Fetching ${WOKEY_PRICING_URL} …`);
  const resp = await fetch(WOKEY_PRICING_URL);
  if (!resp.ok) { console.error("Wokey catalog fetch failed:", resp.status); process.exit(1); }
  const { data: wokeyModels } = (await resp.json()) as { data: WokeyModel[] };
  console.log(`Wokey lists ${wokeyModels.length} models.`);

  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
  const { data: ourModels, error } = await sb
    .schema("inference")
    .from("models")
    .select("model_id, modality, is_active")
    .eq("serving_type", "proxy")
    .returns<Array<{ model_id: string; modality: string; is_active: boolean }>>();
  if (error) { console.error("DB fetch failed:", error.message); process.exit(1); }
  console.log(`Our catalog has ${ourModels?.length ?? 0} proxy models.\n`);

  // Only text models are candidates: Wokey has no /embeddings or /rerank
  // endpoint at all, so a match there would be meaningless.
  const theirs = uniqueIndex(
    wokeyModels.filter((m) => (m.architecture?.modality ?? "text->text").endsWith("text")),
    (m) => normalise(m.id),
  );

  const upserts: Array<Record<string, unknown>> = [];
  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const row of (ourModels ?? []).filter((m) => m.modality === "chat")) {
    const theirModel = theirs.get(normalise(row.model_id));
    if (!theirModel) { unmatched.push(row.model_id); continue; }

    const pricing = buildPricing(theirModel);
    matched.push(`${row.model_id}  ->  ${theirModel.id}`);
    upserts.push({
      model_id: row.model_id,
      provider: "wokey",
      upstream_model_id: theirModel.id,
      upstream_pricing: pricing,
      catalog_present: true,
      catalog_available: theirModel.available !== false,
      catalog_synced_at: new Date().toISOString(),
      // `enabled` deliberately absent — see the header. On insert the column
      // default (FALSE) applies; on update it is left exactly as an operator
      // set it.
    });

    const cw = pricing.cache_write_cents_per_mtok;
    console.log(
      `  ${row.model_id}\n` +
      `     wokey id : ${theirModel.id}${theirModel.available === false ? "   [UNAVAILABLE]" : ""}\n` +
      `     in/out   : ${pricing.input_cents_per_mtok ?? "-"} / ${pricing.output_cents_per_mtok ?? "-"} cents per Mtok\n` +
      `     cache r/w: ${pricing.cached_cents_per_mtok ?? "-"} / ${cw ?? "-"}`,
    );
  }

  console.log(`\n${matched.length} of our chat models exist at Wokey; ${unmatched.length} do not.`);
  if (unmatched.length) {
    console.log("Not carried by Wokey (these can never route there):");
    for (const m of unmatched) console.log(`   - ${m}`);
  }

  // Anything we previously recorded that Wokey has since dropped. Soft-delete
  // only: the row stays so an operator's `enabled` decision survives.
  const stillListed = new Set(upserts.map((u) => u.model_id as string));
  const { data: existing } = await sb
    .schema("inference")
    .from("model_routes")
    .select("model_id")
    .eq("provider", "wokey")
    .eq("catalog_present", true)
    .returns<Array<{ model_id: string }>>();
  const delisted = (existing ?? []).map((r) => r.model_id).filter((m) => !stillListed.has(m));
  if (delisted.length) {
    console.log(`\nDELISTED since the last sync (row kept, marked not present):`);
    for (const m of delisted) console.log(`   - ${m}`);
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] ${upserts.length} route(s) would be written. Pass --apply.`);
    return;
  }

  for (const u of upserts) {
    const { error: upErr } = await sb
      .schema("inference")
      .from("model_routes")
      .upsert(u, { onConflict: "model_id,provider" });
    if (upErr) console.error(`  failed ${u.model_id}:`, upErr.message);
  }
  if (delisted.length) {
    const { error: delErr } = await sb
      .schema("inference")
      .from("model_routes")
      .update({ catalog_present: false, catalog_available: false, catalog_synced_at: new Date().toISOString() })
      .eq("provider", "wokey")
      .in("model_id", delisted);
    if (delErr) console.error("  failed to mark delisted:", delErr.message);
  }
  console.log(`\nDone. ${upserts.length} route(s) written, ${delisted.length} marked delisted.`);
  console.log("Routes are DISABLED until an operator enables them.");
}

main().catch((err) => { console.error(err); process.exit(1); });
