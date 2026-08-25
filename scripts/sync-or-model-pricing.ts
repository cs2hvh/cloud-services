/**
 * sync-or-model-pricing.ts
 *
 * Fetches live pricing from OpenRouter /api/v1/models and updates
 * inference.models for all rows with serving_type='proxy'.
 *
 * TWO separate JSONB columns:
 *   upstream_pricing  = what OR charges us (synced here, source of truth for cost basis)
 *   pricing           = what WE charge the customer (manually curated, NOT overwritten)
 *
 * This script only writes upstream_pricing. Customer-facing pricing
 * (with markup) is set manually per model — editing it here would
 * wipe our margin decisions.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENROUTER_API_KEY=... \
 *     npx tsx scripts/sync-or-model-pricing.ts [--apply]
 *
 * Without --apply: dry-run only (shows diff, writes nothing).
 * With --apply:    updates upstream_pricing in the DB.
 */

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = !process.argv.includes("--apply");

const OR_URL = "https://openrouter.ai/api/v1/models";

interface OrPricing {
  prompt?: string;           // USD per token (input)
  completion?: string;       // USD per token (output)
  input_cache_read?: string; // USD per token (cached input)
  image?: string;            // USD per image (for image gen models)
  request?: string;          // USD per request (flat fee)
}

interface OrModel {
  id: string;
  pricing: OrPricing;
}

// OR stores USD per token — we store cents per million tokens.
// Conversion: usd_per_token * 1_000_000 tokens/million * 100 cents/dollar
function toCentsPerMtok(usdPerToken: string | undefined): number | null {
  if (!usdPerToken) return null;
  const val = parseFloat(usdPerToken);
  if (!Number.isFinite(val) || val <= 0) return null;
  return Math.round(val * 1e8); // 1e6 (per million) * 100 (to cents)
}

interface UpstreamPricing {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
  cached_cents_per_mtok?: number;
  cents_per_image?: number;
}

function buildUpstreamPricing(or: OrPricing): UpstreamPricing {
  const p: UpstreamPricing = {};

  const input  = toCentsPerMtok(or.prompt);
  const output = toCentsPerMtok(or.completion);
  const cached = toCentsPerMtok(or.input_cache_read);
  const image  = or.image ? Math.round(parseFloat(or.image) * 100) : null; // cents per image

  if (input  != null) p.input_cents_per_mtok  = input;
  if (output != null) p.output_cents_per_mtok  = output;
  if (cached != null) p.cached_cents_per_mtok  = cached;
  if (image  != null) p.cents_per_image         = image;

  return p;
}

async function main() {
  const orKey  = process.env.OPENROUTER_API_KEY;
  const sbUrl  = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!orKey)  { console.error("OPENROUTER_API_KEY not set"); process.exit(1); }
  if (!sbUrl)  { console.error("SUPABASE_URL not set"); process.exit(1); }
  if (!sbKey)  { console.error("SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(1); }

  // 1. Fetch all OR models
  console.log("Fetching OR models...");
  const resp = await fetch(OR_URL, { headers: { Authorization: `Bearer ${orKey}` } });
  if (!resp.ok) { console.error("OR fetch failed:", resp.status); process.exit(1); }
  const { data: orModels }: { data: OrModel[] } = await resp.json() as { data: OrModel[] };
  const orMap = new Map(orModels.map((m) => [m.id, m]));
  console.log(`OR returned ${orModels.length} models.`);

  // 2. Fetch our proxy models
  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
  const { data: ourModels, error } = await sb
    .schema("inference")
    .from("models")
    .select("model_id, upstream_model_id, serving_type, pricing, upstream_pricing")
    .eq("serving_type", "proxy")
    .returns<Array<{
      model_id: string;
      upstream_model_id: string | null;
      serving_type: string;
      pricing: Record<string, number> | null;
      upstream_pricing: Record<string, number> | null;
    }>>();

  if (error) { console.error("DB fetch failed:", error.message); process.exit(1); }
  console.log(`Our catalog has ${ourModels?.length ?? 0} proxy models.\n`);

  // 3. Diff and build updates
  const updates: Array<{ model_id: string; upstream_pricing: UpstreamPricing }> = [];
  const notOnOr: string[] = [];

  for (const row of ourModels ?? []) {
    const lookupId = row.upstream_model_id ?? row.model_id;
    const orModel  = orMap.get(lookupId);

    if (!orModel) {
      notOnOr.push(`${row.model_id} (looking for ${lookupId})`);
      continue;
    }

    const newUpstream = buildUpstreamPricing(orModel.pricing);
    const old = row.upstream_pricing ?? {};

    const changed = JSON.stringify(newUpstream) !== JSON.stringify(old);
    if (!changed) continue;

    // Show diff — customer pricing vs OR upstream vs what we had
    console.log(`📦 ${row.model_id}`);
    console.log(`   upstream_model:  ${lookupId}`);
    console.log(`   our pricing:     ${JSON.stringify(row.pricing)}`);
    console.log(`   upstream before: ${JSON.stringify(old)}`);
    console.log(`   upstream after:  ${JSON.stringify(newUpstream)}`);

    // Warn if our customer pricing is below our upstream cost (would lose money)
    const ourInput  = (row.pricing as Record<string, number>)?.input_cents_per_mtok  ?? 0;
    const orInput   = newUpstream.input_cents_per_mtok ?? 0;
    if (ourInput > 0 && orInput > 0 && ourInput < orInput) {
      console.warn(`   ⚠️  WARNING: our price (${ourInput}) < OR cost (${orInput}) — losing money on input tokens`);
    }
    console.log();

    updates.push({ model_id: row.model_id, upstream_pricing: newUpstream });
  }

  // 4. Report models not on OR
  if (notOnOr.length > 0) {
    console.log("Models NOT found on OR (custom/future/wrong alias):");
    notOnOr.forEach((m) => console.log(`  ❌ ${m}`));
    console.log();
  }

  // 5. Summary
  console.log(`${updates.length} models need upstream_pricing update.`);
  if (DRY_RUN) {
    console.log("\n[DRY RUN] Pass --apply to write changes.");
    return;
  }

  // 6. Apply
  for (const u of updates) {
    const { error: upErr } = await sb
      .schema("inference")
      .from("models")
      .update({ upstream_pricing: u.upstream_pricing })
      .eq("model_id", u.model_id);
    if (upErr) {
      console.error(`Failed to update ${u.model_id}:`, upErr.message);
    } else {
      console.log(`✅ Updated ${u.model_id}`);
    }
  }
  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
