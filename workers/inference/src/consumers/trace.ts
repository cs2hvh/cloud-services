/**
 * TRACE_EVENTS queue consumer — Phase 3 S1/S2.
 *
 * Drains TraceSpan events produced by the gateway request path and
 * batch-inserts them into inference.trace_spans.
 *
 * Cost: the gateway always emits costCents=0 (it doesn't have access to
 * catalog pricing at request time). The consumer resolves model pricing
 * here — same query/formula as the usage consumer — so trace_spans.cost_cents
 * is accurate and consistent with inference.usage.cost_cents.
 *
 * R2 payload capture (Phase 3 S2): when span.payload is non-null the consumer
 * writes it to PAYLOAD_BUCKET under spans/{orgId}/{traceId}/{requestId}.json
 * and stores the key in payload_ref for trace-replay from the dashboard.
 * ZDR keys never set span.payload (hard-gated in shouldSamplePayload).
 */
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";
import type { TraceSpan } from "../lib/trace.ts";

interface ModelPricing {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
  cached_cents_per_mtok?: number;
  cents_per_image?: number;
  cents_per_1k_chars?: number;
  cents_per_audio_minute?: number;
  cents_per_media_second?: number;
  cents_per_page?: number;
  cents_per_1k_rerank?: number;
  cents_per_1k_moderation?: number;
}

function computeTraceCost(
  inputTokens: number | null,
  outputTokens: number | null,
  numUnits: number | null,
  unitLabel: string | null,
  pricing: ModelPricing | null
): number {
  if (!pricing) return 0;

  // Per-unit models (image, audio, rerank, etc.)
  if (numUnits != null && unitLabel) {
    const u = numUnits;
    switch (unitLabel) {
      case "image":        return Math.ceil(u * (pricing.cents_per_image ?? 0));
      case "tts_char":     return Math.ceil((u / 1000) * (pricing.cents_per_1k_chars ?? 0));
      case "stt_second":   return Math.ceil((u / 60) * (pricing.cents_per_audio_minute ?? 0));
      case "video_second":
      case "music_second": return Math.ceil(u * (pricing.cents_per_media_second ?? 0));
      case "ocr_page":     return Math.ceil(u * (pricing.cents_per_page ?? 0));
      case "rerank_unit":  return Math.ceil((u / 1000) * (pricing.cents_per_1k_rerank ?? 0));
      case "moderation":   return Math.ceil((u / 1000) * (pricing.cents_per_1k_moderation ?? 0));
    }
  }

  // Token-based models (chat, embed)
  if (inputTokens == null && outputTokens == null) return 0;
  const rawCents =
    ((inputTokens ?? 0) * (pricing.input_cents_per_mtok ?? 0)) / 1_000_000 +
    ((outputTokens ?? 0) * (pricing.output_cents_per_mtok ?? 0)) / 1_000_000;
  return Math.ceil(rawCents);
}

export async function handleTraceBatch(
  batch: MessageBatch<TraceSpan>,
  env: Env
): Promise<void> {
  if (batch.messages.length === 0) return;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-trace-consumer" } },
  });

  // Resolve model pricing for all distinct models in this batch
  const modelIds = [...new Set(batch.messages.map((m) => m.body.modelId).filter(Boolean))] as string[];
  const pricingMap = new Map<string, ModelPricing>();

  if (modelIds.length > 0) {
    const { data: models } = await supabase
      .schema("inference")
      .from("models")
      .select("model_id, pricing")
      .in("model_id", modelIds);

    for (const m of models ?? []) {
      if (m.pricing) pricingMap.set(m.model_id as string, m.pricing as ModelPricing);
    }
  }

  // Phase 3 S2 — write sampled payloads to R2 before building the DB rows.
  // Failures are soft: a bad R2 write skips payload_ref but the span still lands.
  const payloadRefs = new Map<string, string>();
  await Promise.allSettled(
    batch.messages
      .filter((m) => m.body.payload != null)
      .map(async (m) => {
        const s = m.body;
        const key = `spans/${s.orgId}/${s.traceId}/${s.requestId}.json`;
        try {
          await env.PAYLOAD_BUCKET.put(key, JSON.stringify(s.payload), {
            httpMetadata: { contentType: "application/json" },
          });
          payloadRefs.set(s.requestId, key);
        } catch (err) {
          console.warn(
            JSON.stringify({
              level: "warn",
              scope: "trace-consumer",
              message: "R2 payload write failed — span will be inserted without payload_ref",
              requestId: s.requestId,
              err: String(err),
            })
          );
        }
      })
  );

  const rows = batch.messages.map((msg) => {
    const s = msg.body;
    const pricing = s.modelId ? (pricingMap.get(s.modelId) ?? null) : null;
    const costCents = computeTraceCost(s.inputTokens ?? null, s.outputTokens ?? null, s.numUnits ?? null, s.unitLabel ?? null, pricing);

    return {
      org_id:           s.orgId,
      trace_id:         s.traceId,
      parent_span_id:   s.parentSpanId ?? null,
      api_key_id:       s.apiKeyId ?? null,
      request_id:       s.requestId,
      name:             s.name,
      model_id:         s.modelId ?? null,
      prompt_id:        s.promptId ?? null,
      prompt_version:   s.promptVersion ?? null,
      experiment_id:    s.experimentId ?? null,
      arm:              s.arm ?? null,
      input_tokens:     s.inputTokens ?? null,
      output_tokens:    s.outputTokens ?? null,
      latency_ms:       s.latencyMs,
      ttft_ms:          s.ttftMs ?? null,
      cost_cents:       costCents,
      guardrail_action: s.guardrailAction,
      status:           s.status,
      payload_ref:      payloadRefs.get(s.requestId) ?? null,
      attributes:       s.attributes ?? {},
    };
  });

  const { error } = await supabase
    .schema("inference")
    .from("trace_spans")
    .insert(rows);

  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "trace-consumer",
        message: "batch insert failed",
        err: error.message,
        count: rows.length,
      })
    );
    throw new Error(`trace_spans insert failed: ${error.message}`);
  }

  batch.ackAll();
}
