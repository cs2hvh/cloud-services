/**
 * health-check-models.ts
 *
 * Calls every active model in inference.models through OUR gateway and
 * deactivates the ones that cannot answer. Replaces hand-written "deactivate
 * these ids" migrations: upstream drifts constantly, so this is a re-runnable
 * reconcile, not a one-off.
 *
 * WHY NOT just diff against the upstream catalog (as sync-or-model-pricing.ts
 * does)? Measured 2026-07-28: that signal had 18 false positives and 2 false
 * negatives against 83 rows.
 *   - False positives: openai/text-embedding-3-small, baai/bge-m3,
 *     ahura/rerank-m3 and the video models are absent from the upstream
 *     /models list because it enumerates CHAT models only — they are served
 *     through other upstream paths and work fine. Deactivating on that signal
 *     would have disabled embeddings and taken down the whole RAG stack.
 *   - False negatives: models that ARE listed upstream but still fail when
 *     actually called.
 * The only trustworthy signal is behaviour: does the model answer?
 *
 * SAFETY, in two layers, because a naive version of this script is dangerous:
 *   1. Only a 4xx whose BODY says the model is unknown/withdrawn deactivates a
 *      row. A 400 that says anything else is reported as `suspect` and left
 *      alone — it is far more likely to be our probe body disagreeing with that
 *      model's parameter rules. Real example: perplexity/sonar requires
 *      max_tokens >= 16 and 400s below that, so a max_tokens=1 probe made two
 *      perfectly working models look dead.
 *   2. 402/429/5xx/network/timeout are transient and never deactivate anything,
 *      so an upstream incident (or an org hitting its spend cap) cannot
 *      mass-disable the catalog.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   INFERENCE_BASE_URL=http://localhost:8787/v1 \
 *   INFERENCE_API_KEY=<a normal org key> \
 *     npx tsx scripts/health-check-models.ts [--apply] [--include-inactive]
 *
 *   # or with a platform (is_internal_service) key, which needs an org to bill:
 *   INFERENCE_PLATFORM_KEY=... PROBE_ORG_ID=<uuid> npx tsx scripts/health-check-models.ts
 *
 * Without --apply: dry-run (probes and reports, writes nothing).
 * With --apply:    sets is_active=false on models that deterministically fail.
 * --include-inactive also probes disabled rows and reports ones that now work,
 * so a model fixed upstream can be re-enabled deliberately.
 *
 * COST: one minimal request per model (max_tokens=16 / a 2-char embedding
 * input). Generative modalities (image/video/audio/ocr) are SKIPPED, not
 * guessed at — probing them is slow and genuinely expensive.
 */

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = !process.argv.includes("--apply");
const INCLUDE_INACTIVE = process.argv.includes("--include-inactive");

const BASE_URL = (process.env.INFERENCE_BASE_URL ?? "http://localhost:8787/v1").replace(/\/+$/, "");
const API_KEY = process.env.INFERENCE_API_KEY ?? process.env.INFERENCE_PLATFORM_KEY ?? "";
const PROBE_ORG_ID = process.env.PROBE_ORG_ID ?? "";
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 45_000);
/** Bounded so a health check never behaves like a load test. */
const CONCURRENCY = Number(process.env.PROBE_CONCURRENCY ?? 4);

type Verdict = "ok" | "broken" | "suspect" | "transient" | "skipped";

/**
 * Providers reject a minimum completion length — perplexity/sonar demands
 * max_tokens >= 16. Probing with 1 made it return 400 and look dead when it
 * answers perfectly at 16 (caught while reviewing this script; probing with 1
 * would have deactivated two WORKING models). 16 is the smallest value known
 * to satisfy every provider in the catalog.
 */
const PROBE_MAX_TOKENS = 16;

/**
 * A 400/404 only proves the model is gone when the upstream SAYS so. Anything
 * else with those codes is far more likely to be our probe body disagreeing
 * with that model's parameter rules, so it is reported as `suspect` and never
 * auto-deactivated.
 */
const UNKNOWN_MODEL_PATTERNS = [
  /is not a valid model id/i,
  /does not exist/i,
  /no endpoints found/i,
  /is deprecated/i,
  /model_not_found/i,
  /unknown model/i,
];

interface ModelRow {
  model_id: string;
  modality: string;
  serving_type: string;
  is_active: boolean;
}

interface Result {
  model: ModelRow;
  verdict: Verdict;
  status: number | null;
  detail: string;
}

/** Which endpoint proves this modality works, or null to skip it. */
function probeFor(modality: string): { path: string; body: (id: string) => unknown } | null {
  switch (modality) {
    case "chat":
    case "text":
      return {
        path: "/chat/completions",
        body: (id) => ({
          model: id,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: PROBE_MAX_TOKENS,
        }),
      };
    case "embedding":
    case "embeddings":
      return { path: "/embeddings", body: (id) => ({ model: id, input: "ok" }) };
    case "rerank":
      return {
        path: "/rerank",
        body: (id) => ({ model: id, query: "ok", documents: ["ok"], top_n: 1 }),
      };
    default:
      // image / video / audio / ocr — a real probe costs real money and takes
      // tens of seconds. Reported as skipped rather than guessed at.
      return null;
  }
}

/**
 * Only a 400/404 whose body explicitly says the model is unknown or withdrawn
 * counts as broken. A 400 that says something else is our probe body arguing
 * with that model's parameter rules -> `suspect`, reported but never acted on.
 * Everything else (429, 402, 5xx, network, timeout) is the upstream having a
 * bad moment and must never deactivate a row.
 */
function classify(status: number, body: string): Verdict {
  if (status >= 200 && status < 300) return "ok";
  if (status === 400 || status === 404) {
    return UNKNOWN_MODEL_PATTERNS.some((re) => re.test(body)) ? "broken" : "suspect";
  }
  return "transient";
}

async function probe(model: ModelRow): Promise<Result> {
  const spec = probeFor(model.modality);
  if (!spec) return { model, verdict: "skipped", status: null, detail: `modality=${model.modality}` };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
  // A platform key is is_internal_service and refuses to run without an org to
  // attribute the call to; a normal org key must NOT send this header.
  if (process.env.INFERENCE_PLATFORM_KEY && !process.env.INFERENCE_API_KEY && PROBE_ORG_ID) {
    headers["X-Ahura-On-Behalf-Of-Org"] = PROBE_ORG_ID;
  }

  const attempt = async (): Promise<{ status: number; text: string }> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}${spec.path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(spec.body(model.model_id)),
        signal: ctrl.signal,
      });
      return { status: res.status, text: (await res.text()).slice(0, 200) };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let { status, text } = await attempt();
    // Retry once on a transient class before believing it — a single 503
    // during a deploy should not show up as a failure in the report.
    if (classify(status, text) === "transient") {
      await new Promise((r) => setTimeout(r, 1500));
      ({ status, text } = await attempt());
    }
    return { model, verdict: classify(status, text), status, detail: text };
  } catch (err) {
    return {
      model,
      verdict: "transient",
      status: null,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Simple bounded worker pool — no dependency, no unbounded fan-out. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!);
      }
    })
  );
  return out;
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }
  if (!API_KEY) {
    console.error("ERROR: set INFERENCE_API_KEY (an org key), or INFERENCE_PLATFORM_KEY + PROBE_ORG_ID.");
    process.exit(1);
  }
  if (process.env.INFERENCE_PLATFORM_KEY && !process.env.INFERENCE_API_KEY && !PROBE_ORG_ID) {
    console.error("ERROR: INFERENCE_PLATFORM_KEY needs PROBE_ORG_ID (it bills on-behalf-of an org).");
    process.exit(1);
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let query = sb
    .schema("inference")
    .from("models")
    .select("model_id, modality, serving_type, is_active")
    .is("org_id", null); // shared catalog only — never probe a customer's private adapter
  if (!INCLUDE_INACTIVE) query = query.eq("is_active", true);

  const { data: models, error } = await query.returns<ModelRow[]>();
  if (error) {
    console.error("DB fetch failed:", error.message);
    process.exit(1);
  }
  if (!models?.length) {
    console.log("No models to probe.");
    return;
  }

  console.log(`Probing ${models.length} models via ${BASE_URL} (concurrency ${CONCURRENCY})...\n`);
  const results = await mapLimit(models, CONCURRENCY, probe);

  const ok = results.filter((r) => r.verdict === "ok");
  const broken = results.filter((r) => r.verdict === "broken" && r.model.is_active);
  const suspect = results.filter((r) => r.verdict === "suspect");
  const transient = results.filter((r) => r.verdict === "transient");
  const skipped = results.filter((r) => r.verdict === "skipped");
  const revivable = results.filter((r) => r.verdict === "ok" && !r.model.is_active);

  if (broken.length) {
    console.log(`BROKEN — active but the model cannot answer (${broken.length}):`);
    for (const r of broken) console.log(`  ❌ ${r.model.model_id}  [${r.status}] ${r.detail.slice(0, 90)}`);
    console.log();
  }
  if (suspect.length) {
    console.log(`SUSPECT — 4xx that does NOT say the model is unknown; probably a`);
    console.log(`parameter mismatch in the probe, so NOT deactivated (${suspect.length}):`);
    for (const r of suspect) console.log(`  ❓ ${r.model.model_id}  [${r.status}] ${r.detail.slice(0, 90)}`);
    console.log();
  }
  if (transient.length) {
    console.log(`TRANSIENT — not acted on, re-run to confirm (${transient.length}):`);
    for (const r of transient) console.log(`  ⚠️  ${r.model.model_id}  [${r.status ?? "net"}]`);
    console.log();
  }
  if (revivable.length) {
    console.log(`REVIVABLE — currently disabled but answering (${revivable.length}):`);
    for (const r of revivable) console.log(`  ↩️  ${r.model.model_id}`);
    console.log("  (re-enable deliberately; this script never re-activates)\n");
  }
  if (skipped.length) {
    const byModality = skipped.reduce<Record<string, number>>((acc, r) => {
      acc[r.model.modality] = (acc[r.model.modality] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`SKIPPED — no cheap probe for these modalities: ${JSON.stringify(byModality)}\n`);
  }

  console.log(
    `${ok.length} ok · ${broken.length} broken · ${suspect.length} suspect · ` +
      `${transient.length} transient · ${skipped.length} skipped`
  );

  if (!broken.length) {
    console.log("\nNothing to deactivate.");
    return;
  }
  if (DRY_RUN) {
    console.log("\n[DRY RUN] Pass --apply to deactivate the broken models.");
    return;
  }

  for (const r of broken) {
    const { error: upErr } = await sb
      .schema("inference")
      .from("models")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("model_id", r.model.model_id);
    if (upErr) console.error(`Failed to deactivate ${r.model.model_id}:`, upErr.message);
    else console.log(`✅ Deactivated ${r.model.model_id}`);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
