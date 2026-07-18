/**
 * Agents v2 (`agentcore`) — the one interface every tool hangs off.
 *
 * Doc: nextstespsAI/11-agent-implementation-plan.md (§6) · 12-agent-execution-stages.md (T0.3)
 *
 * Design rule (§6): the agent loop is a PURE function that takes a `dispatchTool`
 * callback. Every hosted tool, inline function webhook, and (later) MCP binding
 * implements this single `AgentTool` interface, so adding a tool = one file + one
 * line in the HOSTED_TOOLS map — the loop, gateway, and runner never change.
 */

import type { AgentToolDecl, StepType } from "../types.js";

/**
 * Metering emitted by a tool run, in the unified usage-event shape (§9).
 * `unitLabel` must match a case in the USAGE_EVENTS consumer switch
 * (workers/inference/src/consumers/usage.ts) and a catalog price row.
 *
 * There is intentionally NO parallel queue — the critique (doc 09 §2.B) kills
 * that. Tool steps flow through the same `USAGE_EVENTS` pipeline as model steps.
 */
export interface ToolMetering {
  units: number;
  unitLabel: string;
}

/**
 * Execution context handed to every tool. Carries identity for billing/RLS and
 * the substrate handles a tool may need (embeddings, sandbox pool, http). Kept
 * deliberately small; adapters pull only what they use.
 */
export interface RunCtx {
  runId: string;
  orgId: string;
  billingUserId: string;
  /** The defined agent's id (absent for inline runs). Scopes agent memory (S5). */
  agentId?: string;
  /** Org is zero-data-retention → tools must not PERSIST customer data (memory writes). */
  zdr?: boolean;
  /** Byte budget for a single tool result before it spills to R2 (brand-scrub still applies). */
  maxInlineResultBytes?: number;
  /** Abort signal wired to the run's wall-clock / cancel path. */
  signal?: AbortSignal;
  /** How many agent-delegate hops deep this run is (0 = a top-level run).
   *  The `agent` tool refuses to delegate past MAX_AGENT_DEPTH — the only
   *  place this is read. Absent/undefined is treated as 0. */
  depth?: number;
  /** The top-level run at the head of this delegation chain. Absent for a
   *  top-level run itself (it IS its own root — agent-delegate.ts reads
   *  `ctx.rootRunId ?? ctx.runId`). Used for one indexed query: how much
   *  has this whole tree spent so far, against the root's own max_cost_cents. */
  rootRunId?: string;
  /** Every ancestor run id above this one, root-first (empty/absent for a
   *  top-level run). Found necessary by a pre-launch scalability review,
   *  2026-07-17: bumping only the immediate parent's heartbeat while a
   *  nested delegate call is in flight leaves EVERY run further up the
   *  chain heartbeat-stale (the reaper's 15-minute staleness cutoff has no
   *  idea a run is transitively still working) — agent-delegate.ts bumps
   *  every id in this list on every nested step, not just ctx.runId. */
  ancestorRunIds?: string[];
}

/** The result of one tool invocation: the model-visible output + what to bill. */
export interface ToolResult {
  output: unknown;
  metering: ToolMetering;
  /** Optional structured trace detail (brand-scrubbed) for run_steps.detail. */
  detail?: Record<string, unknown>;
}

/**
 * A single agent tool. `run` takes the model-supplied args (already JSON-parsed)
 * plus the run context and returns the output to feed back into the loop.
 */
export interface AgentTool {
  type: StepType;
  run(args: unknown, ctx: RunCtx): Promise<ToolResult>;
}

/**
 * Resolve the concrete `AgentTool` for a declared tool. Hosted tools come from
 * the internal HOSTED_TOOLS map; `function`/`mcp` are constructed per-declaration
 * (they carry a webhook_url / server_slug). Implemented in ./index.ts (S2+).
 */
export type ToolResolver = (decl: AgentToolDecl) => AgentTool | undefined;
