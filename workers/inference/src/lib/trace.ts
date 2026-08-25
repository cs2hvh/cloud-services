/**
 * Native tracing — Phase 3 S1.
 *
 * Emits OTel GenAI-compatible spans from the gateway itself into a
 * TRACE_EVENTS CF Queue. The trace consumer drains these into
 * inference.trace_spans and (future) exports OTLP.
 *
 * Never throws — a tracing failure must never block the customer response.
 * Always called via waitUntil() next to sendUsage().
 */
import type { AuthContext, Env } from "../types.ts";

/** Valid span names — extend when adding new inference types. */
export type SpanName =
  | "gen_ai.chat"
  | "gen_ai.embed"
  | "gen_ai.image"
  | "gen_ai.audio"
  | "gen_ai.rerank"
  | "gen_ai.moderation"
  | "gen_ai.video"
  | "gen_ai.music"
  | "gen_ai.ocr";

/** Terminal status of a span. Mirrors UsageEvent.status + guardrail additions. */
export type SpanStatus =
  | "success"
  | "error_upstream"
  | "error_rate_limit"
  | "error_budget"
  | "error_auth"
  | "error_validation"
  | "error_internal"
  | "error_guardrail_blocked"
  | "cancelled";

/** Guardrail outcome on the request. */
export type GuardrailAction = "clean" | "flagged" | "blocked" | "redacted";

export interface TraceSpan {
  orgId: string;
  traceId: string;
  parentSpanId: string | null;
  requestId: string;
  apiKeyId: string;
  name: SpanName;
  modelId: string;
  promptId: string | null;
  promptVersion: number | null;
  experimentId: string | null;
  arm: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  numUnits?: number | null;
  unitLabel?: string | null;
  latencyMs: number;
  ttftMs: number | null;
  costCents: number;
  guardrailAction: GuardrailAction;
  status: SpanStatus;
  // payload is null for ZDR keys or unsampled requests.
  // When non-null, the consumer writes it to R2 and stores the key in payload_ref.
  payload: { input: unknown; output: unknown } | null;
  attributes: Record<string, unknown>;
}

/** Enqueue a span. Fire-and-forget — never throws. */
export async function sendTrace(env: Env, span: TraceSpan): Promise<void> {
  try {
    await env.TRACE_EVENTS.send(span);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "trace",
        message: "Failed to enqueue trace span",
        err: String(err),
      })
    );
  }
}

/**
 * Whether to capture the full prompt+completion payload for this request.
 *
 * ZDR keys NEVER carry payload — that is a privacy hard-gate, not a config.
 * Otherwise payload is sampled at `rate` (0.0–1.0).
 */
export function shouldSamplePayload(auth: AuthContext, rate: number): boolean {
  if (auth.zdrEnabled) return false;
  return Math.random() < rate;
}

/** Default per-org trace payload sample rate when no override is set. */
export const DEFAULT_TRACE_SAMPLE_RATE = 0.1; // 10%
