/**
 * POST /v1/embeddings — OpenAI Embeddings–compatible.
 *
 * Forwards to OpenRouter /api/v1/embeddings as-is. Supports OpenAI's
 * three embedding models (text-embedding-3-large/small, ada-002) which
 * are the only embedding-modality models OpenRouter exposes today.
 *
 * Usage is captured with modality='embedding' so the consumer bills
 * against the input_cents_per_mtok rate of the model (embeddings have
 * no output tokens — output_tokens=0 always).
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { AuthContext, Env, HonoVariables, UsageEvent } from "../types.ts";
import { forwardJson, resolveUpstreamKey } from "../lib/openrouter.ts";
import { lookupCache, shouldCacheEmbeddings, writeCache } from "../lib/cache.ts";

const embeddingsRequestSchema = z
  .object({
    model: z.string().min(1),
    input: z.union([z.string(), z.array(z.string()).min(1).max(2048)]),
    // OpenAI extras
    dimensions: z.number().int().positive().optional(),
    encoding_format: z.enum(["float", "base64"]).optional(),
    user: z.string().optional(),
  })
  .passthrough();

interface OpenAIEmbeddingsResponse {
  object?: string;
  data?: Array<{ object?: string; embedding?: unknown; index?: number }>;
  model?: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export const embeddings: Handler<{
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
      {
        error: {
          message: "Invalid JSON body",
          type: "invalid_request_error",
          code: "invalid_json",
          request_id: requestId,
        },
      },
      400
    );
  }

  const parsed = embeddingsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          type: "invalid_request_error",
          code: "invalid_request",
          request_id: requestId,
        },
      },
      400
    );
  }
  const req = parsed.data;

  // 2. Model scope check
  if (
    auth.allowedModels &&
    auth.allowedModels.length > 0 &&
    !auth.allowedModels.includes(req.model)
  ) {
    return c.json(
      {
        error: {
          message: `Model "${req.model}" is not allowed for this API key`,
          type: "invalid_request_error",
          code: "model_not_allowed",
          request_id: requestId,
        },
      },
      403
    );
  }

  // 3. Resolve upstream key
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
      {
        error: {
          message: err instanceof Error ? err.message : "BYOK key unavailable",
          type: "invalid_request_error",
          code: "byok_unavailable",
          request_id: requestId,
        },
      },
      400
    );
  }

  c.header("X-Ahura-Model", req.model);
  c.header("X-Ahura-Billing", auth.billing);

  // 4. L1 cache lookup — embeddings are deterministic, so we cache aggressively
  //    unless the caller opts out via Cache-Control: no-cache or X-Ahura-Cache: off.
  //    Cache hits skip the upstream call AND the billing event (the user paid
  //    once already; serving a cache hit costs us nothing).
  const cacheDecision = await shouldCacheEmbeddings(c.req.raw, req, auth.orgId);
  if (cacheDecision.cacheable && cacheDecision.key) {
    const hit = await lookupCache(c.env, cacheDecision.key);
    if (hit) {
      c.header("X-Ahura-Cache", "hit");
      c.header("X-Ahura-Cache-Age", String(Math.round((Date.now() - hit.cachedAt) / 1000)));
      return new Response(hit.body, {
        status: 200,
        headers: {
          "content-type": hit.contentType,
          "X-Ahura-Request-Id": requestId,
          "X-Ahura-Model": req.model,
          "X-Ahura-Billing": auth.billing,
          "X-Ahura-Cache": "hit",
          "X-Ahura-Cache-Age": String(Math.round((Date.now() - hit.cachedAt) / 1000)),
        },
      });
    }
    c.header("X-Ahura-Cache", "miss");
  } else if (cacheDecision.bypass) {
    c.header("X-Ahura-Cache", "bypass");
  }

  // 5. Forward to OpenRouter
  const upstream = await forwardJson({
    env: c.env,
    body: req,
    upstreamKey,
    path: "/embeddings",
    signal: c.req.raw.signal,
  });

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
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "X-Ahura-Request-Id": requestId,
        "X-Ahura-Model": req.model,
      },
    });
  }

  const text = await upstream.text();
  let promptTokens: number | null = null;
  try {
    const data = JSON.parse(text) as OpenAIEmbeddingsResponse;
    promptTokens = data.usage?.prompt_tokens ?? null;
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    c.executionCtx.waitUntil(
      sendUsage(c.env, {
        ...baseUsageEvent(auth, req.model, requestId, startedAt),
        inputTokens: promptTokens,
        outputTokens: 0,
        numUnits: inputs.length,
        unitLabel: "embedding",
        status: "success",
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "warn",
        requestId,
        message: "Failed to parse embeddings response for usage",
        err: String(err),
      })
    );
  }

  // Write-through to L1 cache so subsequent identical requests skip the upstream.
  if (cacheDecision.cacheable && cacheDecision.key) {
    c.executionCtx.waitUntil(
      writeCache(
        c.env,
        cacheDecision.key,
        text,
        upstream.headers.get("content-type") ?? "application/json",
        cacheDecision.ttlSeconds,
        { prompt_tokens: promptTokens ?? undefined, completion_tokens: 0 }
      )
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

// ─── Helpers ─────────────────────────────────────────────────────

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
    modality: "embedding",
    requestId,
    billedTo: auth.billing,
    inputTokens: null,
    outputTokens: 0,
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
  };
}

async function sendUsage(env: Env, event: UsageEvent): Promise<void> {
  try {
    await env.USAGE_EVENTS.send(event);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Failed to enqueue embedding usage event",
        err: String(err),
      })
    );
  }
}

function mapUpstreamStatus(httpStatus: number): UsageEvent["status"] {
  if (httpStatus === 429) return "error_rate_limit";
  if (httpStatus === 401 || httpStatus === 403) return "error_auth";
  if (httpStatus === 400 || httpStatus === 422) return "error_validation";
  return "error_upstream";
}
