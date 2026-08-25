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

export interface ModelPricing {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
  cached_cents_per_mtok?: number;
  // Per-unit multimodal modalities.
  cents_per_image?: number;
  cents_per_1k_chars?: number;
  cents_per_audio_minute?: number;
  cents_per_media_second?: number;
  cents_per_page?: number;
  cents_per_1k_rerank?: number;
  cents_per_1k_moderation?: number;
  // Agent (agentcore) hosted-tool unit rates. Priced by pseudo-catalog rows
  // (agent/web-search, agent/code-interpreter, agent/function-call,
  // agent/file-search, and agent/memory — ONE row carrying both
  // cents_per_memory_write and cents_per_memory_search) so agent tool steps
  // flow through this same pipeline — no parallel queue (doc 09 §2.B).
  cents_per_web_search?: number;
  cents_per_cpu_second?: number;
  cents_per_function_call?: number;
  cents_per_file_search?: number;
  cents_per_memory_write?: number;
  cents_per_memory_search?: number;
  // Agent MCP client tool call (agent/mcp, doc 14 M2). PENDING_FINANCE.
  cents_per_mcp_call?: number;
}

interface ModelOffPeak {
  window_utc?: string;   // "HH:MM-HH:MM"
  discount_pct?: number;
}

export interface PricingInfo {
  pricing: ModelPricing;
  off_peak: ModelOffPeak | null;
  // What OR actually charges us (scripts/sync-or-model-pricing.ts), separate
  // from `pricing` (what we charge the customer, curated, includes markup).
  // null until synced for a given model, or for pseudo-catalog agent/* rows
  // that were never meant to carry one — see computeCost's fallback below.
  upstreamPricing: ModelPricing | null;
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
    .select("model_id, pricing, off_peak, upstream_pricing")
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
      upstreamPricing: (m.upstream_pricing ?? null) as ModelPricing | null,
    });
  }

  // 2. Build inference.usage rows with computed cost. normalizeNumUnits
  // (below) rounds a fractional numUnits up before it touches either the
  // cost computation or the row, so cost_cents and the stored num_units
  // stay mutually consistent.
  const rows = batch.messages.map((msg) => {
    const event = normalizeNumUnits(msg.body);
    const info = pricingMap.get(event.modelId);
    const { costCents, isOffPeak, upstreamCostCents } = computeCost(event, info);

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
      // Real margin once upstream_pricing is synced for this model
      // (scripts/sync-or-model-pricing.ts); falls back to costCents — the
      // old Phase-1 pass-through — for any model that isn't synced yet, or
      // was never meant to carry one (agent/* pseudo-catalog rows). That
      // fallback is deliberate: reporting upstream_cost_cents=0 for an
      // unmeasured model would show 100% margin, a worse lie than 0% for a
      // number nobody has verified either way.
      upstream_cost_cents: upstreamCostCents,
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
 * Token-based modalities (chat, completion, embedding):
 *   billable_input = max(0, input_tokens - cached_tokens)
 *   raw_cents = billable_input * input_rate / 1M
 *             + cached_tokens  * cached_rate / 1M
 *             + output_tokens  * output_rate / 1M
 *   final     = ceil(raw_cents * (1 - off_peak_discount/100))
 *
 * Per-unit modalities:
 *   image:        ceil(images * cents_per_image)
 *   tts_char:     ceil(chars / 1000 * cents_per_1k_chars)
 *   stt_second:   ceil(seconds / 60 * cents_per_audio_minute)
 *   video/music:  ceil(seconds * cents_per_media_second)
 *   ocr_page:     ceil(pages * cents_per_page)
 *   rerank_unit:  ceil(docs / 1000 * cents_per_1k_rerank)
 *   moderation:   ceil(items / 1000 * cents_per_1k_moderation)
 *   No off-peak discount applies (flat rate).
 *
 * Also returns upstreamCostCents (found broken live, 2026-07-15 Phase-0
 * audit — used to unconditionally equal costCents, so margin reporting read
 * exactly $0 forever): the same formula run against `upstream_pricing`
 * instead of `pricing`, NEVER off-peak-discounted (that discount is ours to
 * give, not a change in what the upstream provider bills us). Falls back to
 * costCents when a model has no synced upstream_pricing yet — a deliberate
 * "unmeasured, not free" default; the alternative (0) would read as 100%
 * margin, a worse lie for a number nobody has actually verified.
 *
 * Rounded UP so micro-amounts don't round to zero and undercount.
 */
/** Raw (pre-discount) token cost in cents against a given rate card —
 *  shared by the customer-facing computation (off-peak-discounted below)
 *  and the upstream one (never discounted; the off-peak promotion is ours,
 *  it doesn't change what the upstream provider actually charges us). */
function rawTokenCostCents(pricing: ModelPricing, event: UsageEvent): number {
  const input = event.inputTokens ?? 0;
  const output = event.outputTokens ?? 0;
  const cached = event.cachedTokens ?? 0;
  const billableInput = Math.max(0, input - cached);

  const inputRate = pricing.input_cents_per_mtok ?? 0;
  const outputRate = pricing.output_cents_per_mtok ?? 0;
  const cachedRate = pricing.cached_cents_per_mtok ?? inputRate;

  return (
    (billableInput * inputRate) / 1_000_000 +
    (cached * cachedRate) / 1_000_000 +
    (output * outputRate) / 1_000_000
  );
}

/** True if a pricing object actually carries at least one real rate — used
 *  to tell "upstream_pricing not synced yet" apart from "synced, all-zero"
 *  (which would be a genuine data bug worth NOT silently swallowing into
 *  the same 0-means-unmeasured fallback). */
function hasAnyRate(pricing: ModelPricing | null): pricing is ModelPricing {
  if (!pricing) return false;
  return Object.values(pricing).some((v) => typeof v === "number" && v > 0);
}

export function computeCost(
  event: UsageEvent,
  info: PricingInfo | undefined
): { costCents: number; isOffPeak: boolean; upstreamCostCents: number } {
  // Don't charge for non-success requests or unknown models
  if (!info || event.status !== "success") {
    return { costCents: 0, isOffPeak: false, upstreamCostCents: 0 };
  }

  // Per-unit modalities bypass the token-based path entirely.
  if (isPerUnitLabel(event.unitLabel)) {
    const costCents = computeUnitCost(event, info.pricing);
    const upstreamCostCents = hasAnyRate(info.upstreamPricing)
      ? computeUnitCost(event, info.upstreamPricing)
      : costCents; // not synced / not applicable to this row — see PricingInfo doc comment
    return { costCents, isOffPeak: false, upstreamCostCents };
  }

  const rawCents = rawTokenCostCents(info.pricing, event);

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

  // Never discounted — off-peak is a promotion on what WE charge, not a
  // change in what the upstream provider bills us for the same tokens.
  const upstreamCostCents = hasAnyRate(info.upstreamPricing)
    ? Math.ceil(rawTokenCostCents(info.upstreamPricing, event))
    : finalCents; // not synced yet — see PricingInfo doc comment

  return { costCents: finalCents, isOffPeak, upstreamCostCents };
}

/**
 * inference.usage.num_units is INTEGER — but cpu_second (code interpreter) is
 * naturally fractional (a fast script might run 0.0002s). Found live,
 * 2026-07-06: the raw fractional value failed the row INSERT with "invalid
 * input syntax for type integer", and the queue DROPPED the message after 4
 * retries — a real, silent loss, not a delay. Ceil (not round) so a
 * sub-1-unit execution still bills/records as 1 — same "never round a
 * micro-amount down to zero" rule computeCost already applies to cost_cents,
 * applied here to the unit count too. Exported for unit testing.
 */
export function normalizeNumUnits(event: UsageEvent): UsageEvent {
  if (event.numUnits == null || Number.isInteger(event.numUnits)) return event;
  return { ...event, numUnits: Math.ceil(event.numUnits) };
}

/**
 * Per-unit cost for multimodal + agentcore tool services. Flat rate — no
 * off-peak discount. Exported for unit testing the metering contract.
 */
export function computeUnitCost(event: UsageEvent, pricing: ModelPricing): number {
  const units = event.numUnits ?? 0;
  if (units <= 0) return 0;
  switch (event.unitLabel) {
    case "image":
      return Math.ceil(units * (pricing.cents_per_image ?? 0));
    case "tts_char":
      return Math.ceil((units / 1000) * (pricing.cents_per_1k_chars ?? 0));
    case "stt_second":
      return Math.ceil((units / 60) * (pricing.cents_per_audio_minute ?? 0));
    case "video_second":
    case "music_second":
      return Math.ceil(units * (pricing.cents_per_media_second ?? 0));
    case "ocr_page":
      return Math.ceil(units * (pricing.cents_per_page ?? 0));
    case "rerank_unit":
      return Math.ceil((units / 1000) * (pricing.cents_per_1k_rerank ?? 0));
    case "moderation":
      return Math.ceil((units / 1000) * (pricing.cents_per_1k_moderation ?? 0));
    // Agentcore hosted-tool units. web_search: per search; cpu_second: per
    // microVM CPU-second (code interpreter); function_call: per webhook call;
    // file_search: per RAG query; memory_write/memory_search: per agent-memory
    // write/recall (memory_search also covers the runner's automatic recall).
    case "web_search":
      return Math.ceil(units * (pricing.cents_per_web_search ?? 0));
    case "cpu_second":
      return Math.ceil(units * (pricing.cents_per_cpu_second ?? 0));
    case "function_call":
      return Math.ceil(units * (pricing.cents_per_function_call ?? 0));
    case "file_search":
      return Math.ceil(units * (pricing.cents_per_file_search ?? 0));
    case "memory_write":
      return Math.ceil(units * (pricing.cents_per_memory_write ?? 0));
    case "memory_search":
      return Math.ceil(units * (pricing.cents_per_memory_search ?? 0));
    case "mcp_call":
      return Math.ceil(units * (pricing.cents_per_mcp_call ?? 0));
    default:
      return 0;
  }
}

function isPerUnitLabel(label: string | null): boolean {
  return (
    label === "image" ||
    label === "tts_char" ||
    label === "stt_second" ||
    label === "video_second" ||
    label === "music_second" ||
    label === "ocr_page" ||
    label === "rerank_unit" ||
    label === "moderation" ||
    label === "web_search" ||
    label === "cpu_second" ||
    label === "function_call" ||
    label === "file_search" ||
    label === "memory_write" ||
    label === "memory_search" ||
    label === "mcp_call"
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
