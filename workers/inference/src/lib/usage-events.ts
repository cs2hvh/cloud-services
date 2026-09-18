/**
 * Usage-event plumbing shared by the media routes and the media sweep.
 *
 * The chat and messages routes carry private copies of these; they are left
 * alone. New routes use this module so a fifth copy does not appear.
 */
import type { AuthContext, Env, UsageEvent } from "../types.ts";

export function errorBody(message: string, type: string, code: string, requestId: string) {
  return { error: { message, type, code, request_id: requestId } };
}

export function baseUsageEvent(
  auth: Pick<AuthContext, "orgId" | "keyId" | "billing">,
  modelId: string,
  requestId: string,
  startedAt: number,
  modality: UsageEvent["modality"]
): UsageEvent {
  return {
    orgId: auth.orgId,
    apiKeyId: auth.keyId,
    userId: null,
    modelId,
    modality,
    requestId,
    billedTo: auth.billing,
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    numUnits: null,
    unitLabel: null,
    unitTier: null,
    costCents: 0,
    upstreamCostCents: 0,
    isOffPeak: false,
    latencyMs: Date.now() - startedAt,
    ttftMs: null,
    status: "success",
    errorCode: null,
    cacheKind: "none",
    upstreamProvider: null,
    occurredAt: new Date().toISOString(),
  };
}

export async function sendUsage(env: Pick<Env, "USAGE_EVENTS">, event: UsageEvent): Promise<void> {
  try {
    await env.USAGE_EVENTS.send(event);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", message: "Failed to enqueue usage event", err: String(err) }));
  }
}
