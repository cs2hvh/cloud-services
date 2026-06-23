/**
 * Tool/function-calling guarantees.
 *
 * Validates tool_calls argument blobs against the caller-declared
 * function.parameters schemas.  On validation failure: one repair retry
 * (append corrective tool + user turns, then re-forward).
 *
 * Only runs on non-streaming responses where the full tool_calls payload is
 * present.  For streaming, the client reassembles tool_calls from deltas —
 * the validation layer lives in the caller there.
 *
 * Tool errors are non-fatal: on second failure the original response is
 * returned with X-Ahura-Tool-Validated: warn, NOT a hard error, so agentic
 * loops degrade gracefully rather than crashing.  This differs from
 * structured-output mode which errors on second failure.
 */

import { validateJsonContent } from "./structured-output.ts";

type Schema = Record<string, unknown>;
type ToolMsg = {
  role: string;
  content?: unknown;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

export interface ToolValidationError {
  toolCallId: string;
  functionName: string;
  errors: string[];
}

/** Extract function definitions from a tools array: name → parameters schema. */
export function extractToolDefs(tools: unknown[]): Map<string, Schema> {
  const defs = new Map<string, Schema>();
  for (const t of tools) {
    if (!t || typeof t !== "object") continue;
    const tool = t as Record<string, unknown>;
    if (tool.type !== "function" || !tool.function || typeof tool.function !== "object") continue;
    const fn = tool.function as Record<string, unknown>;
    if (typeof fn.name !== "string" || !fn.parameters || typeof fn.parameters !== "object") continue;
    defs.set(fn.name, fn.parameters as Schema);
  }
  return defs;
}

/** Validate all tool_calls in a response against the declared parameter schemas. */
export function validateToolCalls(
  responseBody: Record<string, unknown>,
  toolDefs: Map<string, Schema>,
): ToolValidationError[] {
  const choices = responseBody.choices as Array<{
    message?: {
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
  }> | undefined;
  const calls = choices?.[0]?.message?.tool_calls;
  if (!calls || calls.length === 0) return [];

  const errors: ToolValidationError[] = [];
  for (const tc of calls) {
    const id   = tc.id ?? "";
    const name = tc.function?.name ?? "";
    const schema = toolDefs.get(name);
    if (!schema) continue; // unknown tool name — can't validate; pass through

    const args = tc.function?.arguments ?? "{}";
    const result = validateJsonContent(args, schema);
    if (!result.valid) {
      errors.push({ toolCallId: id, functionName: name, errors: result.errors });
    }
  }
  return errors;
}

/**
 * Build the repair retry body for a tool-call validation failure.
 * Appends: bad assistant message + a tool result per invalid call + a user correction prompt.
 */
export function buildToolRepairBody(
  originalBody: Record<string, unknown>,
  badResponse: Record<string, unknown>,
  toolErrors: ToolValidationError[],
): Record<string, unknown> {
  const original = (originalBody.messages ?? []) as ToolMsg[];
  const badChoices = badResponse.choices as Array<{ message?: ToolMsg }> | undefined;
  const badAssistant = badChoices?.[0]?.message;

  const repair: ToolMsg[] = [];

  if (badAssistant) {
    repair.push({ ...badAssistant, role: "assistant" as const });
  }

  // For each invalid tool call, return an error as a tool result message
  for (const te of toolErrors) {
    repair.push({
      role: "tool",
      tool_call_id: te.toolCallId,
      content:
        `VALIDATION_FAILED for "${te.functionName}": ` +
        te.errors.slice(0, 2).join("; ") +
        ". Please retry the call with arguments that match the declared parameter schema.",
    });
  }

  repair.push({
    role: "user",
    content: `One or more tool calls contained invalid arguments. Please retry with corrected arguments that exactly match the function parameter schemas.`,
  });

  return { ...originalBody, messages: [...original, ...repair] };
}
