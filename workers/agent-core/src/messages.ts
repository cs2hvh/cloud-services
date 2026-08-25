/**
 * Agents v2 (`agentcore`) — message mapping helpers (T1.1d).
 *
 * Doc: nextstespsAI/12-agent-execution-stages.md (S1.1)
 *
 * Pure input/output transforms between the customer request shape and the loop's
 * working transcript. No I/O — unit-tested with plain assertions.
 */

import type { ResponsesInput } from "./types.js";
import type { LoopMessage, ToolCall } from "./loop.js";

const VALID_ROLES: ReadonlySet<LoopMessage["role"]> = new Set([
  "system",
  "user",
  "assistant",
  "tool",
]);

/** Coerce any message `content` field to a plain string for the transcript. */
function coerceContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  return JSON.stringify(content);
}

/**
 * Normalize the customer `input` (bare string or OpenAI-style message array)
 * into the loop's `LoopMessage[]`. A bare string becomes a single user turn.
 */
export function toMessages(input: ResponsesInput): LoopMessage[] {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }
  return input.map((item) => {
    const rawRole = (item as { role?: unknown }).role;
    const role =
      typeof rawRole === "string" && VALID_ROLES.has(rawRole as LoopMessage["role"])
        ? (rawRole as LoopMessage["role"])
        : "user";
    return { role, content: coerceContent((item as { content?: unknown }).content) };
  });
}

/**
 * Prepend the agent's system prompt (if any) to the mapped input. The runner
 * uses this to build the initial transcript for `runAgentLoop`.
 */
export function buildInitialMessages(
  systemPrompt: string | null | undefined,
  input: ResponsesInput
): LoopMessage[] {
  const base = toMessages(input);
  if (systemPrompt && systemPrompt.trim().length > 0) {
    return [{ role: "system", content: systemPrompt }, ...base];
  }
  return base;
}

/**
 * Build the `tool` message that feeds a tool's output back into the loop,
 * linked to the originating call via `tool_call_id`.
 */
export function toToolMessage(call: ToolCall, output: unknown): LoopMessage {
  return {
    role: "tool",
    tool_call_id: call.id,
    content: coerceContent(output),
  };
}
