/**
 * Brand-scrub utilities for every JSON response leaving the gateway.
 *
 * Hard constraint: upstream provider names (OpenAI, OpenRouter, Cohere,
 * Anthropic, Llama, etc.) must NEVER appear in customer-facing responses.
 *
 * Applied to:
 *   - Non-streaming JSON responses (embeddings, non-streaming chat, rerank…)
 *   - Each SSE data chunk in streaming chat completions
 */

/** Fields OpenRouter adds that expose the upstream vendor. */
const OPAQUE_USAGE_KEYS = new Set(["cost", "is_byok", "cost_details", "reasoning_tokens"]);

/** Keys inside error.metadata that expose the upstream provider. */
const BRAND_META_KEYS = new Set(["provider_name", "provider", "model_id", "model"]);

function cleanErrorMetadata(meta: unknown): unknown {
  if (!meta || typeof meta !== "object") return meta;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (BRAND_META_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function cleanError(err: unknown): unknown {
  if (!err || typeof err !== "object") return err;
  const e = err as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === "provider" || k === "model") continue;
    if (k === "metadata") { out[k] = cleanErrorMetadata(v); continue; }
    out[k] = v;
  }
  return out;
}

interface ScrubbedUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: unknown;
  completion_tokens_details?: unknown;
  [key: string]: unknown;
}

function cleanUsage(u: unknown): ScrubbedUsage | undefined {
  if (!u || typeof u !== "object") return undefined;
  const cleaned: ScrubbedUsage = {};
  for (const [k, v] of Object.entries(u as Record<string, unknown>)) {
    if (!OPAQUE_USAGE_KEYS.has(k)) cleaned[k] = v;
  }
  return cleaned;
}

/**
 * Scrub a parsed non-streaming completion or embedding response object in-place
 * and return the cleaned copy.
 *
 * @param obj      Parsed JSON from upstream
 * @param modelId  The model ID the customer used in their request (replace upstream model)
 * @param requestId Our request ID to use as the response `id` (optional)
 */
export function scrubJson(
  obj: Record<string, unknown>,
  modelId: string,
  requestId?: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "provider") continue;           // brand leak
    if (k === "user_id") continue;            // OR internal user id — never expose
    if (k === "model") { out[k] = modelId; continue; }
    if (k === "id" && requestId) { out[k] = requestId; continue; }
    if (k === "usage") { const u = cleanUsage(v); if (u) out[k] = u; continue; }
    if (k === "error") { out[k] = cleanError(v); continue; }  // strip metadata.provider_name etc.
    out[k] = v;
  }
  return out;
}

/**
 * Scrub a single SSE line (the raw text of one `data: {...}` line).
 * Returns the scrubbed line, or the original if it's not a data chunk.
 */
export function scrubSseLine(
  line: string,
  modelId: string,
  requestId?: string
): string {
  if (!line.startsWith("data: ") || line === "data: [DONE]") return line;
  const json = line.slice(6);
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    const scrubbed = scrubJson(obj, modelId, requestId);
    return "data: " + JSON.stringify(scrubbed);
  } catch {
    return line; // malformed chunk — pass through unchanged
  }
}

/**
 * Drop-in replacement for openrouter.streamPassthrough() that scrubs each
 * SSE line while buffering the complete scrubbed text for the onComplete hook.
 *
 * Returns a Response with a scrubbed SSE body. The onComplete callback receives
 * the full scrubbed text so that extractUsageFromSse() still works (usage fields
 * are preserved; only `provider`, `model`, and cost fields are stripped/replaced).
 */
export function scrubSsePassthrough(
  upstream: Response,
  modelId: string,
  requestId: string,
  responseHeaders: Record<string, string>,
  onComplete?: (scrubbedText: string) => void
): Response {
  if (!upstream.body) return upstream;

  let buffer = "";
  let collected = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const transformer = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const raw = decoder.decode(chunk, { stream: true });
      const lines = (buffer + raw).split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const scrubbed = scrubSseLine(line, modelId, requestId);
        controller.enqueue(encoder.encode(scrubbed + "\n"));
        collected += scrubbed + "\n";
      }
    },
    flush(controller) {
      const tail = decoder.decode();
      if (buffer || tail) {
        const full = buffer + tail;
        const scrubbed = scrubSseLine(full, modelId, requestId);
        if (scrubbed) controller.enqueue(encoder.encode(scrubbed + "\n"));
        collected += scrubbed + "\n";
      }
      onComplete?.(collected);
    },
  });

  upstream.body
    .pipeTo(transformer.writable)
    .catch((err) =>
      console.error(JSON.stringify({ level: "warn", message: "upstream stream aborted", err: String(err) }))
    );

  return new Response(transformer.readable, {
    status: 200,
    headers: responseHeaders,
  });
}

/**
 * Takes a ReadableStream from the upstream SSE response and returns a new
 * ReadableStream with brand fields removed from every `data:` chunk.
 */
export function scrubSseStream(
  upstream: ReadableStream<Uint8Array>,
  modelId: string,
  requestId?: string
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim()) {
              controller.enqueue(encoder.encode(scrubSseLine(buffer, modelId, requestId) + "\n"));
            }
            controller.close();
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            controller.enqueue(encoder.encode(scrubSseLine(line, modelId, requestId) + "\n"));
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
