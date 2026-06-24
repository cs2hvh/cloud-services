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
    apiKeyId: auth.keyId,
    userId: null,
    modelId,
    modality,
    requestId,
    billedTo: "platform",
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
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

export async function resolveRouting(env: Env, modelId: string, requestId: string): Promise<RoutingResult> {
  const routing = await lookupModelRouting(env, modelId);
  if (!routing || !routing.is_active) {
    return {
      ok: false,
      error: gatewayError(
        routing ? `Model "${modelId}" is not currently available` : `Model "${modelId}" not found`,
        "invalid_request_error",
        "model_unavailable",
        requestId,
      ),
    };
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
    const key = await resolveUpstreamKey(env, "platform", auth.orgId, undefined);
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
