/**
 * USAGE_EVENTS queue consumer.
 *
 * Drains usage events produced by the request path, looks up catalog
 * pricing per model, computes final cost (including off-peak discount),
 * batch-inserts into inference.usage, and increments the org SPEND counter
 * so the edge gateway sees up-to-date numbers on subsequent requests.
 *
 * Runs as the same Worker — Cloudflare invokes our exported queue() handler
 * with batches of messages independently from fetch() requests.
 */
import { createClient } from "@supabase/supabase-js";
import type { Env, UsageEvent } from "../types.ts";
// The same off-peak arithmetic GET /v1/models quotes from, so the price we
// publish and the price we charge cannot drift apart.
import {
  activeDiscountPct,
  unitRate,
  type ModelOffPeak,
  type ModelPricing,
} from "../lib/pricing.ts";

/**
 * Written to usage.error_code when a SUCCESSFUL request could not be priced
 * (model missing from inference.models, or a pricing JSON with no rates).
 * inference.usage has no metadata/jsonb column, so this is the only per-row
 * place to flag it. Find them: WHERE status = 'success' AND error_code = 'unpriced'.
 */
const UNPRICED_MARKER = "unpriced";

interface PricingInfo {
  pricing: ModelPricing;
  /**
   * What the upstream charges US, as opposed to what we charge the customer.
   *
   * Null when the model has no recorded cost basis, in which case
   * upstream_cost_cents falls back to the billed cost — the old Phase 1
   * behaviour, and still the honest answer for a model whose cost we do not
   * know.
   */
  upstream_pricing: ModelPricing | null;
  /**
   * Cost per partner, keyed by usage.provider ("starimg", "wokey"). Two
   * partners have two price lists; a request is costed by whoever served
   * it, and upstream_pricing is the fallback for a provider with no entry.
   */
  provider_pricing: Record<string, ModelPricing> | null;
  off_peak: ModelOffPeak | null;
}

/**
 * The cost basis for one event: the serving partner's own rates, if known.
 *
 * upstream_pricing is the single default blob and it has exactly one rightful
 * owner, the original partner (wokey); it is also what a request with no
 * partner (our own pods) falls back to. Any OTHER partner without an entry of
 * its own gets null, which computeCost records as "no cost basis" rather than
 * as whoever came before. Until 2026-09-25 a Starimg-served request on a
 * model with no Starimg rate was silently costed at Wokey's rate, and an
 * audn-served one at abliteration's, and both showed up as measured margin.
 */
export function upstreamPricingFor(info: PricingInfo, provider: string | null | undefined): ModelPricing | null {
  if (provider && info.provider_pricing && info.provider_pricing[provider]) return info.provider_pricing[provider]!;
  if (!provider || provider === "wokey") return info.upstream_pricing;
  return null;
}

export async function handleUsageBatch(
  batch: MessageBatch<UsageEvent>,
  env: Env
): Promise<void> {
  if (batch.messages.length === 0) return;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-usage-consumer" } },
  });

  // 1. Resolve pricing for every distinct model in the batch
  const modelIds = [...new Set(batch.messages.map((m) => m.body.modelId))];
  const { data: modelRows, error: modelErr } = await supabase
    .schema("inference")
    .from("models")
    .select("model_id, pricing, upstream_pricing, provider_pricing, off_peak")
    .in("model_id", modelIds);

  if (modelErr) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "usage-consumer",
        message: "Failed to fetch model pricing",
        err: modelErr.message,
      })
    );
    batch.retryAll();
    return;
  }

  const pricingMap = new Map<string, PricingInfo>();
  for (const m of modelRows ?? []) {
    pricingMap.set(m.model_id as string, {
      pricing: (m.pricing ?? {}) as ModelPricing,
      upstream_pricing: (m.upstream_pricing ?? null) as ModelPricing | null,
      provider_pricing: (m.provider_pricing ?? null) as Record<string, ModelPricing> | null,
      off_peak: (m.off_peak ?? null) as ModelOffPeak | null,
    });
  }

  // 2. Build inference.usage rows with computed cost
  let unpriced = 0;
  const rows = batch.messages.map((msg) => {
    const event = msg.body;
    const info = pricingMap.get(event.modelId);
    const { costCents, upstreamCostCents, isOffPeak } = computeCost(event, info);

    // A successful call we cannot price bills 0 while the upstream has already
    // been paid. Previously silent: no log, no counter, an ordinary-looking
    // row. Log it, count it, and mark the row so it can be found and
    // re-priced. Error rows are legitimately 0 and are not flagged.
    const isUnpriced =
      event.status === "success" && (!info || !hasUsablePricing(info.pricing));
    if (isUnpriced) {
      unpriced++;
      console.error(
        JSON.stringify({
          level: "error",
          scope: "usage-consumer",
          message: "Unpriced usage billed at 0",
          reason: info ? "no_pricing" : "unknown_model",
          model_id: event.modelId,
          org_id: event.orgId,
          request_id: event.requestId,
        })
      );
    }

    return {
      org_id: event.orgId,
      api_key_id: event.apiKeyId,
      user_id: event.userId,
      model_id: event.modelId,
      modality: event.modality,
      request_id: event.requestId,
      billed_to: event.billedTo,
      // Which partner answered. The column existed but nothing wrote it until
      // there were two partners to tell apart; margin per provider needs it.
      provider: event.upstreamProvider ?? null,
      input_tokens: event.inputTokens,
      output_tokens: event.outputTokens,
      cached_tokens: event.cachedTokens,
      num_units: event.numUnits,
      unit_label: event.unitLabel,
      cost_cents: costCents,
      // What the upstream charged US, priced from models.upstream_pricing.
      //
      // This used to be `costCents` — a literal copy of the billed amount,
      // left over from a Phase 1 where markup was 0% so the two genuinely were
      // equal. That stopped being true and nobody noticed: 2,074 of 2,083
      // historical rows have the two identical, so every margin figure ever
      // derived from this column has been exactly zero.
      //
      // Falls back to costCents when the model has no recorded cost basis,
      // which preserves the old behaviour rather than inventing a margin.
      upstream_cost_cents: upstreamCostCents,
      is_off_peak: isOffPeak,
      latency_ms: event.latencyMs,
      ttft_ms: event.ttftMs,
      status: event.status,
      // Success rows carry no error code, so the slot doubles as the unpriced
      // marker (see UNPRICED_MARKER). A real code, if any, is never overwritten.
      error_code: isUnpriced ? (event.errorCode ?? UNPRICED_MARKER) : event.errorCode,
      cache_kind: event.cacheKind ?? "none",
      created_at: event.occurredAt,
    };
  });

  // 3. Batch insert
  const { error: insertErr } = await supabase
    .schema("inference")
    .from("usage")
    .insert(rows);

  // The batch insert is all-or-nothing, so one event the table rejects used
  // to fail every event around it, and after three retries Cloudflare dropped
  // them all. That is how two days of hosted-pod usage vanished (2026-09-18
  // to 09-20: provider null against a NOT NULL column). When the batch is
  // refused, write the rows one at a time: the refused event is retried on
  // its own, logged with its request id, and everything else is kept.
  let inserted = rows;
  let ackedIndividually = false;
  if (insertErr) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "usage-consumer",
        message: "Batch insert refused; inserting rows one by one",
        count: rows.length,
        err: insertErr.message,
      })
    );
    ackedIndividually = true;
    inserted = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const msg = batch.messages[i]!;
      const { error } = await supabase.schema("inference").from("usage").insert(row);
      if (error) {
        console.error(
          JSON.stringify({
            level: "error",
            scope: "usage-consumer",
            message: "Usage row refused",
            request_id: row.request_id,
            model_id: row.model_id,
            err: error.message,
          })
        );
        msg.retry();
      } else {
        inserted.push(row);
        msg.ack();
      }
    }
    if (inserted.length === 0) return;
  }

  // 4. Increment per-org SPEND counter for the current month
  //    (the edge gateway reads this on every request for hard-cap enforcement)
  const month = new Date().toISOString().slice(0, 7);
  const spendByOrg = new Map<string, number>();
  for (const row of inserted) {
    spendByOrg.set(row.org_id, (spendByOrg.get(row.org_id) ?? 0) + row.cost_cents);
  }

  // Capture per-org { prev, next } so the threshold-alert pass below can
  // see which boundaries were crossed by THIS batch. Otherwise we'd
  // either re-read KV or miss the prev value.
  const totalsByOrg = new Map<string, { prev: number; next: number }>();
  await Promise.allSettled(
    [...spendByOrg.entries()].map(async ([orgId, addCents]) => {
      const key = `org:${orgId}:month:${month}`;
      const currentRaw = await env.SPEND.get(key);
      const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
      const prev = Number.isFinite(current) ? current : 0;
      const next = prev + addCents;
      totalsByOrg.set(orgId, { prev, next });
      // KV is eventually consistent; for hard-cap accuracy we don't need atomic CAS
      // at 100k req/hour scale. If we cross 10k RPS later, move to Durable Object.
      await env.SPEND.put(key, String(next));
    })
  );

  // 4b. Spend-threshold alerts — for each org that just bumped, check
  //     whether the new total crosses 80%/100% of the org's monthly
  //     budget OR 90%/100% of the hard cap. Dedup via KV so we never
  //     fire the same threshold twice in one month.
  const { orgsUnchecked } = await fireSpendAlerts(env, totalsByOrg, month);

  if (!ackedIndividually) batch.ackAll();

  console.log(
    JSON.stringify({
      level: "info",
      scope: "usage-consumer",
      message: "Flushed usage batch",
      count: inserted.length,
      refused: rows.length - inserted.length,
      total_cents: inserted.reduce((sum, r) => sum + r.cost_cents, 0),
      // Successful rows inserted at cost 0 because the model/pricing was
      // unknown — each one is also logged individually above.
      unpriced,
      // Orgs whose spend thresholds could not be evaluated this batch.
      spend_alert_orgs_unchecked: orgsUnchecked,
    })
  );
}

/**
 * True when the pricing JSON carries at least one numeric rate. The column
 * defaults to '{}', and rateCost's `?? 0` would price that as a free model.
 */
function hasUsablePricing(p: ModelPricing): boolean {
  return (
    Number.isFinite(p.input_cents_per_mtok) ||
    Number.isFinite(p.output_cents_per_mtok) ||
    unitRate(p, null) !== null
  );
}

/**
 * Compute the billable cost for one usage event in cents.
 *
 *   billable_input = max(0, input_tokens - cached_tokens)
 *   raw_cents = billable_input * input_rate / 1M
 *             + cached_tokens  * cached_rate / 1M
 *             + output_tokens  * output_rate / 1M
 *   final     = ceil(raw_cents * (1 - off_peak_discount/100))
 *
 * Rounded UP so micro-amounts don't round to zero and undercount.
 */
export function computeCost(
  event: UsageEvent,
  info: PricingInfo | undefined
): { costCents: number; upstreamCostCents: number | null; isOffPeak: boolean } {
  // Don't charge for non-success requests or unknown models.
  // Cost is zero too — a failed request still cost us nothing billable, and
  // recording a phantom upstream cost here would show negative margin.
  if (!info || event.status !== "success") {
    return { costCents: 0, upstreamCostCents: 0, isOffPeak: false };
  }

  // A media event carries units (images, seconds of video) instead of
  // tokens; the same discount and rounding apply on top.
  const rawCents = event.numUnits != null
    ? unitCost(event, info.pricing)
    : rateCost(event, info.pricing);

  // Window may wrap midnight; an unparseable window is no discount. Shared
  // with the catalog endpoint so both answer the same question the same way.
  const discountPct = activeDiscountPct(info.off_peak, new Date(event.occurredAt));
  const isOffPeak = discountPct > 0;

  const finalCents = Math.ceil(rawCents * (1 - discountPct / 100));

  // Upstream cost, priced from the SAME token counts against the upstream's
  // rates. Deliberately NOT discounted: an off-peak window is a concession we
  // make to the customer, not one the upstream makes to us, so applying it
  // here would understate cost and overstate margin during exactly the hours
  // margin is thinnest.
  const up = upstreamPricingFor(info, event.upstreamProvider);
  // No cost basis is recorded as NULL, never as "equal to the billed cost":
  // a sub-cent request bills 1 c and costs 1 c, so equality is the rounding
  // floor thousands of times a day and a marker nothing could decode
  // (2026-09-25: 5,205 of 5,210 "equal" Starimg rows were that floor).
  const upstreamCostCents = up
    ? Math.ceil(event.numUnits != null ? unitCost(event, up) : rateCost(event, up))
    : null;

  return { costCents: finalCents, upstreamCostCents, isOffPeak };
}

/**
 * Token-count × rate arithmetic, shared by the billed price and the upstream
 * cost so the two can never drift apart in how they treat cached tokens.
 * Returns raw (unrounded) cents — callers round.
 */
/**
 * Units × the per-unit rate for the tier the units were produced at. Raw
 * cents, unrounded, like rateCost. A media model with no unit rate prices
 * at zero and is flagged unpriced by the caller.
 */
function unitCost(event: UsageEvent, p: ModelPricing): number {
  const rate = unitRate(p, event.unitTier ?? null);
  if (rate === null) return 0;
  return (event.numUnits ?? 0) * rate;
}

function rateCost(event: UsageEvent, p: ModelPricing): number {
  const input = event.inputTokens ?? 0;
  const output = event.outputTokens ?? 0;
  const cached = event.cachedTokens ?? 0;
  const billableInput = Math.max(0, input - cached);

  const inputRate = p.input_cents_per_mtok ?? 0;
  const outputRate = p.output_cents_per_mtok ?? 0;
  const cachedRate = p.cached_cents_per_mtok ?? inputRate;

  return (
    (billableInput * inputRate) / 1_000_000 +
    (cached * cachedRate) / 1_000_000 +
    (output * outputRate) / 1_000_000
  );
}

// ────────────────────────────────────────────────────────────────────
// Spend threshold alerts
// ────────────────────────────────────────────────────────────────────

type ThresholdName = "budget_80" | "budget_100" | "cap_90" | "cap_100";

interface ThresholdSpec {
  name: ThresholdName;
  pct: number;
  source: "budget" | "cap";
}

const THRESHOLDS: ThresholdSpec[] = [
  { name: "budget_80", pct: 0.8, source: "budget" },
  { name: "budget_100", pct: 1.0, source: "budget" },
  { name: "cap_90", pct: 0.9, source: "cap" },
  { name: "cap_100", pct: 1.0, source: "cap" },
];

/**
 * Detects which spend thresholds (if any) the new batch caused each org
 * to cross, dedupes against KV, and fires one POST per crossing to the
 * control-plane internal endpoint. Best-effort throughout — alert
 * failures NEVER block the usage-batch ack.
 *
 * Returns how many orgs in the batch had NO threshold evaluation (cap lookup
 * failed, or the org row was missing) so the caller can count it: the KV
 * counters are already bumped, so a crossing missed here is never re-checked.
 */
async function fireSpendAlerts(
  env: Env,
  totalsByOrg: Map<string, { prev: number; next: number }>,
  month: string
): Promise<{ orgsUnchecked: number }> {
  if (totalsByOrg.size === 0) return { orgsUnchecked: 0 };

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-spend-alerts" } },
  });

  const orgIds = [...totalsByOrg.keys()];
  const { data: orgRows, error: orgErr } = await supabase
    .schema("inference")
    .from("orgs")
    .select("id, monthly_budget_cents, hard_cap_cents")
    .in("id", orgIds)
    .returns<Array<{ id: string; monthly_budget_cents: number | null; hard_cap_cents: number | null }>>();

  // A failed cap lookup used to discard `error` and return as if no threshold
  // was due. It is not "no alerts due" — it is "we don't know", and the org
  // owner may have just crossed their cap. Log and count it.
  if (orgErr || !orgRows) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "spend-alert",
        message: "Org cap lookup failed; spend thresholds not evaluated",
        org_ids: orgIds,
        err: orgErr?.message ?? "no rows returned",
      })
    );
    return { orgsUnchecked: orgIds.length };
  }

  const seen = new Set(orgRows.map((r) => r.id));
  const orgsUnchecked = orgIds.filter((id) => !seen.has(id)).length;
  if (orgsUnchecked > 0) {
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "spend-alert",
        message: "Orgs with usage but no inference.orgs row; thresholds not evaluated",
        org_ids: orgIds.filter((id) => !seen.has(id)),
      })
    );
  }
  if (orgRows.length === 0) return { orgsUnchecked };

  // Compute seconds until the end of the current UTC month — used as
  // the dedup-key TTL so alerts auto-reset on the 1st.
  const ttl = secondsUntilNextMonth();

  const work: Array<Promise<unknown>> = [];

  for (const row of orgRows) {
    const orgId = row.id;
    const totals = totalsByOrg.get(orgId);
    if (!totals) continue;

    const budget = row.monthly_budget_cents;
    const cap = row.hard_cap_cents;

    for (const spec of THRESHOLDS) {
      const sourceCap = spec.source === "budget" ? budget : cap;
      if (!sourceCap || sourceCap <= 0) continue;
      const triggerAt = Math.floor(sourceCap * spec.pct);
      const crossed = totals.prev < triggerAt && totals.next >= triggerAt;
      if (!crossed) continue;

      work.push(
        maybeFireOne(env, {
          orgId,
          threshold: spec.name,
          currentCents: totals.next,
          capCents: sourceCap,
          month,
          ttl,
        })
      );
    }
  }

  await Promise.allSettled(work);
  return { orgsUnchecked };
}

async function maybeFireOne(
  env: Env,
  input: {
    orgId: string;
    threshold: ThresholdName;
    currentCents: number;
    capCents: number;
    month: string;
    ttl: number;
  }
): Promise<void> {
  const dedupKey = `org:${input.orgId}:alert:${input.month}:${input.threshold}`;
  const existing = await env.SPEND.get(dedupKey);
  if (existing) return; // already fired this month — skip

  // Mark first so a concurrent isolate also processing the same batch
  // doesn't double-fire. KV is eventually consistent; the race window
  // is tiny and the cost of a dupe is one extra email.
  await env.SPEND.put(dedupKey, "1", { expirationTtl: input.ttl });

  const url = `${env.CONTROL_PLANE_URL.replace(/\/+$/, "")}/api/inference/internal/spend-alert`;
  const token = env.BATCH_PROCESSOR_TOKEN ?? env.INTERNAL_CRON_TOKEN;
  if (!token) {
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "spend-alert",
        message: "No BATCH_PROCESSOR_TOKEN configured; skipping alert fan-out",
      })
    );
    return;
  }

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ahura-internal-token": token,
      },
      body: JSON.stringify({
        org_id: input.orgId,
        threshold: input.threshold,
        current_cents: input.currentCents,
        cap_cents: input.capCents,
        month: input.month,
      }),
    });
    if (!r.ok) {
      console.warn(
        JSON.stringify({
          level: "warn",
          scope: "spend-alert",
          message: "Control plane returned non-2xx for spend alert",
          status: r.status,
          org_id: input.orgId,
          threshold: input.threshold,
        })
      );
      // Roll back the dedup mark so a later batch retries delivery. We marked
      // BEFORE sending to avoid double-fire; without this rollback a failed
      // delivery would suppress the alert for the whole month (org owner never
      // learns they crossed the cap). A retry risks at most one duplicate.
      await env.SPEND.delete(dedupKey);
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "spend-alert",
        message: "Spend alert POST failed",
        org_id: input.orgId,
        threshold: input.threshold,
        err: err instanceof Error ? err.message : String(err),
      })
    );
    // Roll back the dedup mark so the alert is retried next batch (see above).
    await env.SPEND.delete(dedupKey);
  }
}

function secondsUntilNextMonth(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.max(60, Math.floor((next.getTime() - now.getTime()) / 1000));
}
