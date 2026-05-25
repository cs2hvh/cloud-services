/**
 * POST /v1/messages — Anthropic Messages API compatibility shim.
 *
 * Accepts an Anthropic-shaped request, translates to OpenAI Chat Completions,
 * forwards to OpenRouter, and translates the response back to Anthropic shape.
 *
 * Phase 1 scope:
 *   • text content (string or array of {type:"text"} blocks)
 *   • image content (Anthropic image blocks → OpenAI image_url with data URI)
 *   • system prompt as either string or array of text blocks
 *   • streaming (OpenAI SSE → Anthropic event-named SSE)
 *   • tool calling — passed through (OpenRouter handles cross-format tool calls
 *     for Anthropic-line models; for non-Anthropic backends behavior may vary)
 *
 * Out of scope until Phase 2:
 *   • Tool-use response streaming (we stream as text-only deltas)
 *   • Prompt-caching block hints (`cache_control`)
 *   • Container/code-execution tools
 */
import type { Handler } from "hono";
import { z } from "zod";
import type { AuthContext, Env, HonoVariables, UsageEvent } from "../types.ts";
import {
  forwardJson,
  resolveUpstreamKey,
  streamPassthrough,
} from "../lib/openrouter.ts";
import { lookupCache, shouldCacheMessages, writeCache } from "../lib/cache.ts";

// ───────────────────────────────────────────────────────────────
// Anthropic request schema (subset — passthrough additional fields)
// ───────────────────────────────────────────────────────────────
const anthropicContentBlock = z.union([
  z.object({ type: z.literal("text"), text: z.string() }).passthrough(),
  z
    .object({
      type: z.literal("image"),
      source: z.object({
        type: z.literal("base64"),
        media_type: z.string(),
        data: z.string(),
      }),
    })
    .passthrough(),
  z.object({ type: z.literal("tool_use") }).passthrough(),
  z.object({ type: z.literal("tool_result") }).passthrough(),
  z.object({ type: z.string() }).passthrough(),
]);

const anthropicMessage = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.union([z.string(), z.array(anthropicContentBlock)]),
  })
  .passthrough();

const messagesRequestSchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(anthropicMessage).min(1),
    system: z.union([z.string(), z.array(anthropicContentBlock)]).optional(),
    max_tokens: z.number().int().positive(),
    stream: z.boolean().optional(),
    temperature: z.number().min(0).max(1).optional(),
    top_p: z.number().min(0).max(1).optional(),
    top_k: z.number().int().positive().optional(),
    stop_sequences: z.array(z.string()).optional(),
    tools: z.array(z.unknown()).optional(),
    tool_choice: z.unknown().optional(),
    metadata: z.object({ user_id: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

type AnthropicRequest = z.infer<typeof messagesRequestSchema>;
type AnthropicContentBlock = z.infer<typeof anthropicContentBlock>;

interface OpenAIChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

// ───────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────
export const messagesShim: Handler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");

  // 1. Parse + validate
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(anthropicError("invalid_request_error", "Invalid JSON body", requestId), 400);
  }

  const parsed = messagesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      anthropicError(
        "invalid_request_error",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        requestId
      ),
      400
    );
  }
  const req = parsed.data;

  // 2. Normalize model id — accept bare "claude-haiku-4.5" or full "anthropic/claude-haiku-4.5"
  const normalizedModel = req.model.includes("/")
    ? req.model
    : `anthropic/${req.model}`;

  // 3. Scope check
  if (
    auth.allowedModels &&
    auth.allowedModels.length > 0 &&
    !auth.allowedModels.includes(normalizedModel)
  ) {
    return c.json(
      anthropicError(
        "permission_error",
        `Model "${normalizedModel}" is not allowed for this API key`,
        requestId
      ),
      403
    );
  }

  // 4. Resolve upstream key
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
      anthropicError(
        "authentication_error",
        err instanceof Error ? err.message : "BYOK key unavailable",
        requestId
      ),
      400
    );
  }

  // 5. Translate Anthropic → OpenAI body
  const openaiBody = anthropicToOpenAI(req, normalizedModel);

  c.header("X-Ahura-Model", normalizedModel);
  c.header("X-Ahura-Billing", auth.billing);
  c.header("anthropic-version", c.req.header("anthropic-version") ?? "2023-06-01");

  // 5b. L1 cache lookup — Anthropic non-streaming, deterministic (or aggressive)
  //     requests. The cached body is the Anthropic-shaped response so a hit
  //     skips upstream call AND the response translation step.
  const cacheDecision = await shouldCacheMessages(c.req.raw, req, auth.orgId);
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
          "X-Ahura-Model": normalizedModel,
          "X-Ahura-Billing": auth.billing,
          "X-Ahura-Cache": "hit",
          "X-Ahura-Cache-Age": String(Math.round((Date.now() - hit.cachedAt) / 1000)),
          "anthropic-version": c.req.header("anthropic-version") ?? "2023-06-01",
        },
      });
    }
    c.header("X-Ahura-Cache", "miss");
  } else if (cacheDecision.bypass) {
    c.header("X-Ahura-Cache", "bypass");
  } else if (cacheDecision.reason === "streaming") {
    c.header("X-Ahura-Cache", "streaming-skipped");
  } else if (cacheDecision.reason === "non-deterministic") {
    c.header("X-Ahura-Cache", "non-deterministic");
  }

  // 6. Forward to OpenRouter
  const upstream = await forwardJson({
    env: c.env,
    body: openaiBody,
    upstreamKey,
    path: "/chat/completions",
    signal: c.req.raw.signal,
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    c.executionCtx.waitUntil(
      sendUsage(c.env, {
        ...baseUsageEvent(auth, normalizedModel, requestId, startedAt),
        status: mapUpstreamStatus(upstream.status),
        errorCode: `upstream_${upstream.status}`,
      })
    );
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json", "X-Ahura-Request-Id": requestId },
    });
  }

  // 7a. Streaming — convert OpenAI SSE → Anthropic SSE events
  if (req.stream) {
    return convertOpenAIStreamToAnthropic(upstream, normalizedModel, (usage) => {
      c.executionCtx.waitUntil(
        sendUsage(c.env, {
          ...baseUsageEvent(auth, normalizedModel, requestId, startedAt),
          inputTokens: usage?.input_tokens ?? null,
          outputTokens: usage?.output_tokens ?? null,
          status: "success",
        })
      );
    });
  }

  // 7b. Non-streaming
  const text = await upstream.text();
  let oaiResp: OpenAIChatResponse;
  try {
    oaiResp = JSON.parse(text) as OpenAIChatResponse;
  } catch {
    return c.json(
      anthropicError("api_error", "Upstream returned malformed JSON", requestId),
      502
    );
  }

  const anthropicResp = openaiToAnthropic(oaiResp, normalizedModel);

  c.executionCtx.waitUntil(
    sendUsage(c.env, {
      ...baseUsageEvent(auth, normalizedModel, requestId, startedAt),
      inputTokens: oaiResp.usage?.prompt_tokens ?? null,
      outputTokens: oaiResp.usage?.completion_tokens ?? null,
      cachedTokens: oaiResp.usage?.prompt_tokens_details?.cached_tokens ?? null,
      status: "success",
    })
  );

  // Write-through to L1 cache. We cache the Anthropic-shaped JSON, not the
  // upstream OpenAI shape — a cache hit can short-circuit the entire response
  // translation step.
  if (cacheDecision.cacheable && cacheDecision.key) {
    c.executionCtx.waitUntil(
      writeCache(
        c.env,
        cacheDecision.key,
        JSON.stringify(anthropicResp),
        "application/json",
        cacheDecision.ttlSeconds,
        {
          prompt_tokens: oaiResp.usage?.prompt_tokens,
          completion_tokens: oaiResp.usage?.completion_tokens,
        }
      )
    );
  }

  return c.json(anthropicResp);
};

// ───────────────────────────────────────────────────────────────
// Anthropic ↔ OpenAI translation
// ───────────────────────────────────────────────────────────────

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<Record<string, unknown>>;
}

function anthropicToOpenAI(req: AnthropicRequest, normalizedModel: string) {
  const messages: OpenAIMessage[] = [];

  if (req.system) {
    messages.push({
      role: "system",
      content: typeof req.system === "string" ? req.system : blocksToText(req.system),
    });
  }

  for (const msg of req.messages) {
    if (typeof msg.content === "string") {
      messages.push({ role: msg.role, content: msg.content });
      continue;
    }
    // Array of content blocks — convert to OpenAI multimodal format
    const openaiContent: Array<Record<string, unknown>> = [];
    for (const block of msg.content) {
      if (block.type === "text" && "text" in block) {
        openaiContent.push({ type: "text", text: (block as { text: string }).text });
      } else if (block.type === "image" && "source" in block) {
        const source = (block as { source: { type: string; media_type: string; data: string } })
          .source;
        if (source.type === "base64") {
          openaiContent.push({
            type: "image_url",
            image_url: { url: `data:${source.media_type};base64,${source.data}` },
          });
        }
      }
      // Other block types (tool_use / tool_result) are passed through — OpenRouter
      // accepts Anthropic-shaped tool blocks on Anthropic-line models.
    }
    messages.push({
      role: msg.role,
      content: openaiContent.length === 1 && openaiContent[0]?.type === "text"
        ? (openaiContent[0].text as string)
        : openaiContent,
    });
  }

  const body: Record<string, unknown> = {
    model: normalizedModel,
    messages,
    max_tokens: req.max_tokens,
    stream: req.stream,
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.top_p !== undefined) body.top_p = req.top_p;
  if (req.stop_sequences) body.stop = req.stop_sequences;
  if (req.tools) body.tools = req.tools;
  if (req.tool_choice) body.tool_choice = req.tool_choice;
  if (req.metadata?.user_id) body.user = req.metadata.user_id;

  // Anthropic's top_k has no direct OpenAI Chat Completions equivalent; OpenRouter
  // passes unknown fields to providers that understand them, so include verbatim.
  if (req.top_k !== undefined) body.top_k = req.top_k;

  return body;
}

function blocksToText(blocks: AnthropicContentBlock[]): string {
  return blocks
    .map((b) => ("text" in b ? (b as { text: string }).text : ""))
    .join("\n");
}

function openaiToAnthropic(resp: OpenAIChatResponse, model: string) {
  const choice = resp.choices?.[0];
  const content = choice?.message?.content ?? "";
  return {
    id: resp.id?.startsWith("msg_") ? resp.id : `msg_${resp.id ?? crypto.randomUUID()}`,
    type: "message" as const,
    role: "assistant" as const,
    model,
    content: [{ type: "text" as const, text: content }],
    stop_reason: mapFinishReason(choice?.finish_reason ?? null),
    stop_sequence: null,
    usage: {
      input_tokens: resp.usage?.prompt_tokens ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      output_tokens: resp.usage?.completion_tokens ?? 0,
    },
  };
}

function mapFinishReason(reason: string | null): string {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "content_filter":
      return "refusal";
    default:
      return "end_turn";
  }
}

// ───────────────────────────────────────────────────────────────
// Streaming conversion — OpenAI SSE → Anthropic SSE
// ───────────────────────────────────────────────────────────────

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

function convertOpenAIStreamToAnthropic(
  upstream: Response,
  model: string,
  onComplete: (usage: AnthropicUsage | undefined) => void
): Response {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  let messageId = `msg_${crypto.randomUUID()}`;
  let messageStarted = false;
  let contentBlockStarted = false;
  let outputTokens = 0;
  let inputTokens: number | undefined;
  let finalStopReason = "end_turn";
  let leftover = "";

  const transformer = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      leftover += decoder.decode(chunk, { stream: true });
      const lines = leftover.split("\n");
      leftover = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;

        let data: {
          id?: string;
          choices?: Array<{
            delta?: { content?: string; role?: string };
            finish_reason?: string | null;
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        try {
          data = JSON.parse(payload);
        } catch {
          continue;
        }

        if (!messageStarted) {
          messageStarted = true;
          if (data.id) messageId = data.id.startsWith("msg_") ? data.id : `msg_${data.id}`;
          emit(controller, encoder, "message_start", {
            type: "message_start",
            message: {
              id: messageId,
              type: "message",
              role: "assistant",
              model,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          });
        }

        const choice = data.choices?.[0];
        const deltaContent = choice?.delta?.content;

        if (deltaContent) {
          if (!contentBlockStarted) {
            contentBlockStarted = true;
            emit(controller, encoder, "content_block_start", {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" },
            });
          }
          emit(controller, encoder, "content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: deltaContent },
          });
        }

        if (choice?.finish_reason) {
          finalStopReason = mapFinishReason(choice.finish_reason);
        }

        if (data.usage) {
          if (data.usage.prompt_tokens !== undefined) inputTokens = data.usage.prompt_tokens;
          if (data.usage.completion_tokens !== undefined)
            outputTokens = data.usage.completion_tokens;
        }
      }
    },
    flush(controller) {
      if (contentBlockStarted) {
        emit(controller, encoder, "content_block_stop", {
          type: "content_block_stop",
          index: 0,
        });
      }
      emit(controller, encoder, "message_delta", {
        type: "message_delta",
        delta: { stop_reason: finalStopReason, stop_sequence: null },
        usage: { output_tokens: outputTokens },
      });
      emit(controller, encoder, "message_stop", { type: "message_stop" });
      onComplete({ input_tokens: inputTokens, output_tokens: outputTokens });
    },
  });

  upstream.body?.pipeTo(transformer.writable).catch((err) => {
    console.error(
      JSON.stringify({
        level: "warn",
        message: "Anthropic shim upstream aborted",
        err: String(err),
      })
    );
  });

  return new Response(transformer.readable, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    },
  });
}

function emit(
  controller: TransformStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  eventName: string,
  payload: unknown
): void {
  controller.enqueue(
    encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`)
  );
}

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

function anthropicError(type: string, message: string, requestId: string) {
  return {
    type: "error",
    error: { type, message },
    request_id: requestId,
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
    costCents: 0,
    upstreamCostCents: 0,
    isOffPeak: false,
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
        message: "Failed to enqueue usage event from messages shim",
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
