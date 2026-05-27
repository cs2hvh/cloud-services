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

interface ModelPricing {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
  cached_cents_per_mtok?: number;
}

interface ModelOffPeak {
  window_utc?: string;   // "HH:MM-HH:MM"
  discount_pct?: number;
}

interface PricingInfo {
  pricing: ModelPricing;
  off_peak: ModelOffPeak | null;
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
    .select("model_id, pricing, off_peak")
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
      off_peak: (m.off_peak ?? null) as ModelOffPeak | null,
    });
  }

  // 2. Build inference.usage rows with computed cost
  const rows = batch.messages.map((msg) => {
    const event = msg.body;
    const info = pricingMap.get(event.modelId);
    const { costCents, isOffPeak } = computeCost(event, info);

    return {
      org_id: event.orgId,
      api_key_id: event.apiKeyId,
      user_id: event.userId,
      model_id: event.modelId,
      modality: event.modality,
      request_id: event.requestId,
      billed_to: event.billedTo,
      input_tokens: event.inputTokens,
      output_tokens: event.outputTokens,
      cached_tokens: event.cachedTokens,
      num_units: event.numUnits,
      unit_label: event.unitLabel,
      cost_cents: costCents,
      // For Phase 1 the pass-through cost == billed cost (0% markup).
      // Phase 2 introduces markup logic; upstream_cost stays as the raw rate.
      upstream_cost_cents: costCents,
      is_off_peak: isOffPeak,
      latency_ms: event.latencyMs,
      ttft_ms: event.ttftMs,
      status: event.status,
      error_code: event.errorCode,
      cache_kind: event.cacheKind ?? "none",
      created_at: event.occurredAt,
    };
  });

  // 3. Batch insert
  const { error: insertErr } = await supabase
    .schema("inference")
    .from("usage")
    .insert(rows);

  if (insertErr) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "usage-consumer",
        message: "Failed to insert usage rows",
        count: rows.length,
        err: insertErr.message,
      })
    );
    batch.retryAll();
    return;
  }

  // 4. Increment per-org SPEND counter for the current month
  //    (the edge gateway reads this on every request for hard-cap enforcement)
  const month = new Date().toISOString().slice(0, 7);
  const spendByOrg = new Map<string, number>();
  for (const row of rows) {
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
  await fireSpendAlerts(env, totalsByOrg, month);

  batch.ackAll();

  console.log(
    JSON.stringify({
      level: "info",
      scope: "usage-consumer",
      message: "Flushed usage batch",
      count: rows.length,
      total_cents: rows.reduce((sum, r) => sum + r.cost_cents, 0),
    })
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
function computeCost(
  event: UsageEvent,
  info: PricingInfo | undefined
): { costCents: number; isOffPeak: boolean } {
  // Don't charge for non-success requests or unknown models
  if (!info || event.status !== "success") {
    return { costCents: 0, isOffPeak: false };
  }

  const p = info.pricing;
  const input = event.inputTokens ?? 0;
  const output = event.outputTokens ?? 0;
  const cached = event.cachedTokens ?? 0;
  const billableInput = Math.max(0, input - cached);

  const inputRate = p.input_cents_per_mtok ?? 0;
  const outputRate = p.output_cents_per_mtok ?? 0;
  const cachedRate = p.cached_cents_per_mtok ?? inputRate;

  const rawCents =
    (billableInput * inputRate) / 1_000_000 +
    (cached * cachedRate) / 1_000_000 +
    (output * outputRate) / 1_000_000;

  let discountPct = 0;
  let isOffPeak = false;
  const op = info.off_peak;
  if (op?.window_utc && op?.discount_pct) {
    const occurredAt = new Date(event.occurredAt);
    const mins = occurredAt.getUTCHours() * 60 + occurredAt.getUTCMinutes();
    const [startStr, endStr] = op.window_utc.split("-");
    if (startStr && endStr) {
      const [sh, sm] = startStr.split(":").map((s) => Number.parseInt(s, 10));
      const [eh, em] = endStr.split(":").map((s) => Number.parseInt(s, 10));
      if (
        Number.isFinite(sh) && Number.isFinite(sm) &&
        Number.isFinite(eh) && Number.isFinite(em)
      ) {
        const startMins = (sh ?? 0) * 60 + (sm ?? 0);
        const endMins = (eh ?? 0) * 60 + (em ?? 0);
        // Window may wrap midnight (start > end) — handle both
        const inWindow =
          startMins <= endMins
            ? mins >= startMins && mins < endMins
            : mins >= startMins || mins < endMins;
        if (inWindow) {
          discountPct = op.discount_pct;
          isOffPeak = true;
        }
      }
    }
  }

  const finalCents = Math.ceil(rawCents * (1 - discountPct / 100));
  return { costCents: finalCents, isOffPeak };
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
 */
async function fireSpendAlerts(
  env: Env,
  totalsByOrg: Map<string, { prev: number; next: number }>,
  month: string
): Promise<void> {
  if (totalsByOrg.size === 0) return;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-spend-alerts" } },
  });

  const orgIds = [...totalsByOrg.keys()];
  const { data: orgRows } = await supabase
    .schema("inference")
    .from("orgs")
    .select("id, monthly_budget_cents, hard_cap_cents")
    .in("id", orgIds)
    .returns<Array<{ id: string; monthly_budget_cents: number | null; hard_cap_cents: number | null }>>();

  if (!orgRows || orgRows.length === 0) return;

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
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "spend-alert",
        message: "Spend alert POST failed",
        err: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

function secondsUntilNextMonth(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.max(60, Math.floor((next.getTime() - now.getTime()) / 1000));
}
