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

  await Promise.allSettled(
    [...spendByOrg.entries()].map(async ([orgId, addCents]) => {
      const key = `org:${orgId}:month:${month}`;
      const currentRaw = await env.SPEND.get(key);
      const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
      const next = (Number.isFinite(current) ? current : 0) + addCents;
      // KV is eventually consistent; for hard-cap accuracy we don't need atomic CAS
      // at 100k req/hour scale. If we cross 10k RPS later, move to Durable Object.
      await env.SPEND.put(key, String(next));
    })
  );

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
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
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
