/**
 * TRACE_EVENTS queue consumer — Phase 3 S1.
 *
 * Drains TraceSpan events produced by the gateway request path and
 * batch-inserts them into inference.trace_spans.
 *
 * R2 payload capture: payload_ref is left NULL until R2 is wired up.
 * When non-null, the consumer would write raw {input, output} JSON to
 * R2 under "traces/{orgId}/{yyyy-mm}/{requestId}.json" and store the key.
 */
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";
import type { TraceSpan } from "../lib/trace.ts";

export async function handleTraceBatch(
  batch: MessageBatch<TraceSpan>,
  env: Env
): Promise<void> {
  if (batch.messages.length === 0) return;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-trace-consumer" } },
  });

  const rows = batch.messages.map((msg) => {
    const s = msg.body;
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
      cost_cents:       s.costCents,
      guardrail_action: s.guardrailAction,
      status:           s.status,
      payload_ref:      null,   // R2 write deferred
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
    // Re-throw so CF retries the batch (up to max_retries=3)
    throw new Error(`trace_spans insert failed: ${error.message}`);
  }

  batch.ackAll();
}
