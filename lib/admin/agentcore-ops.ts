/**
 * Operational derivations for the agentcore admin — pure, DB-free, UI-free.
 *
 * This covers the LIVE agent platform (`agentcore`: agents with tools, runs,
 * run steps, sandbox sessions, MCP servers), not the retired `agents` schema
 * the old admin page read. See nextstespsAI/21-admin-platform.md §1.4.
 *
 * What an operator needs from agents is different from what a customer needs:
 * not "what did my agent answer", but "what is stuck, what is leaking money,
 * which tool is failing". Every rule for those questions lives here so it can
 * be unit-tested without a database.
 *
 * Doc: nextstespsAI/21-admin-platform.md (§4, section A4).
 */

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | (string & {});

export interface RunRow {
  id: string;
  agent_id: string | null;
  org_id: string;
  status: RunStatus;
  cost_cents: number | null;
  step_count: number | null;
  error: string | null;
  depth: number | null;
  parent_run_id: string | null;
  created_at: string;
  updated_at: string | null;
  heartbeat_at: string | null;
  claimed_by: string | null;
}

export interface StepRow {
  run_id: string;
  step_type: string;
  tool_name: string | null;
  status: string | null;
  cost_cents: number | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface AgentRow {
  id: string;
  name: string;
  model: string | null;
  tools: unknown;
  is_active: boolean;
  max_cost_cents: number | null;
  max_steps: number | null;
  org_id: string;
  created_at: string;
}

export interface SandboxRow {
  id: string;
  run_id: string | null;
  org_id: string;
  kind: string | null;
  state: string;
  per_sec_cents: number | null;
  started_at: string | null;
  stopped_at: string | null;
  idle_deadline: string | null;
}

export interface McpServerRow {
  id: string;
  slug: string;
  display_name: string | null;
  org_id: string;
  status: string;
  oauth_status: string | null;
  last_error: string | null;
  oauth_last_error?: string | null;
  schemas_refreshed_at: string | null;
  tool_schemas: unknown;
}

/** A run is in flight when it has been claimed but hasn't settled. */
export const ACTIVE_RUN_STATUSES = new Set(["queued", "running"]);

/** Terminal statuses — a run here will never change again. */
export const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function cents(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// ── Run health ───────────────────────────────────────────────────────────────

export interface RunHealth {
  total: number;
  by_status: Record<string, number>;
  failed: number;
  active: number;
  failure_rate_pct: number | null;
  cost_cents: number;
}

/**
 * Failure rate is computed over SETTLED runs only. Counting in-flight runs as
 * successes would make the number drift down while work is still running, which
 * is exactly when an operator is looking at it.
 */
export function runHealth(runs: RunRow[]): RunHealth {
  const by_status: Record<string, number> = {};
  let cost = 0;
  for (const run of runs) {
    by_status[run.status] = (by_status[run.status] ?? 0) + 1;
    cost += cents(run.cost_cents);
  }
  const failed = by_status.failed ?? 0;
  const settled = runs.filter((r) => TERMINAL_RUN_STATUSES.has(r.status)).length;
  return {
    total: runs.length,
    by_status,
    failed,
    active: runs.filter((r) => ACTIVE_RUN_STATUSES.has(r.status)).length,
    failure_rate_pct: settled === 0 ? null : (failed / settled) * 100,
    cost_cents: cost,
  };
}

/**
 * A run whose worker has gone away: still in flight, but its heartbeat stopped.
 * The same staleness idea the runners' own watchdogs use — surfaced here so an
 * operator can see it without reading the database.
 *
 * A run with no heartbeat at all falls back to its created_at, so a run that
 * died before its first beat is still caught rather than living forever.
 */
export function isStuckRun(run: RunRow, now: number, staleMs: number): boolean {
  if (!ACTIVE_RUN_STATUSES.has(run.status)) return false;
  const last = ms(run.heartbeat_at) ?? ms(run.created_at);
  if (last === null) return false;
  return now - last > staleMs;
}

export function stuckRuns(runs: RunRow[], now: number, staleMs = 10 * 60_000): RunRow[] {
  return runs.filter((run) => isStuckRun(run, now, staleMs));
}

// ── Sandboxes ────────────────────────────────────────────────────────────────

/**
 * A sandbox still marked running past its idle deadline: billed per second
 * (`per_sec_cents`) for a run that is no longer using it. This is the agent
 * platform's most direct money leak, and nothing surfaces it today.
 */
export function leakedSandboxes(sandboxes: SandboxRow[], now: number): SandboxRow[] {
  return sandboxes.filter((s) => {
    if (s.state === "stopped" || s.stopped_at) return false;
    const deadline = ms(s.idle_deadline);
    return deadline !== null && deadline < now;
  });
}

/** Cost of a sandbox so far, in cents. Open sessions bill up to `now`. */
export function sandboxCostCents(sandbox: SandboxRow, now: number): number {
  const start = ms(sandbox.started_at);
  if (start === null) return 0;
  const end = ms(sandbox.stopped_at) ?? now;
  const seconds = Math.max(0, (end - start) / 1000);
  return Math.ceil(seconds * cents(sandbox.per_sec_cents));
}

// ── Tools ────────────────────────────────────────────────────────────────────

export interface ToolStat {
  tool: string;
  step_type: string;
  calls: number;
  failures: number;
  failure_rate_pct: number;
  cost_cents: number;
  avg_latency_ms: number | null;
}

/**
 * Per-tool reliability — the view that answers "which tool is broken".
 *
 * Steps are grouped by tool_name where present, falling back to step_type, so a
 * model step and an untagged tool call still appear. MCP tools arrive already
 * namespaced (`mcp__deepwiki__ask_question`), which keeps one flaky MCP server
 * from hiding inside a generic "mcp" bucket.
 */
export function toolBreakdown(steps: StepRow[]): ToolStat[] {
  const acc = new Map<string, { step_type: string; calls: number; failures: number; cost: number; latency: number; latencyCount: number }>();

  for (const step of steps) {
    const key = step.tool_name || step.step_type;
    if (!key) continue;
    const entry = acc.get(key) ?? { step_type: step.step_type, calls: 0, failures: 0, cost: 0, latency: 0, latencyCount: 0 };
    entry.calls++;
    if (step.status && step.status !== "completed" && step.status !== "ok" && step.status !== "success") entry.failures++;
    entry.cost += cents(step.cost_cents);
    if (typeof step.latency_ms === "number" && Number.isFinite(step.latency_ms)) {
      entry.latency += step.latency_ms;
      entry.latencyCount++;
    }
    acc.set(key, entry);
  }

  return [...acc.entries()]
    .map(([tool, e]) => ({
      tool,
      step_type: e.step_type,
      calls: e.calls,
      failures: e.failures,
      failure_rate_pct: e.calls === 0 ? 0 : (e.failures / e.calls) * 100,
      cost_cents: e.cost,
      avg_latency_ms: e.latencyCount === 0 ? null : Math.round(e.latency / e.latencyCount),
    }))
    .sort((a, b) => b.calls - a.calls);
}

/**
 * The tools an agent is configured with, from its `tools` jsonb.
 *
 * Labels are qualified where the config carries something distinguishing:
 * an MCP entry is `{type:"mcp", server_slug:"deepwiki"}`, so two MCP servers
 * would otherwise both render as a bare "mcp" — hiding which servers an agent
 * depends on, and colliding as React keys (found live, 2026-07-28). Function
 * tools carry their own `name`, which is far more useful than "function".
 */
export function agentToolNames(tools: unknown): string[] {
  if (!Array.isArray(tools)) return [];
  return tools
    .map((tool) => {
      if (typeof tool === "string") return tool;
      if (!tool || typeof tool !== "object") return null;

      const record = tool as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type : null;

      if (type === "mcp" && typeof record.server_slug === "string") return `mcp:${record.server_slug}`;
      if (type === "function" && typeof record.name === "string") return `function:${record.name}`;
      if (type) return type;

      const fallback = record.name ?? record.tool;
      return typeof fallback === "string" ? fallback : null;
    })
    .filter((name): name is string => !!name);
}

// ── Per-agent rollup ─────────────────────────────────────────────────────────

export interface AgentStat {
  agent_id: string;
  runs: number;
  failures: number;
  cost_cents: number;
  last_run_at: string | null;
}

export function agentStats(runs: RunRow[]): Map<string, AgentStat> {
  const out = new Map<string, AgentStat>();
  for (const run of runs) {
    if (!run.agent_id) continue;
    const entry = out.get(run.agent_id) ?? { agent_id: run.agent_id, runs: 0, failures: 0, cost_cents: 0, last_run_at: null };
    entry.runs++;
    if (run.status === "failed") entry.failures++;
    entry.cost_cents += cents(run.cost_cents);
    if (!entry.last_run_at || run.created_at > entry.last_run_at) entry.last_run_at = run.created_at;
    out.set(run.agent_id, entry);
  }
  return out;
}

// ── MCP health ───────────────────────────────────────────────────────────────

export type McpHealth = "ok" | "error" | "disabled";

/**
 * An MCP server is a live dependency: when it breaks, every agent using it
 * loses a tool. An OAuth failure counts as broken even while `status` still
 * reads active — the server is reachable but the agent can't call it.
 */
export function mcpHealth(server: McpServerRow): McpHealth {
  if (server.status !== "active") return "disabled";
  if (server.last_error || server.oauth_last_error) return "error";
  if (server.oauth_status && server.oauth_status !== "connected" && server.oauth_status !== "ok") return "error";
  return "ok";
}

export function mcpToolCount(server: McpServerRow): number {
  return Array.isArray(server.tool_schemas) ? server.tool_schemas.length : 0;
}
