/**
 * POST /v1/chat/completions — OpenAI Chat Completions–compatible.
 *
 * Forwards to OpenRouter with streaming-safe passthrough and cancel
 * propagation. Usage is captured from the response (non-streaming) or
 * from the final SSE chunk (streaming) and enqueued to USAGE_EVENTS
 * for the k8s consumer to flush into inference.usage.
 *
 * Phase 1: shipped. BYOK key decryption is stubbed in openrouter.ts
 * and lands later in Phase 1.
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { AuthContext, Env, HonoVariables, UsageEvent } from "../types.ts";
import {
  forwardJson,
  resolveUpstreamKey,
  streamPassthrough,
} from "../lib/openrouter.ts";
import { applyPreset, resolvePreset } from "../lib/presets.ts";
import { lookupCache, shouldCache, writeCache } from "../lib/cache.ts";
import { lookupModelRouting, forwardToSelfHosted } from "../lib/model-routing.ts";
import {
  evaluateGuardrail,
  extractUserTextsFromOpenAI,
  parseGuardrailPolicy,
} from "../lib/guardrail.ts";

// ───────────────────────────────────────────────────────────────
// Request schema — permissive on tool/content shape since OpenAI
// extends these regularly; we validate the bones and forward as-is.
// ───────────────────────────────────────────────────────────────
const messageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool", "developer"]),
    content: z
      .union([z.string(), z.array(z.unknown()), z.null()])
      .optional(),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(z.unknown()).optional(),
  })
  .passthrough();

const chatRequestSchema = z
  .object({
    // Optional in the schema — required at runtime UNLESS a preset is in play
    // (preset's first model becomes the default). The handler enforces this.
    model: z.string().min(1).optional(),
    messages: z.array(messageSchema).min(1),
    stream: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    max_tokens: z.number().int().positive().optional(),
    n: z.number().int().positive().max(8).optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    tools: z.array(z.unknown()).optional(),
    tool_choice: z.unknown().optional(),
    response_format: z.unknown().optional(),
    seed: z.number().int().optional(),
    user: z.string().optional(),
  })
  .passthrough();

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface OpenAIChatResponse {
  usage?: OpenAIUsage;
}

// ───────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────
export const chatCompletions: Handler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");

  // 1. Parse body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      errorBody("Invalid JSON body", "invalid_request_error", "invalid_json", requestId),
      400
    );
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      errorBody(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        "invalid_request_error",
        "invalid_request",
        requestId
      ),
      400
    );
  }
  const req = parsed.data;

  // 2. Resolve effective model — caller's body OR preset's first model
  //    (preset resolution happens further down, but we need to know the
  //    effective model NOW for scope checking and headers).
  const presetName = c.req.header("X-Ahura-Preset");
  let presetConfig: Awaited<ReturnType<typeof resolvePreset>> = null;
  if (presetName) {
    presetConfig = await resolvePreset(c.env, auth.orgId, presetName);
    if (!presetConfig) {
      return c.json(
        errorBody(
          `Preset "${presetName}" not found in this org`,
          "invalid_request_error",
          "preset_not_found",
          requestId
        ),
        400
      );
    }
  }

  const effectiveModel = req.model ?? presetConfig?.models[0];
  if (!effectiveModel) {
    return c.json(
      errorBody(
        "Request must specify `model` (or use X-Ahura-Preset with a preset that defines models)",
        "invalid_request_error",
        "model_required",
        requestId
      ),
      400
    );
  }

  // 3. Scope check — does this key allow this model?
  if (
    auth.allowedModels &&
    auth.allowedModels.length > 0 &&
    !auth.allowedModels.includes(effectiveModel)
  ) {
    return c.json(
      errorBody(
        `Model "${effectiveModel}" is not allowed for this API key`,
        "invalid_request_error",
        "model_not_allowed",
        requestId
      ),
      403
    );
  }

  // 3b. Prompt-injection guardrail — scans user+system text for known
  //     jailbreak/role-injection patterns. Policy comes from header,
  //     defaults to "warn" so rollout is non-breaking. The header is set
  //     unconditionally (off → "clean"; warn → "clean"|"flagged";
  //     block → "clean"|"flagged"|"blocked") so callers can wire alerting.
  const guardrailPolicy = parseGuardrailPolicy(c.req.header("X-Ahura-Guardrail"));
  const guardrail = evaluateGuardrail(
    extractUserTextsFromOpenAI(req.messages as Array<{ role?: string; content?: unknown }>),
    guardrailPolicy
  );
  c.header("X-Ahura-Guardrail", guardrail.action);
  if (guardrail.hits.length > 0) {
    // Single line, structured so the log shipper can grep + aggregate.
    console.log(
      JSON.stringify({
        level: guardrail.action === "blocked" ? "warn" : "info",
        requestId,
        orgId: auth.orgId,
        keyId: auth.keyId,
        message: `guardrail.${guardrail.action}`,
        policy: guardrail.policy,
        pattern_ids: guardrail.hits.map((h) => h.pattern_id),
      })
    );
  }
  if (guardrail.action === "blocked") {
    return c.json(
      errorBody(
        `Request blocked by prompt-injection guardrail (patterns: ${guardrail.hits.map((h) => h.pattern_id).join(", ")})`,
        "invalid_request_error",
        "guardrail_blocked",
        requestId
      ),
      400
    );
  }

  // 4. Resolve upstream key (platform OPENROUTER_PLATFORM_KEY or decrypt BYOK)
  let upstreamKey: string;
  try {
    upstreamKey = await resolveUpstreamKey(
      c.env,
      auth.billing,
      auth.orgId,
      auth.byokProvider
    );
  } catch (err) {
    return c.json(
      errorBody(
        err instanceof Error ? err.message : "BYOK key unavailable",
        "invalid_request_error",
        "byok_unavailable",
        requestId
      ),
      400
    );
  }

  c.header("X-Ahura-Model", effectiveModel);
  c.header("X-Ahura-Billing", auth.billing);

  // 4b. Look up the model in the catalog to decide routing. proxy models
  //     forward to the upstream gateway (default path below). Fine-tune /
  //     BYO models go to per-deployment serving endpoints — disabled in
  //     v1; user serves them on their own rented GPU pod.
  const routing = await lookupModelRouting(c.env, effectiveModel);
  if (routing && !routing.is_active) {
    return c.json(
      errorBody(
        `Model "${effectiveModel}" is not currently available.`,
        "invalid_request_error",
        "model_unavailable",
        requestId
      ),
      503
    );
  }

  // 5. Apply routing preset (already resolved above for the model check)
  let outgoingBody: Record<string, unknown> = {
    ...(req as unknown as Record<string, unknown>),
    model: effectiveModel,
  };
  if (presetConfig) {
    outgoingBody = applyPreset(outgoingBody, presetConfig);
    c.header("X-Ahura-Preset", presetName!);
  }

  // 5b. Self-hosted models (FT outputs, BYO deploys) — gateway-routed
  // managed serving is out of scope for v1. User runs vLLM on their own
  // rented GPU pod (see /dashboard/services/gpu/deploy). For now, return
  // a clear redirect message instead of attempting to forward.
  if (routing && (routing.serving_type === "runpod_ft" || routing.serving_type === "runpod_byo")) {
    return c.json(
      errorBody(
        `Model "${effectiveModel}" is a private adapter. Serve it on a GPU pod you control; ` +
          `the gateway does not currently route to per-tenant adapters. ` +
          `See the dashboard's job detail dialog for deployment instructions.`,
        "invalid_request_error",
        "self_serve_model",
        requestId
      ),
      400
    );
  }

  // 5. L1 cache check — only non-streaming deterministic requests, scoped per org
  const cacheDecision = await shouldCache(c.req.raw, outgoingBody, auth.orgId);
  if (cacheDecision.cacheable && cacheDecision.key) {
    const cached = await lookupCache(c.env, cacheDecision.key);
    if (cached) {
      c.executionCtx.waitUntil(
        sendUsage(c.env, {
          ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
          inputTokens: cached.usage?.prompt_tokens ?? null,
          outputTokens: cached.usage?.completion_tokens ?? null,
          // Account cache hits at the cached_tokens rate (consumer applies this)
          cachedTokens: cached.usage?.prompt_tokens ?? null,
          status: "success",
        })
      );
      return new Response(cached.body, {
        status: 200,
        headers: {
          "content-type": cached.contentType,
          "X-Ahura-Request-Id": requestId,
          "X-Ahura-Model": effectiveModel,
          "X-Ahura-Billing": auth.billing,
          "X-Ahura-Cache": "hit",
          "X-Ahura-Cache-Age": String(Math.floor((Date.now() - cached.cachedAt) / 1000)),
        },
      });
    }
  }
  c.header(
    "X-Ahura-Cache",
    cacheDecision.bypass
      ? "bypass"
      : cacheDecision.reason === "streaming"
        ? "streaming-skipped"
        : cacheDecision.reason === "non-deterministic"
          ? "non-deterministic"
          : "miss"
  );

  // 6. Forward to OpenRouter
  const upstream = await forwardJson({
    env: c.env,
    body: outgoingBody,
    upstreamKey,
    path: "/chat/completions",
    signal: c.req.raw.signal,
    extraHeaders: {
      "X-Title": "AhuraCloud Inference",
    },
  });

  // 5. Error responses — pass through but tag with our headers
  if (!upstream.ok) {
    const text = await upstream.text();
    c.executionCtx.waitUntil(
      sendUsage(c.env, {
        ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
        status: mapUpstreamStatus(upstream.status),
        errorCode: `upstream_${upstream.status}`,
      })
    );
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
        "X-Ahura-Request-Id": requestId,
        "X-Ahura-Model": effectiveModel,
      },
    });
  }

  // 6a. Streaming — passthrough SSE, extract usage from final chunk
  if (req.stream) {
    return streamPassthrough(upstream, (rawText) => {
      const usage = extractUsageFromSse(rawText);
      c.executionCtx.waitUntil(
        sendUsage(c.env, {
          ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
          inputTokens: usage?.prompt_tokens ?? null,
          outputTokens: usage?.completion_tokens ?? null,
          cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
          status: "success",
        })
      );
    });
  }

  // 6b. Non-streaming — buffer, parse for usage, return + cache write-through
  const text = await upstream.text();
  let parsedUsage: OpenAIChatResponse["usage"] | undefined;
  try {
    const data = JSON.parse(text) as OpenAIChatResponse;
    parsedUsage = data.usage;
    c.executionCtx.waitUntil(
      sendUsage(c.env, {
        ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
        inputTokens: data.usage?.prompt_tokens ?? null,
        outputTokens: data.usage?.completion_tokens ?? null,
        cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? null,
        status: "success",
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "warn",
        requestId,
        message: "Failed to parse non-stream response for usage",
        err: String(err),
      })
    );
  }

  // Cache write-through (best effort, doesn't block response)
  if (cacheDecision.cacheable && cacheDecision.key) {
    c.executionCtx.waitUntil(
      writeCache(
        c.env,
        cacheDecision.key,
        text,
        "application/json",
        cacheDecision.ttlSeconds,
        parsedUsage
          ? {
              prompt_tokens: parsedUsage.prompt_tokens,
              completion_tokens: parsedUsage.completion_tokens,
            }
          : undefined
      )
    );
  }

  return new Response(text, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "X-Ahura-Request-Id": requestId,
      "X-Ahura-Model": effectiveModel,
      "X-Ahura-Billing": auth.billing,
      "X-Ahura-Cache": cacheDecision.cacheable ? "miss" : "skipped",
    },
  });
};

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

function errorBody(
  message: string,
  type: string,
  code: string,
  requestId: string
) {
  return {
    error: { message, type, code, request_id: requestId },
  };
}

function baseUsageEvent(
  auth: AuthContext,
  modelId: string,
  requestId: string,
  startedAt: number
): UsageEvent {
  return {
    orgId: auth.orgId,
    apiKeyId: auth.keyId,
    userId: null,
    modelId,
    modality: "chat",
    requestId,
    billedTo: auth.billing,
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    numUnits: null,
    unitLabel: null,
    costCents: 0,           // computed by the usage consumer using catalog pricing
    upstreamCostCents: 0,   // ditto
    isOffPeak: false,       // ditto
    latencyMs: Date.now() - startedAt,
    ttftMs: null,
    status: "success",
    errorCode: null,
    occurredAt: new Date().toISOString(),
  };
}

async function sendUsage(env: Env, event: UsageEvent): Promise<void> {
  try {
    await env.USAGE_EVENTS.send(event);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Failed to enqueue usage event",
        err: String(err),
      })
    );
  }
}

/**
 * Walk SSE chunks backwards to find the usage payload.
 * OpenAI / OpenRouter typically include `usage` in the final data
 * chunk before [DONE], but some upstreams put it in a dedicated
 * chunk. We accept either.
 */
function extractUsageFromSse(rawText: string): OpenAIUsage | undefined {
  const lines = rawText.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line || !line.startsWith("data: ")) continue;
    const payload = line.slice(6);
    if (payload === "[DONE]") continue;
    try {
      const obj = JSON.parse(payload) as { usage?: OpenAIUsage };
      if (obj.usage) return obj.usage;
    } catch {
      // SSE comments / non-JSON keep-alives — skip
    }
  }
  return undefined;
}

function mapUpstreamStatus(httpStatus: number): UsageEvent["status"] {
  if (httpStatus === 429) return "error_rate_limit";
  if (httpStatus === 401 || httpStatus === 403) return "error_auth";
  if (httpStatus === 400 || httpStatus === 422) return "error_validation";
  return "error_upstream";
}
