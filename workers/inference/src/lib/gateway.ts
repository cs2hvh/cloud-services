/**
 * Shared gateway primitives for per-unit inference routes.
 *
 * chat-completions.ts and embeddings.ts keep their own local helpers
 * because they support BYOK (billedTo: auth.billing). The six per-unit
 * routes (rerank, moderations, images, TTS, STT, OCR) always bill to
 * the platform key and share these helpers.
 */
import type { AuthContext, Env, UsageEvent } from "../types.ts";
import { lookupModelRouting } from "./model-routing.ts";
import { resolveUpstreamKey } from "./openrouter.ts";
import { sendTrace, type SpanName, type SpanStatus, type TraceSpan } from "./trace.ts";

/**
 * Supplier-reported cost in credits -> cents, or null.
 *
 * OpenRouter puts `usage.cost` on every response. It beats anything we derive
 * from a rate table, so it is captured wherever a real upstream response is
 * parsed. Null (not 0) when absent: 0 would assert "this was free", which is
 * only true for a cache hit, and a missing field is not the same as a free
 * request.
 */
export function reportedCostCents(cost: number | undefined | null): number | null {
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) return null;
  return cost * 100;
}

// ── Error body ───────────────────────────────────────────────────────────────

export function gatewayError(message: string, type: string, code: string, requestId: string) {
  return { error: { message, type, code, request_id: requestId } };
}

// ── Usage event ──────────────────────────────────────────────────────────────

export function buildBaseEvent(
  auth: AuthContext,
  modelId: string,
  modality: UsageEvent["modality"],
  requestId: string,
  startedAt: number,
  overrides?: Partial<UsageEvent>,
): UsageEvent {
  return {
    orgId: auth.orgId,
    apiKeyId: auth.usageApiKeyId,
    userId: null,
    modelId,
    modality,
    requestId,
    billedTo: "platform",
    provider: "openrouter",
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    cacheWriteTokens: null,
    reportedUpstreamCostCents: null,
    numUnits: null,
    unitLabel: null,
    costCents: 0,
    upstreamCostCents: 0,
    isOffPeak: false,
    latencyMs: Date.now() - startedAt,
    ttftMs: null,
    status: "success",
    errorCode: null,
    cacheKind: "none",
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

export async function enqueueUsage(env: Env, event: UsageEvent): Promise<void> {
  try {
    await env.USAGE_EVENTS.send(event);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", message: "Failed to enqueue usage event", err: String(err) }));
  }
}

/** Build a minimal TraceSpan for per-unit routes (images, audio, rerank, etc.). */
export function buildBaseSpan(
  auth: AuthContext,
  traceId: string,
  requestId: string,
  modelId: string,
  spanName: SpanName,
  startedAt: number,
  status: SpanStatus,
  attributes: Record<string, unknown> = {},
  numUnits: number | null = null,
  unitLabel: string | null = null,
): TraceSpan {
  return {
    orgId: auth.orgId,
    traceId,
    parentSpanId: null,
    requestId,
    apiKeyId: auth.usageApiKeyId,
    name: spanName,
    modelId,
    promptId: null,
    promptVersion: null,
    experimentId: null,
    arm: null,
    inputTokens: null,
    outputTokens: null,
    numUnits,
    unitLabel,
    latencyMs: Date.now() - startedAt,
    ttftMs: null,
    costCents: 0,
    guardrailAction: "clean",
    status,
    payload: null,
    attributes,
  };
}

export async function enqueueTrace(env: Env, span: TraceSpan): Promise<void> {
  return sendTrace(env, span);
}

// ── Auth scope check ─────────────────────────────────────────────────────────

export function checkModelScope(
  auth: AuthContext,
  modelId: string,
  requestId: string,
): ReturnType<typeof gatewayError> | null {
  if (auth.allowedModels && auth.allowedModels.length > 0 && !auth.allowedModels.includes(modelId)) {
    return gatewayError(
      `Model "${modelId}" is not allowed for this API key`,
      "invalid_request_error",
      "model_not_allowed",
      requestId,
    );
  }
  return null;
}

// ── Model routing ─────────────────────────────────────────────────────────────

export type RoutingResult =
  | { ok: true; upstreamModelId: string; capabilities: Record<string, unknown> | null }
  | { ok: false; error: ReturnType<typeof gatewayError> };

/**
 * The two checks EVERY modality needs: the model exists in the catalog, and it
 * is enabled. Returns an error body to send (503, as every route here does), or
 * null when the model is usable.
 *
 * Shared deliberately. chat-completions used to inline its own weaker copy —
 * `if (routing && !routing.is_active)` — which silently skipped the not-found
 * case, so an id absent from the catalog fell through and was proxied upstream.
 * The customer then got the UPSTREAM's error text (leaking that a third party
 * is behind us) and a junk row was still written to inference.usage. Nine other
 * routes went through resolveRouting and behaved correctly; chat, the highest
 * traffic route of them all, was the one exception.
 *
 * NOTE this deliberately does NOT require upstream_model_id. That requirement
 * belongs to resolveRouting, not here: chat forwards the catalog id as-is, and
 * four active chat rows (the gpt-4o / gpt-4.1 family) legitimately carry a NULL
 * upstream_model_id and work fine. Folding that check in here would break them.
 */
export function assertModelAvailable(
  routing: { is_active: boolean } | null,
  modelId: string,
  requestId: string,
): ReturnType<typeof gatewayError> | null {
  if (!routing) {
    return gatewayError(
      `Model "${modelId}" not found`,
      "invalid_request_error",
      "model_not_found",
      requestId,
    );
  }
  if (!routing.is_active) {
    return gatewayError(
      `Model "${modelId}" is not currently available`,
      "invalid_request_error",
      "model_unavailable",
      requestId,
    );
  }
  return null;
}

export async function resolveRouting(env: Env, modelId: string, requestId: string): Promise<RoutingResult> {
  const routing = await lookupModelRouting(env, modelId);
  const unavailable = assertModelAvailable(routing, modelId, requestId);
  if (unavailable || !routing) {
    return { ok: false, error: unavailable ?? gatewayError(`Model "${modelId}" not found`, "invalid_request_error", "model_not_found", requestId) };
  }
  if (!routing.upstream_model_id) {
    return {
      ok: false,
      error: gatewayError(
        `Model "${modelId}" is not configured for serving`,
        "invalid_request_error",
        "model_unavailable",
        requestId,
      ),
    };
  }
  return { ok: true, upstreamModelId: routing.upstream_model_id, capabilities: routing.capabilities };
}

// ── Upstream error classification ────────────────────────────────────────────

/**
 * Maps a non-ok upstream HTTP status to the correct customer-facing status,
 * and extracts the Retry-After header so callers can forward it.
 *
 * 429 → 429 (rate limited, customer should retry after Retry-After)
 * 408 → 408 (timeout)
 * everything else (402, 403, 5xx) → 503 (platform issue, opaque to customer)
 */
export function classifyUpstreamError(
  upstreamStatus: number,
  upstreamHeaders: Headers,
): { status: number; retryAfter: string | null; errorType: string; errorCode: string; message: string } {
  if (upstreamStatus === 429) {
    return {
      status: 429,
      retryAfter: upstreamHeaders.get("Retry-After"),
      errorType: "rate_limit_error",
      errorCode: "rate_limited",
      message: "Service is temporarily rate-limited. Please retry after a moment.",
    };
  }
  if (upstreamStatus === 408) {
    return {
      status: 408,
      retryAfter: null,
      errorType: "server_error",
      errorCode: "timeout",
      message: "Request timed out. Please try again.",
    };
  }
  return {
    status: 503,
    retryAfter: null,
    errorType: "server_error",
    errorCode: "service_unavailable",
    message: "Service is temporarily unavailable. Please try again.",
  };
}

// ── Platform key resolution ───────────────────────────────────────────────────

export type KeyResult =
  | { ok: true; key: string }
  | { ok: false; error: ReturnType<typeof gatewayError> };

export async function resolvePlatformKey(env: Env, auth: AuthContext, requestId: string): Promise<KeyResult> {
  try {
    const key = await resolveUpstreamKey(env, auth.billing, auth.orgId, auth.byokProvider);
    return { ok: true, key };
  } catch (err) {
    return {
      ok: false,
      error: gatewayError(
        err instanceof Error ? err.message : "Upstream key unavailable",
        "invalid_request_error",
        "byok_unavailable",
        requestId,
      ),
    };
  }
}
