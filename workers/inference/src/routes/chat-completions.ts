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
    model: z.string().min(1),
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

  // 2. Scope check — does this key allow this model?
  if (
    auth.allowedModels &&
    auth.allowedModels.length > 0 &&
    !auth.allowedModels.includes(req.model)
  ) {
    return c.json(
      errorBody(
        `Model "${req.model}" is not allowed for this API key`,
        "invalid_request_error",
        "model_not_allowed",
        requestId
      ),
      403
    );
  }

  // 3. Resolve upstream key (platform OPENROUTER_PLATFORM_KEY or decrypt BYOK)
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

  c.header("X-Ahura-Model", req.model);
  c.header("X-Ahura-Billing", auth.billing);

  // 4. Forward to OpenRouter
  const upstream = await forwardJson({
    env: c.env,
    body: req,
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
        ...baseUsageEvent(auth, req.model, requestId, startedAt),
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
        "X-Ahura-Model": req.model,
      },
    });
  }

  // 6a. Streaming — passthrough SSE, extract usage from final chunk
  if (req.stream) {
    return streamPassthrough(upstream, (rawText) => {
      const usage = extractUsageFromSse(rawText);
      c.executionCtx.waitUntil(
        sendUsage(c.env, {
          ...baseUsageEvent(auth, req.model, requestId, startedAt),
          inputTokens: usage?.prompt_tokens ?? null,
          outputTokens: usage?.completion_tokens ?? null,
          cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
          status: "success",
        })
      );
    });
  }

  // 6b. Non-streaming — buffer, parse for usage, return
  const text = await upstream.text();
  try {
    const data = JSON.parse(text) as OpenAIChatResponse;
    c.executionCtx.waitUntil(
      sendUsage(c.env, {
        ...baseUsageEvent(auth, req.model, requestId, startedAt),
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

  return new Response(text, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "X-Ahura-Request-Id": requestId,
      "X-Ahura-Model": req.model,
      "X-Ahura-Billing": auth.billing,
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
