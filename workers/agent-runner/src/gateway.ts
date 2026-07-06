/**
 * Inference-gateway client (T1.3c).
 *
 * Each agent model turn is one internal call to our OWN /v1/chat/completions —
 * so model routing stays brand-hidden (§6), exactly like eval-runner. Returns
 * the normalized `ModelTurn` the pure loop consumes.
 *
 * NOTE (billing, S1): these calls authenticate with the platform key. Attributing
 * model-turn cost to the CUSTOMER's org/key (on-behalf-of billing) is wired with
 * the gateway in S1.2 + Phase-0 billing hardening — until then the runner records
 * cost on run_steps/runs for the trace + mid-run guard but does not charge.
 */
import type { CallModel, LoopMessage, ModelTurn, ToolCall } from "@ahura/agent-core";
import type { RunnerEnv } from "./env.js";

/** OpenAI-shaped tool schema advertised to the model so it can emit tool_calls. */
export interface ModelTool {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Map a chat-completions response into the loop's ModelTurn. Tool-call `type`
 *  defaults to "function"; real hosted-tool routing (web_search/file_search/…)
 *  is resolved by the dispatcher in S2. */
function toModelTurn(data: ChatCompletionResponse): ModelTurn {
  const message = data.choices?.[0]?.message ?? {};
  const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((tc, i) => ({
    id: tc.id ?? `call_${i}`,
    type: "function",
    name: tc.function?.name ?? "",
    arguments: tc.function?.arguments ?? "{}",
  }));
  return {
    content: message.content ?? "",
    toolCalls,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

/** Serialize the loop's working transcript into OpenAI chat-completions wire
 *  format. Critically, an assistant turn that called tools must carry the NESTED
 *  `tool_calls` shape ({id, type:'function', function:{name, arguments}}) — our
 *  loop stores a flat ToolCall — and each tool result is a `role:'tool'` message
 *  keyed by tool_call_id. Without this, the follow-up turn after any tool call
 *  400s. (Found by live web_search testing.) */
export function toWireMessages(messages: LoopMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

/** Max attempts for one model turn (1 try + 2 retries) on TRANSIENT failures. */
const MODEL_TURN_ATTEMPTS = 3;

/** Retry 5xx + network/timeout (transient); never retry 4xx — a client error
 *  (bad request, or a guardrail BLOCK) won't succeed on retry and re-sending
 *  wastes tokens/latency. */
function isTransientModelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/HTTP 4\d\d/.test(msg)) return false;
  if (/HTTP 5\d\d/.test(msg)) return true;
  return true; // AbortError (timeout) / network reset — transient
}

/** Perform one model turn against the gateway. Retries transient failures (5xx,
 *  timeout, network) with backoff so a momentary upstream blip doesn't fail the
 *  whole run; throws on a 4xx (incl. guardrail block) immediately. When `tools`
 *  is supplied, the model may emit tool_calls the runner dispatches. */
export async function callModelTurn(
  env: RunnerEnv,
  model: string,
  messages: LoopMessage[],
  tools?: ModelTool[],
  guardrail?: string | null
): Promise<ModelTurn> {
  const body: Record<string, unknown> = { model, messages: toWireMessages(messages) };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.inferencePlatformKey}`,
    "Content-Type": "application/json",
  };
  // Apply the agent's guardrail via the existing gateway enforcement (Phase 3):
  // the chat route evaluates the policy each turn and returns a non-2xx when it
  // BLOCKS → a 4xx here → thrown (not retried) → the run fails with that reason.
  if (guardrail && guardrail !== "off") headers["X-Ahura-Guardrail"] = guardrail;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MODEL_TURN_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.modelTurnTimeoutMs);
    try {
      const res = await fetch(`${env.inferenceBaseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Model turn returned HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      return toModelTurn((await res.json()) as ChatCompletionResponse);
    } catch (err) {
      lastErr = err;
      if (attempt >= MODEL_TURN_ATTEMPTS || !isTransientModelError(err)) throw err;
      await new Promise((r) => setTimeout(r, 300 * attempt)); // backoff: 300ms, 600ms
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr; // unreachable (loop returns or throws) — satisfies the type checker
}

/** Bind a `CallModel` for one run's model + tool schema + guardrail. The loop injects this. */
export function makeCallModel(
  env: RunnerEnv,
  model: string,
  tools?: ModelTool[],
  guardrail?: string | null
): CallModel {
  return (messages) => callModelTurn(env, model, messages, tools, guardrail);
}

/** Embed text via the gateway's /v1/embeddings (brand-hidden catalog model).
 *  Used by file_search to embed the query before the vector RPC. */
export async function embedText(
  env: RunnerEnv,
  model: string,
  input: string
): Promise<{ embedding: number[]; tokens: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.toolTimeoutMs);
  try {
    const res = await fetch(`${env.inferenceBaseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.inferencePlatformKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`embeddings returned HTTP ${res.status}: ${txt.slice(0, 150)}`);
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
      usage?: { prompt_tokens?: number };
    };
    return {
      embedding: data.data?.[0]?.embedding ?? [],
      tokens: data.usage?.prompt_tokens ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}
