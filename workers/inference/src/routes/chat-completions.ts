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
} from "../lib/openrouter.ts";
import { scrubJson, scrubSsePassthrough } from "../lib/brand-scrub.ts";
import { applyPreset, resolvePreset } from "../lib/presets.ts";
import { lookupCache, shouldCache, writeCache } from "../lib/cache.ts";
import {
  extractEmbeddableText,
  lookupSemanticCache,
  writeSemanticCache,
} from "../lib/semantic-cache.ts";
import {
  lookupModelRouting,
  forwardToManaged,
  extendServingPodIdle,
} from "../lib/model-routing.ts";
import {
  extractUserTextsFromOpenAI,
  resolveOrgGuardrailPolicy,
  evaluateOrgGuardrail,
  redactPii,
  type GuardrailRule,
} from "../lib/guardrail.ts";
import {
  extractJsonSchema,
  validateJsonContent,
  extractFirstContent,
  buildStructuredRetry,
} from "../lib/structured-output.ts";
import {
  extractToolDefs,
  validateToolCalls,
  buildToolRepairBody,
} from "../lib/tool-guarantees.ts";
import { sendTrace, shouldSamplePayload, DEFAULT_TRACE_SAMPLE_RATE, type GuardrailAction } from "../lib/trace.ts";
import { resolvePrompt, applyPrompt } from "../lib/prompt-resolver.ts";

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

  // Phase 3 S1: trace ID — forwarded from the client or generated fresh.
  // Groups all spans for multi-step agent traces.
  const traceId = c.req.header("X-Ahura-Trace-Id") ?? crypto.randomUUID();
  c.header("X-Ahura-Trace-Id", traceId);
  // Hoisted so the blocked-guardrail path can include it (null before prompt resolution).
  let promptMeta: { promptId: string; version: number } | null = null;

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

  // 3b. Guardrail — Phase 3 S2: per-org named policy from KV, falling back
  //     to keyword mode ("off"/"warn"/"block"/"redact") for backwards compat.
  //     The header now accepts either a policy name ("strict-rag-policy") or
  //     a keyword; the control plane writes named policies to GUARDRAILS KV.
  const orgGuardrailPolicy = await resolveOrgGuardrailPolicy(
    c.env,
    auth.orgId,
    c.req.header("X-Ahura-Guardrail")
  );
  const userTexts = extractUserTextsFromOpenAI(
    req.messages as Array<{ role?: string; content?: unknown }>
  );
  const guardrail = evaluateOrgGuardrail(
    userTexts,
    req.messages as Array<{ role: string; content: unknown }>,
    orgGuardrailPolicy
  );
  c.header("X-Ahura-Guardrail", guardrail.action);
  if (guardrail.hits.length > 0) {
    console.log(
      JSON.stringify({
        level: guardrail.action === "blocked" ? "warn" : "info",
        requestId,
        orgId: auth.orgId,
        keyId: auth.keyId,
        message: `guardrail.${guardrail.action}`,
        policy: orgGuardrailPolicy.mode,
        pattern_ids: guardrail.hits.map((h) => h.pattern_id),
      })
    );
  }
  if (guardrail.action === "blocked") {
    c.executionCtx.waitUntil(
      sendTrace(c.env, {
        ...baseTraceSpan(auth, traceId, requestId, effectiveModel, promptMeta, startedAt, "blocked"),
        inputTokens: null,
        outputTokens: null,
        status: "error_guardrail_blocked",
        payload: null,
        attributes: { blocked_patterns: guardrail.hits.map((h) => h.pattern_id) },
      })
    );
    return c.json(
      errorBody(
        `Request blocked by guardrail (patterns: ${guardrail.hits.map((h) => h.pattern_id).join(", ")})`,
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

  // Phase 3 S2: apply redacted messages when guardrail mode="redact"
  if (guardrail.redactedMessages) {
    outgoingBody = { ...outgoingBody, messages: guardrail.redactedMessages };
  }

  // Phase 3 S3: resolve named prompt template from X-Ahura-Prompt header.
  // Rendered messages are prepended; template model defaults fill gaps.
  const promptRef = c.req.header("X-Ahura-Prompt");
  if (promptRef) {
    let promptVars: Record<string, unknown> = {};
    const varsHeader = c.req.header("X-Ahura-Prompt-Vars");
    if (varsHeader) {
      try { promptVars = JSON.parse(varsHeader) as Record<string, unknown>; } catch { /* ignore */ }
    }

    // Scan variable values through the guardrail — they are user-controlled strings
    // that will be interpolated into the system prompt AFTER the main guardrail pass.
    // A jailbreak payload in {{var}} would otherwise bypass the guardrail entirely.
    if (orgGuardrailPolicy.mode !== "off" && Object.keys(promptVars).length > 0) {
      const varTexts = Object.values(promptVars).map(String).filter(Boolean);
      const varScan = evaluateOrgGuardrail(varTexts, [], orgGuardrailPolicy);
      if (varScan.action === "blocked") {
        c.executionCtx.waitUntil(
          sendTrace(c.env, {
            ...baseTraceSpan(auth, traceId, requestId, effectiveModel, null, startedAt, "blocked"),
            inputTokens: null,
            outputTokens: null,
            status: "error_guardrail_blocked",
            payload: null,
            attributes: { blocked_on: "prompt_vars" },
          })
        );
        return c.json(
          errorBody(
            `Request blocked by guardrail on prompt variable values`,
            "invalid_request_error",
            "guardrail_blocked",
            requestId
          ),
          400
        );
      }
    }

    const resolved = await resolvePrompt(c.env, auth.orgId, promptRef, promptVars);
    if (!resolved) {
      return c.json(
        errorBody(
          `Prompt "${promptRef}" not found or has no deployed label`,
          "invalid_request_error",
          "prompt_not_found",
          requestId
        ),
        400
      );
    }
    promptMeta = { promptId: resolved.promptId, version: resolved.version };
    outgoingBody = applyPrompt(outgoingBody, resolved);
    c.header("X-Ahura-Prompt-Version", String(resolved.version));
  }

  // 5b. Self-hosted models (FT outputs, BYO deploys) — two branches:
  //
  //   • serving_url SET → AhuraCloud-managed serving (Phase 11). Forward to
  //                       that URL; the URL hosts a vLLM openai-server we
  //                       operate.
  //   • serving_url NULL → self-serve only (Phase 10). User runs vLLM on
  //                        their own GPU pod. Return a redirect message.
  if (routing && (routing.serving_type === "runpod_ft" || routing.serving_type === "runpod_byo")) {
    if (!routing.serving_url) {
      return c.json(
        errorBody(
          `Model "${effectiveModel}" is a private adapter. Serve it on a GPU pod you control ` +
            `(see the FT job detail in the dashboard for the docker command), or ask your ` +
            `org admin to enable managed serving for this adapter.`,
          "invalid_request_error",
          "self_serve_model",
          requestId
        ),
        400
      );
    }

    // Managed path — forward directly to the AhuraCloud-operated vLLM URL.
    // The cache + guardrail already ran above; preset rewrite already
    // applied. Pass the body as-is (with model rewritten to vLLM's
    // served-model-name inside forwardToManaged).
    const servedName = routing.served_model_name ?? "adapter";
    let upstream: Response;
    try {
      upstream = await forwardToManaged({
        servingUrl: routing.serving_url,
        body: outgoingBody,
        servedModelName: servedName,
        signal: c.req.raw.signal,
      });
    } catch (err) {
      // Network-level failure (DNS, connection refused, TLS, etc.) —
      // most common cause is the pod still warming up (or just torn
      // down). Return a customer-friendly 503 with Retry-After so the
      // client knows to back off, not a raw 502 with a stack trace.
      const msg = err instanceof Error ? err.message : String(err);
      c.executionCtx.waitUntil(
        sendUsage(c.env, {
          ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
          status: "error_upstream",
          errorCode: "managed_warming_up",
        })
      );
      c.header("Retry-After", "10");
      return c.json(
        errorBody(
          `Serving instance is warming up. Retry in a few seconds.`,
          "service_unavailable",
          "instance_warming_up",
          requestId
        ),
        503
      );
      void msg;
    }
    c.header("X-Ahura-Routing", "managed");

    if (!upstream.ok) {
      // 502 / 503 / 504 from vLLM almost always = cold-start: the pod
      // exists but vLLM hasn't finished loading the model yet. Convert
      // to a clean 503 + Retry-After. 4xx codes pass through as-is
      // (those are real client bugs that the customer needs to fix).
      const text = await upstream.text();
      c.executionCtx.waitUntil(
        sendUsage(c.env, {
          ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
          status: mapUpstreamStatus(upstream.status),
          errorCode: `managed_${upstream.status}`,
        })
      );
      if (upstream.status >= 500 && upstream.status < 600) {
        c.header("Retry-After", "10");
        return c.json(
          errorBody(
            `Serving instance is warming up. Retry in a few seconds.`,
            "service_unavailable",
            "instance_warming_up",
            requestId
          ),
          503
        );
      }
      return new Response(text, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") ?? "application/json",
          "X-Ahura-Request-Id": requestId,
          "X-Ahura-Model": effectiveModel,
          "X-Ahura-Routing": "managed",
        },
      });
    }

    // Successful managed call — extend the pod's idle deadline so the
    // watchdog doesn't reap it while it's actively being used. Fire-and-
    // forget; never block the customer response on this.
    c.executionCtx.waitUntil(extendServingPodIdle(c.env, routing.serving_url));

    // Stream OR non-stream — passthrough body unchanged. vLLM's openai-server
    // emits usage in both shapes; we read it the same way the OpenRouter
    // path below does, just from a different upstream.
    if (outgoingBody.stream === true) {
      const { wrapped: wrappedUpstream, getTtftMs } = wrapTtft(upstream, startedAt);
      return scrubSsePassthrough(
        wrappedUpstream,
        effectiveModel,
        `chat-${requestId}`,
        {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "X-Ahura-Request-Id": requestId,
          "X-Ahura-Trace-Id": traceId,
          "X-Ahura-Model": effectiveModel,
          "X-Ahura-Billing": auth.billing,
          "X-Ahura-Routing": "managed",
          "X-Ahura-Guardrail": guardrail.action,
          ...(promptMeta ? { "X-Ahura-Prompt-Version": String(promptMeta.version) } : {}),
        },
        (scrubbedText) => {
          const usage = extractUsageFromSse(scrubbedText);
          c.executionCtx.waitUntil(
            sendUsage(c.env, {
              ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
              inputTokens: usage?.prompt_tokens ?? null,
              outputTokens: usage?.completion_tokens ?? null,
              status: "success",
            })
          );
          c.executionCtx.waitUntil(
            sendTrace(c.env, {
              ...baseTraceSpan(auth, traceId, requestId, effectiveModel, promptMeta, startedAt, guardrail.action),
              inputTokens: usage?.prompt_tokens ?? null,
              outputTokens: usage?.completion_tokens ?? null,
              ttftMs: getTtftMs(),
              status: "success",
              payload: shouldSamplePayload(auth, DEFAULT_TRACE_SAMPLE_RATE)
                ? { input: outgoingBody.messages, output: null }
                : null,
              attributes: { streaming: true, routing: "managed" },
            })
          );
        }
      );
    }

    const text = await upstream.text();
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
    try {
      const parsedResp = JSON.parse(text) as { usage?: typeof usage };
      usage = parsedResp.usage;
    } catch {
      // upstream returned non-JSON — pass through but skip usage
    }
    c.executionCtx.waitUntil(
      sendUsage(c.env, {
        ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
        inputTokens: usage?.prompt_tokens ?? null,
        outputTokens: usage?.completion_tokens ?? null,
        status: "success",
      })
    );
    c.executionCtx.waitUntil(
      sendTrace(c.env, {
        ...baseTraceSpan(auth, traceId, requestId, effectiveModel, promptMeta, startedAt, guardrail.action),
        inputTokens: usage?.prompt_tokens ?? null,
        outputTokens: usage?.completion_tokens ?? null,
        status: "success",
        payload: null,
        attributes: { routing: "managed" },
      })
    );
    return new Response(text, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "X-Ahura-Request-Id": requestId,
        "X-Ahura-Trace-Id": traceId,
        "X-Ahura-Model": effectiveModel,
        "X-Ahura-Billing": auth.billing,
        "X-Ahura-Routing": "managed",
        "X-Ahura-Guardrail": guardrail.action,
        ...(promptMeta ? { "X-Ahura-Prompt-Version": String(promptMeta.version) } : {}),
      },
    });
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
          cacheKind: "l1",
        })
      );
      c.executionCtx.waitUntil(
        sendTrace(c.env, {
          ...baseTraceSpan(auth, traceId, requestId, effectiveModel, promptMeta, startedAt, guardrail.action),
          inputTokens: cached.usage?.prompt_tokens ?? null,
          outputTokens: cached.usage?.completion_tokens ?? null,
          status: "success",
          payload: null,
          attributes: { cache_kind: "l1" },
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

  // 5b. Semantic cache check (Phase 7.C) — only after L1 misses, and
  //     only when the key has opted in. ZDR keys + streaming +
  //     tool-call requests skip entirely. We pull the prompt text
  //     from the last user message; if nothing embeddable is there,
  //     skip too.
  const semanticEligible =
    auth.semanticCacheEnabled &&
    !auth.zdrEnabled &&
    !req.stream &&
    !req.tools &&
    cacheDecision.cacheable;
  let semanticPromptText: string | null = null;
  if (semanticEligible) {
    semanticPromptText = extractEmbeddableText(
      req.messages as Array<{ role?: string; content?: unknown }>
    );
    if (semanticPromptText) {
      const semanticHit = await lookupSemanticCache({
        env: c.env,
        orgId: auth.orgId,
        modelId: effectiveModel,
        temperature: req.temperature,
        promptText: semanticPromptText,
        upstreamKey,
        thresholdOverride: auth.orgSemanticCacheThreshold,
      });
      if (semanticHit) {
        c.executionCtx.waitUntil(
          sendUsage(c.env, {
            ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
            inputTokens: semanticHit.usage?.prompt_tokens ?? null,
            outputTokens: semanticHit.usage?.completion_tokens ?? null,
            // Account semantic hits at the cached_tokens rate too — the
            // consumer's pricing function reads cachedTokens to apply
            // the cached-input rate, matching the L1 path.
            cachedTokens: semanticHit.usage?.prompt_tokens ?? null,
            status: "success",
            cacheKind: "semantic",
          })
        );
        c.executionCtx.waitUntil(
          sendTrace(c.env, {
            ...baseTraceSpan(auth, traceId, requestId, effectiveModel, promptMeta, startedAt, guardrail.action),
            inputTokens: semanticHit.usage?.prompt_tokens ?? null,
            outputTokens: semanticHit.usage?.completion_tokens ?? null,
            status: "success",
            payload: null,
            attributes: { cache_kind: "semantic", similarity: semanticHit.similarity },
          })
        );
        return new Response(semanticHit.responseBody, {
          status: 200,
          headers: {
            "content-type": semanticHit.contentType,
            "X-Ahura-Request-Id": requestId,
            "X-Ahura-Model": effectiveModel,
            "X-Ahura-Billing": auth.billing,
            "X-Ahura-Cache": "semantic-hit",
            "X-Ahura-Cache-Similarity": semanticHit.similarity.toFixed(4),
            "X-Ahura-Cache-Age": String(
              Math.floor(
                (Date.now() - new Date(semanticHit.cachedAt).getTime()) / 1000
              )
            ),
          },
        });
      }
    }
  }

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

  // 5. Error responses — scrub brand info, forward Retry-After, pass status through
  if (!upstream.ok) {
    const text = await upstream.text();
    const errStatus = mapUpstreamStatus(upstream.status);
    c.executionCtx.waitUntil(
      sendUsage(c.env, {
        ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
        status: errStatus,
        errorCode: `upstream_${upstream.status}`,
      })
    );
    c.executionCtx.waitUntil(
      sendTrace(c.env, {
        ...baseTraceSpan(auth, traceId, requestId, effectiveModel, promptMeta, startedAt, guardrail.action),
        inputTokens: null,
        outputTokens: null,
        status: errStatus,
        payload: null,
        attributes: { upstream_http_status: upstream.status },
      })
    );
    // Forward Retry-After so clients can back off correctly on 429/503
    const retryAfter = upstream.headers.get("Retry-After");
    if (retryAfter && (upstream.status === 429 || upstream.status === 503)) {
      c.header("Retry-After", retryAfter);
    }
    // Scrub 403 moderation metadata (contains provider_name, model_id)
    let body = text;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      body = JSON.stringify(scrubJson(parsed, effectiveModel, requestId));
    } catch { /* not JSON — pass through as-is */ }
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "X-Ahura-Request-Id": requestId,
        "X-Ahura-Model": effectiveModel,
      },
    });
  }

  // 6a. Streaming — scrub SSE chunks, extract usage from final scrubbed chunk
  if (req.stream) {
    const { wrapped: wrappedUpstream, getTtftMs } = wrapTtft(upstream, startedAt);
    return scrubSsePassthrough(
      wrappedUpstream,
      effectiveModel,
      `chat-${requestId}`,
      {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "X-Ahura-Request-Id": requestId,
        "X-Ahura-Trace-Id": traceId,
        "X-Ahura-Model": effectiveModel,
        "X-Ahura-Billing": auth.billing,
        "X-Ahura-Cache": cacheDecision.cacheable ? "miss" : "skipped",
        "X-Ahura-Guardrail": guardrail.action,
        ...(promptMeta ? { "X-Ahura-Prompt-Version": String(promptMeta.version) } : {}),
      },
      (scrubbedText) => {
        const usage = extractUsageFromSse(scrubbedText);
        c.executionCtx.waitUntil(
          sendUsage(c.env, {
            ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
            inputTokens: usage?.prompt_tokens ?? null,
            outputTokens: usage?.completion_tokens ?? null,
            cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
            status: "success",
          })
        );
        c.executionCtx.waitUntil(
          sendTrace(c.env, {
            ...baseTraceSpan(auth, traceId, requestId, effectiveModel, promptMeta, startedAt, guardrail.action),
            inputTokens: usage?.prompt_tokens ?? null,
            outputTokens: usage?.completion_tokens ?? null,
            ttftMs: getTtftMs(),
            status: "success",
            payload: shouldSamplePayload(auth, DEFAULT_TRACE_SAMPLE_RATE)
              ? { input: outgoingBody.messages, output: null }
              : null,
            attributes: { streaming: true },
          })
        );
      }
    );
  }

  // 6b. Non-streaming — buffer, scrub, parse for usage, return + cache write-through
  const text = await upstream.text();
  let parsedData: Record<string, unknown> | undefined;
  let parsedUsage: OpenAIChatResponse["usage"] | undefined;
  let scrubbedText = text;
  try {
    const data = JSON.parse(text) as OpenAIChatResponse;
    parsedUsage = data.usage;
    parsedData = data as unknown as Record<string, unknown>;
    scrubbedText = JSON.stringify(
      scrubJson(parsedData, effectiveModel, `chat-${requestId}`)
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
  // Always enqueue — even when JSON parse failed we record the completed request
  c.executionCtx.waitUntil(
    sendUsage(c.env, {
      ...baseUsageEvent(auth, effectiveModel, requestId, startedAt),
      inputTokens: parsedUsage?.prompt_tokens ?? null,
      outputTokens: parsedUsage?.completion_tokens ?? null,
      cachedTokens: parsedUsage?.prompt_tokens_details?.cached_tokens ?? null,
      status: "success",
    })
  );
  // Phase 3 S1: emit trace span alongside usage event
  c.executionCtx.waitUntil(
    sendTrace(c.env, {
      ...baseTraceSpan(auth, traceId, requestId, effectiveModel, promptMeta, startedAt, guardrail.action),
      inputTokens: parsedUsage?.prompt_tokens ?? null,
      outputTokens: parsedUsage?.completion_tokens ?? null,
      status: "success",
      payload: shouldSamplePayload(auth, DEFAULT_TRACE_SAMPLE_RATE)
        ? { input: outgoingBody.messages, output: parsedData ?? null }
        : null,
      attributes: {},
    })
  );

  // 6c. Structured output + tool guarantee validation (non-streaming only)
  if (parsedData) {
    // --- Structured output ---
    const jsonSchema = extractJsonSchema(req.response_format);
    if (jsonSchema) {
      const content = extractFirstContent(parsedData);
      const { valid, errors } = content !== null
        ? validateJsonContent(content, jsonSchema)
        : { valid: false as const, errors: ["Response has no string content to validate"] };

      if (!valid) {
        // One constrained retry: append corrective user turn + re-forward
        const retryBody = buildStructuredRetry(outgoingBody, parsedData, jsonSchema, errors);
        let resolved = false;
        try {
          const retryUp = await forwardJson({
            env: c.env, body: retryBody, upstreamKey,
            path: "/chat/completions", signal: c.req.raw.signal,
            extraHeaders: { "X-Title": "AhuraCloud Inference" },
          });
          if (retryUp.ok) {
            const retryText = await retryUp.text();
            const retryData = JSON.parse(retryText) as Record<string, unknown>;
            const retryContent = extractFirstContent(retryData);
            if (retryContent !== null && validateJsonContent(retryContent, jsonSchema).valid) {
              parsedData    = retryData;
              parsedUsage   = (retryData as OpenAIChatResponse).usage;
              scrubbedText  = JSON.stringify(scrubJson(retryData, effectiveModel, `chat-${requestId}`));
              resolved      = true;
              c.header("X-Ahura-Structured", "validated-after-retry");
              // Bill the retry as a second usage event
              c.executionCtx.waitUntil(
                sendUsage(c.env, {
                  ...baseUsageEvent(auth, effectiveModel, `${requestId}-r1`, startedAt),
                  inputTokens:  parsedUsage?.prompt_tokens ?? null,
                  outputTokens: parsedUsage?.completion_tokens ?? null,
                  status: "success",
                })
              );
            }
          }
        } catch { /* network failure on retry — fall through to error */ }

        if (!resolved) {
          return c.json(
            errorBody(
              "Model output failed JSON schema validation after one repair attempt.",
              "invalid_request_error",
              "json_schema_validation_failed",
              requestId,
            ),
            422
          );
        }
      } else {
        c.header("X-Ahura-Structured", "validated");
      }
    }

    // --- Tool call guarantees ---
    if (req.tools && Array.isArray(req.tools) && req.tools.length > 0) {
      const toolDefs = extractToolDefs(req.tools as unknown[]);
      if (toolDefs.size > 0) {
        const toolErrors = validateToolCalls(parsedData, toolDefs);
        if (toolErrors.length > 0) {
          // One repair retry: append bad assistant msg + per-tool error results + user prompt
          const repairBody = buildToolRepairBody(outgoingBody, parsedData, toolErrors);
          let repaired = false;
          try {
            const repairUp = await forwardJson({
              env: c.env, body: repairBody, upstreamKey,
              path: "/chat/completions", signal: c.req.raw.signal,
              extraHeaders: { "X-Title": "AhuraCloud Inference" },
            });
            if (repairUp.ok) {
              const repairText = await repairUp.text();
              const repairData = JSON.parse(repairText) as Record<string, unknown>;
              if (validateToolCalls(repairData, toolDefs).length === 0) {
                parsedData    = repairData;
                parsedUsage   = (repairData as OpenAIChatResponse).usage;
                scrubbedText  = JSON.stringify(scrubJson(repairData, effectiveModel, `chat-${requestId}`));
                repaired      = true;
                c.header("X-Ahura-Tool-Validated", "repaired");
                // Bill the repair retry
                c.executionCtx.waitUntil(
                  sendUsage(c.env, {
                    ...baseUsageEvent(auth, effectiveModel, `${requestId}-r1`, startedAt),
                    inputTokens:  parsedUsage?.prompt_tokens ?? null,
                    outputTokens: parsedUsage?.completion_tokens ?? null,
                    status: "success",
                  })
                );
              }
            }
          } catch { /* repair network failure — degrade gracefully */ }

          if (!repaired) {
            // Non-fatal: return the original response with a warning header
            c.header("X-Ahura-Tool-Validated", "warn");
          }
        } else {
          c.header("X-Ahura-Tool-Validated", "ok");
        }
      }
    }
  }

  // Phase 3 S2: POST-call guardrail scan — redact PII in completion before caching/returning.
  // Only runs for mode="redact" with a pii rule; streaming is best-effort post-hoc (cut for v1).
  if (orgGuardrailPolicy.mode === "redact" && parsedData) {
    const piiRule = orgGuardrailPolicy.rules.find(
      (r): r is Extract<GuardrailRule, { type: "pii" }> => r.type === "pii"
    );
    if (piiRule) {
      const choices = parsedData.choices as Array<{ message?: { role?: string; content?: unknown } }> | undefined;
      if (choices) {
        let mutated = false;
        const newChoices = choices.map((ch) => {
          if (typeof ch?.message?.content !== "string") return ch;
          const { text: clean, hits } = redactPii(ch.message.content, piiRule.categories);
          if (hits.length === 0) return ch;
          mutated = true;
          return { ...ch, message: { ...ch.message, content: clean } };
        });
        if (mutated) {
          parsedData = { ...parsedData, choices: newChoices };
          scrubbedText = JSON.stringify(scrubJson(parsedData, effectiveModel, `chat-${requestId}`));
          c.header("X-Ahura-Guardrail", "redacted");
        }
      }
    }
  }

  // Cache write-through (best effort, doesn't block response)
  if (cacheDecision.cacheable && cacheDecision.key) {
    c.executionCtx.waitUntil(
      writeCache(
        c.env,
        cacheDecision.key,
        scrubbedText,
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

  // Semantic cache write-through
  if (semanticEligible && semanticPromptText) {
    c.executionCtx.waitUntil(
      writeSemanticCache({
        env: c.env,
        orgId: auth.orgId,
        modelId: effectiveModel,
        temperature: req.temperature,
        promptText: semanticPromptText,
        upstreamKey,
        responseBody: scrubbedText,
        contentType: "application/json",
        usage: parsedUsage
          ? {
              prompt_tokens: parsedUsage.prompt_tokens,
              completion_tokens: parsedUsage.completion_tokens,
            }
          : null,
      })
    );
  }

  return new Response(scrubbedText, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "X-Ahura-Request-Id": requestId,
      "X-Ahura-Trace-Id": traceId,
      "X-Ahura-Model": effectiveModel,
      "X-Ahura-Billing": auth.billing,
      "X-Ahura-Cache": cacheDecision.cacheable ? "miss" : "skipped",
      "X-Ahura-Guardrail": guardrail.action,
      ...(promptMeta ? { "X-Ahura-Prompt-Version": String(promptMeta.version) } : {}),
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
    apiKeyId: auth.usageApiKeyId,
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
    // Default: assume no cache served this request. Cache-hit paths
    // override below; the consumer falls back to 'none' anyway.
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

/**
 * Common fields shared across every trace span in this handler.
 * Only the variable parts (tokens, status, payload, attributes) are
 * passed at each call site. Adding a new span field: update here only.
 */
function baseTraceSpan(
  auth: AuthContext,
  traceId: string,
  requestId: string,
  effectiveModel: string,
  promptMeta: { promptId: string; version: number } | null,
  startedAt: number,
  guardrailAction: GuardrailAction
) {
  return {
    orgId: auth.orgId,
    traceId,
    parentSpanId: null,
    requestId,
    apiKeyId: auth.usageApiKeyId,
    name: "gen_ai.chat" as const,
    modelId: effectiveModel,
    promptId: promptMeta?.promptId ?? null,
    promptVersion: promptMeta?.version ?? null,
    experimentId: null,
    arm: null,
    latencyMs: Date.now() - startedAt,
    ttftMs: null,
    costCents: 0,
    guardrailAction,
  };
}

function mapUpstreamStatus(httpStatus: number): UsageEvent["status"] {
  if (httpStatus === 429) return "error_rate_limit";
  if (httpStatus === 401 || httpStatus === 403) return "error_auth";
  if (httpStatus === 400 || httpStatus === 422) return "error_validation";
  return "error_upstream";
}

/**
 * Wraps an upstream SSE Response in a pass-through TransformStream that
 * records when the first non-empty byte chunk arrives, giving us TTFT.
 *
 * The wrapped Response is a drop-in replacement for the original — it has the
 * same status/headers and the same body bytes, just with a TTFT side-channel.
 * Call getTtftMs() inside the onComplete callback (after stream is fully read)
 * to get the captured value.
 */
function wrapTtft(
  upstream: Response,
  startedAt: number,
): { wrapped: Response; getTtftMs: () => number | null } {
  if (!upstream.body) return { wrapped: upstream, getTtftMs: () => null };
  let ttftMs: number | null = null;
  let seen = false;
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (!seen && chunk.byteLength > 0) {
        ttftMs = Date.now() - startedAt;
        seen = true;
      }
      controller.enqueue(chunk);
    },
  });
  upstream.body.pipeTo(transform.writable).catch(() => {});
  return {
    wrapped: new Response(transform.readable, {
      status: upstream.status,
      headers: upstream.headers,
    }),
    getTtftMs: () => ttftMs,
  };
}
