/**
 * Reasoning controls for self-served models.
 *
 * The hosted GLM pods accept a reasoning-effort ladder, in three spellings a
 * caller may already be using:
 *
 *   "reasoning_effort": "medium"                         OpenAI-style, what
 *                                                         OpenCode, Hermes and
 *                                                         most SDKs send
 *   "chat_template_kwargs": {"reasoning_effort": "high"}  the template form
 *   "custom_params": {"thinking_budget": 300}            an exact token cap
 *                                                         that overrides the
 *                                                         ladder
 *   "enable_thinking": false                             no-think mode
 *
 * Ladder: none / minimal / off answer at once; low rarely thinks; medium is
 * capped at 1,024 thinking tokens; high at 4,096; xhigh / max / nothing sent
 * is unbounded, which is the default.
 *
 * On /v1/chat/completions all of those are body fields and pass through to
 * the pod untouched. On /v1/messages the caller speaks Anthropic, where the
 * same intent is spelled `thinking` and `output_config.effort`; this module
 * translates that spelling into the pod's. It runs only for self-served
 * models: partner backends have their own contracts and the translation
 * is not applied there.
 */

export interface AnthropicReasoningFields {
  thinking?: { type?: string; budget_tokens?: number } | null;
  output_config?: { effort?: string } | null;
}

/** The pod's ladder, as the request may spell it. */
export const REASONING_EFFORTS = ["none", "minimal", "off", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && (REASONING_EFFORTS as readonly string[]).includes(value);
}

/**
 * The OpenAI-format fields that express an Anthropic request's thinking
 * settings. Empty when the request said nothing about thinking, so the pod's
 * default (unbounded) applies exactly as it would on the chat route.
 *
 *   thinking.type = "disabled"        → enable_thinking: false
 *   thinking.budget_tokens = N        → custom_params.thinking_budget = N
 *   output_config.effort = "medium"   → reasoning_effort: "medium"
 *
 * A budget wins over an effort level when both are present, because that is
 * the pod's own precedence and the caller who set a number meant the number.
 */
export function reasoningControlsFromAnthropic(req: AnthropicReasoningFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const effort = req.output_config?.effort;
  if (isReasoningEffort(effort)) out.reasoning_effort = effort;

  const thinking = req.thinking;
  if (thinking && typeof thinking === "object") {
    if (thinking.type === "disabled") {
      // Both spellings. Measured live on 2026-09-08: reasoning_effort "none"
      // brought thinking to a single token; enable_thinking false alone at
      // the top level did not.
      out.reasoning_effort = "none";
      out.enable_thinking = false;
    } else if (
      typeof thinking.budget_tokens === "number" &&
      Number.isFinite(thinking.budget_tokens) &&
      thinking.budget_tokens >= 0
    ) {
      out.custom_params = { thinking_budget: Math.floor(thinking.budget_tokens) };
    }
  }

  return out;
}
