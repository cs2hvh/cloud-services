/**
 * repair-upstream-model-ids.ts
 *
 * Restores `inference.models.upstream_model_id` to the OpenRouter form for rows
 * that carry a non-OpenRouter id.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Found 2026-08-26: 29 of 46 active chat models had `upstream_model_id` with no
 * vendor prefix — 'claude-sonnet-4-6' where OpenRouter expects
 * 'anthropic/claude-sonnet-4.6'. All 29 matched Wokey's catalog exactly, so a
 * supplier's ids had been written into the shared column. Verified live:
 *
 *     claude-sonnet-4-6            -> HTTP 400 "is not a valid model ID"
 *     anthropic/claude-sonnet-4.6  -> HTTP 200
 *
 * Two things were broken by it:
 *
 *   1. scripts/sync-or-model-pricing.ts looks models up BY this column, so it
 *      could not find them and their `upstream_pricing` still holds Wokey's
 *      prices. The admin screen therefore reported ~80% margin on traffic that
 *      actually earns 0% (we charge 100c/500c per Mtok for haiku-4.5 and the
 *      recorded cost was Wokey's 20c/100c, not OpenRouter's 100c/500c).
 *
 *   2. Any route that forwards `upstream_model_id` would 400. Chat happens to
 *      forward the catalog id instead, which is why this was survivable.
 *
 * WHAT IT DOES
 * ────────────
 * For every proxy model whose `upstream_model_id` has no '/', set it to
 * `model_id` — which for these rows IS the OpenRouter id (that is the 200
 * above), and is exactly what migration 20260825000002 already used when it
 * seeded the OpenRouter routes.
 *
 * BUT ONLY WHEN OPENROUTER ACTUALLY CARRIES THAT MODEL. Four of the 29 found
 * on 2026-08-26 — zhipu/glm-5.1, glm-5.2, glm-5.3 and
 * bytedance/doubao-seed-2.1-turbo — do not exist in OpenRouter's catalog at
 * all. They were added for Wokey. "Repairing" those would swap a 400 for a
 * 404: still broken, just differently. They are reported and left alone, and
 * the right answer for them is a Wokey route (or deactivation), not a rewrite.
 *
 * It does NOT delete the Wokey ids: they belong on a `wokey` row in
 * inference.model_routes, which scripts/sync-wokey-catalog.ts creates.
 *
 * AFTER RUNNING THIS, run in order:
 *   npx tsx scripts/sync-or-model-pricing.ts --apply     # real OpenRouter costs
 *   npx tsx scripts/sync-wokey-catalog.ts --apply        # Wokey ids + prices, disabled
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/repair-upstream-model-ids.ts [--apply]
 *
 * Dry-run unless --apply.
 */
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  const sbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl) { console.error("SUPABASE_URL not set"); process.exit(1); }
  if (!sbKey) { console.error("SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(1); }

  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
  const { data, error } = await sb
    .schema("inference")
    .from("models")
    .select("model_id, upstream_model_id, modality, is_active")
    .eq("serving_type", "proxy")
    .returns<Array<{ model_id: string; upstream_model_id: string | null; modality: string; is_active: boolean }>>();
  if (error) { console.error("DB read failed:", error.message); process.exit(1); }

  const suspect = (data ?? []).filter((m) => m.upstream_model_id && !m.upstream_model_id.includes("/"));
  console.log(`proxy models: ${data?.length ?? 0}`);
  console.log(`with a non-OpenRouter upstream_model_id: ${suspect.length}`);
  if (suspect.length === 0) { console.log("Nothing to repair."); return; }

  // Only rewrite to an id OpenRouter actually serves.
  const orResp = await fetch("https://openrouter.ai/api/v1/models");
  if (!orResp.ok) { console.error("OpenRouter catalog fetch failed:", orResp.status); process.exit(1); }
  const orIds = new Set(
    ((await orResp.json()) as { data: Array<{ id: string }> }).data.map((m) => m.id),
  );

  const broken = suspect.filter((m) => orIds.has(m.model_id));
  const wokeyOnly = suspect.filter((m) => !orIds.has(m.model_id));

  console.log(`  repairable (OpenRouter carries model_id): ${broken.length}`);
  console.log(`  NOT on OpenRouter — left alone          : ${wokeyOnly.length}\n`);

  for (const m of broken) {
    console.log(`  ${m.upstream_model_id}  ->  ${m.model_id}   (${m.modality}${m.is_active ? "" : ", inactive"})`);
  }
  if (wokeyOnly.length) {
    console.log("\nNOT repaired — OpenRouter does not carry these. They cannot be served by");
    console.log("the default supplier at all; give them a Wokey route or deactivate them:");
    for (const m of wokeyOnly) {
      console.log(`  ${m.model_id}${m.is_active ? "   [ACTIVE — currently failing]" : "   (inactive)"}`);
    }
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] ${broken.length} row(s) would be updated. Pass --apply.`);
    return;
  }

  let ok = 0;
  for (const m of broken) {
    const { error: upErr } = await sb
      .schema("inference")
      .from("models")
      .update({ upstream_model_id: m.model_id })
      .eq("model_id", m.model_id);
    if (upErr) console.error(`  failed ${m.model_id}: ${upErr.message}`);
    else ok++;
  }
  console.log(`\nRepaired ${ok}/${broken.length}.`);
  console.log("Now run: sync-or-model-pricing.ts --apply, then sync-wokey-catalog.ts --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
