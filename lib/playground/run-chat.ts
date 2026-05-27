/**
 * Shared runner for the inference dashboard playground.
 *
 * Used by both single-model mode and multi-model compare mode, so they can
 * stream from the same gateway with identical SSE parsing + abort + stats
 * collection logic. Lives outside `components/` so it can be unit-tested
 * without a React tree.
 *
 * No React, no DOM — pure async function that yields delta strings via
 * the onDelta callback and resolves with the final RunSummary.
 */

export interface RunParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  stream: boolean;
}

export interface RunSummary {
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  ttftMs: number | null;
  cacheStatus: string | null;
  /** When stream=false this is the full body; when streaming it's "" (deltas were already pushed). */
  fullText: string;
}

export interface RunOptions {
  apiBase: string;
  apiKey: string;
  /** Optional X-Ahura-Preset header — routes through a saved preset's fallback chain. */
  presetId?: string;
  /** Optional X-Ahura-Billing header — "platform" (default) or "byok". */
  billing?: "platform" | "byok";
  signal?: AbortSignal;
  /** Called once per streaming delta chunk. Ignored for stream=false. */
  onDelta?: (delta: string) => void;
}

export class GatewayError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Gateway ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

export async function runChat(params: RunParams, opts: RunOptions): Promise<RunSummary> {
  const messages: Array<{ role: string; content: string }> = [];
  if (params.systemPrompt.trim()) {
    messages.push({ role: "system", content: params.systemPrompt.trim() });
  }
  messages.push({ role: "user", content: params.userPrompt.trim() });

  const body = {
    model: params.model,
    messages,
    temperature: params.temperature,
    top_p: params.topP,
    max_tokens: params.maxTokens,
    stream: params.stream,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${opts.apiKey}`,
  };
  if (opts.presetId) headers["X-Ahura-Preset"] = opts.presetId;
  if (opts.billing && opts.billing !== "platform") headers["X-Ahura-Billing"] = opts.billing;

  const startedAt = Date.now();
  const r = await fetch(`${opts.apiBase}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  const cacheStatus = r.headers.get("X-Ahura-Cache");

  if (!r.ok) {
    const text = await r.text();
    throw new GatewayError(r.status, text);
  }

  // Non-streaming
  if (!params.stream) {
    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const fullText = data.choices?.[0]?.message?.content ?? "";
    return {
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - startedAt,
      ttftMs: null,
      cacheStatus,
      fullText,
    };
  }

  // Streaming SSE
  const reader = r.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let firstTokenAt: number | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          if (firstTokenAt === null) firstTokenAt = Date.now();
          opts.onDelta?.(delta);
        }
        if (chunk.usage) {
          if (chunk.usage.prompt_tokens !== undefined) inputTokens = chunk.usage.prompt_tokens;
          if (chunk.usage.completion_tokens !== undefined) outputTokens = chunk.usage.completion_tokens;
        }
      } catch {
        // Skip non-JSON SSE comments / pings
      }
    }
  }

  return {
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startedAt,
    ttftMs: firstTokenAt !== null ? firstTokenAt - startedAt : null,
    cacheStatus,
    fullText: "",
  };
}

export function computeCostCents(
  inputTokens: number | null,
  outputTokens: number | null,
  inputPricePerMtok: number | null,
  outputPricePerMtok: number | null
): number | null {
  if (inputTokens === null && outputTokens === null) return null;
  const inputRate = inputPricePerMtok ?? 0;
  const outputRate = outputPricePerMtok ?? 0;
  const inT = inputTokens ?? 0;
  const outT = outputTokens ?? 0;
  return Math.ceil((inT * inputRate + outT * outputRate) / 1_000_000);
}
