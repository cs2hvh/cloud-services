/**
 * POST /v1/agent-tool-usage — agent tool-cost ingress (found missing by the
 * 2026-07-06 audit). agent-runner is a plain Node process; it can't reach the
 * USAGE_EVENTS Cloudflare Queue binding directly, so tool steps (web_search,
 * code/cpu_second, function webhooks, file_search, memory write/search)
 * priced through the agent/* pseudo-catalog rows never reached the real
 * metering pipeline — only agentcore.run_steps saw them. This route is the
 * bridge: it re-shapes an already-computed tool step into a real UsageEvent
 * and enqueues it, so agent tool cost flows through the exact same
 * computeUnitCost() path as every other billed SKU (doc 09 §2.B — no
 * parallel queue).
 *
 * Catalog rows: web_search/code/function came from 20260701000003.
 * file_search + memory (ONE row, `agent/memory`, carrying BOTH
 * cents_per_memory_write and cents_per_memory_search) came from
 * 20260703000002 — already live before this ingress bridge was built. Don't
 * invent separate agent/memory-write / agent/memory-search rows; that was an
 * error caught during a self-review that duplicated file-search and split
 * memory into ids nothing else references — the correct model_id for BOTH
 * memory_write and memory_search is the single existing `agent/memory` row.
 * What was genuinely missing (and is what this bridge + 20260706000001's
 * consumer changes actually add) is a computeUnitCost() case for these unit
 * labels and a way for agent-runner to reach USAGE_EVENTS at all.
 *
 * This is a reporting endpoint for cost already incurred, not a new request
 * to gate — mounted with only authMiddleware (no spendCheck/rateLimit; see
 * index.ts). Only reachable via the on-behalf-of path (auth.ts): a customer's
 * own API key resolves auth.keyId to its own key, never the `obo:` prefix,
 * so this route rejects it even though authMiddleware alone would let it
 * through — defense in depth against a customer inflating their own spend
 * counter for free.
 */
import type { Context } from "hono";
import type { Env, HonoVariables, UsageEvent } from "../types.ts";
import { isOnBehalfOf } from "../lib/on-behalf-of.ts";

type ToolType = "web_search" | "code" | "function" | "file_search" | "memory_write" | "memory_search" | "mcp";
type ToolUnitLabel =
  | "web_search"
  | "cpu_second"
  | "function_call"
  | "file_search"
  | "memory_write"
  | "memory_search"
  | "mcp_call";

const TOOL_TYPE_TO_MODEL_ID: Record<ToolType, string> = {
  web_search: "agent/web-search",
  code: "agent/code-interpreter",
  function: "agent/function-call",
  file_search: "agent/file-search",
  // Both memory actions share ONE pre-existing catalog row (20260703000002) —
  // its pricing JSONB carries both cents_per_memory_write and
  // cents_per_memory_search keys, so computeUnitCost() resolves either
  // unit_label correctly off the same row.
  memory_write: "agent/memory",
  memory_search: "agent/memory",
  // agent/mcp (20260707000001, doc 14 M2) — one row, one unit_label.
  mcp: "agent/mcp",
};

const VALID_UNIT_LABELS: ToolUnitLabel[] = [
  "web_search",
  "cpu_second",
  "function_call",
  "file_search",
  "memory_write",
  "memory_search",
  "mcp_call",
];

interface AgentToolUsageBody {
  toolType?: ToolType;
  unitLabel?: ToolUnitLabel;
  units?: number;
  requestId?: string;
  status?: "success" | "error";
  latencyMs?: number;
}

function badRequest(c: Context, message: string) {
  return c.json({ error: { message, type: "invalid_request_error", code: "invalid_request" } }, 400);
}

export const agentToolUsage = async (
  c: Context<{ Bindings: Env; Variables: HonoVariables }>
) => {
  const auth = c.get("auth");
  if (!isOnBehalfOf(auth.keyId)) {
    return c.json(
      { error: { message: "Forbidden", type: "invalid_request_error", code: "not_on_behalf_of" } },
      403
    );
  }

  let body: AgentToolUsageBody;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }

  const { toolType, unitLabel, units, requestId } = body;
  if (!toolType || !TOOL_TYPE_TO_MODEL_ID[toolType]) return badRequest(c, "Unknown toolType");
  if (!unitLabel || !VALID_UNIT_LABELS.includes(unitLabel)) return badRequest(c, "Unknown unitLabel");
  if (typeof units !== "number" || !Number.isFinite(units) || units < 0) {
    return badRequest(c, "units must be a non-negative number");
  }
  if (!requestId) return badRequest(c, "requestId is required");

  const event: UsageEvent = {
    orgId: auth.orgId,
    apiKeyId: auth.usageApiKeyId,
    userId: null,
    modelId: TOOL_TYPE_TO_MODEL_ID[toolType],
    modality: "agent_tool",
    requestId,
    billedTo: auth.billing,
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    numUnits: units,
    unitLabel,
    costCents: 0, // computed downstream by the usage consumer's catalog pricing
    upstreamCostCents: 0,
    isOffPeak: false,
    latencyMs: body.latencyMs ?? 0,
    ttftMs: null,
    status: body.status === "error" ? "error_internal" : "success",
    errorCode: null,
    cacheKind: "none",
    occurredAt: new Date().toISOString(),
  };

  try {
    await c.env.USAGE_EVENTS.send(event);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "agent-tool-usage",
        message: "Failed to enqueue usage event",
        orgId: auth.orgId,
        toolType,
        err: err instanceof Error ? err.message : String(err),
      })
    );
    return c.json({ error: { message: "Enqueue failed", type: "internal_error" } }, 500);
  }

  return c.json({ accepted: true });
};
