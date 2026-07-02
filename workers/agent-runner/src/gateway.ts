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

/** Perform one model turn against the gateway. Throws on non-2xx / timeout. */
export async function callModelTurn(
  env: RunnerEnv,
  model: string,
  messages: LoopMessage[]
): Promise<ModelTurn> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.modelTurnTimeoutMs);
  try {
    const res = await fetch(`${env.inferenceBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.inferencePlatformKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Model turn returned HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    return toModelTurn((await res.json()) as ChatCompletionResponse);
  } finally {
    clearTimeout(timer);
  }
}

/** Bind a `CallModel` for one run's model. The loop injects this. */
export function makeCallModel(env: RunnerEnv, model: string): CallModel {
  return (messages) => callModelTurn(env, model, messages);
}
