import { describe, it, expect } from "vitest";
import {
  agentStats,
  agentToolNames,
  isStuckRun,
  leakedSandboxes,
  mcpHealth,
  mcpToolCount,
  runHealth,
  sandboxCostCents,
  stuckRuns,
  toolBreakdown,
  type McpServerRow,
  type RunRow,
  type SandboxRow,
  type StepRow,
} from "@/lib/admin/agentcore-ops";

// Doc: nextstespsAI/21-admin-platform.md (§4, A4). Operator-facing derivations
// over the LIVE agentcore platform — pure, so they're testable without a DB.

const NOW = Date.parse("2026-07-28T12:00:00Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

function run(partial: Partial<RunRow> & Pick<RunRow, "id" | "status">): RunRow {
  return {
    agent_id: "agent-1",
    org_id: "org-1",
    cost_cents: 0,
    step_count: 0,
    error: null,
    depth: 0,
    parent_run_id: null,
    created_at: at(60),
    updated_at: null,
    heartbeat_at: null,
    claimed_by: null,
    ...partial,
  };
}

describe("runHealth", () => {
  const runs = [
    run({ id: "1", status: "completed", cost_cents: 10 }),
    run({ id: "2", status: "completed", cost_cents: 5 }),
    run({ id: "3", status: "failed", cost_cents: 2 }),
    run({ id: "4", status: "cancelled" }),
    run({ id: "5", status: "running" }),
  ];

  it("counts by status and sums cost", () => {
    const h = runHealth(runs);
    expect(h.total).toBe(5);
    expect(h.by_status).toEqual({ completed: 2, failed: 1, cancelled: 1, running: 1 });
    expect(h.cost_cents).toBe(17);
    expect(h.active).toBe(1);
  });

  it("computes failure rate over SETTLED runs only", () => {
    // 1 failed of 4 settled = 25%. Counting the in-flight run would give 20%
    // and drift as work completes — misleading exactly when you're watching.
    expect(runHealth(runs).failure_rate_pct).toBeCloseTo(25, 5);
  });

  it("returns null failure rate when nothing has settled", () => {
    expect(runHealth([run({ id: "x", status: "running" })]).failure_rate_pct).toBeNull();
    expect(runHealth([]).failure_rate_pct).toBeNull();
  });
});

describe("isStuckRun / stuckRuns", () => {
  it("flags an in-flight run whose heartbeat went stale", () => {
    expect(isStuckRun(run({ id: "a", status: "running", heartbeat_at: at(30) }), NOW, 10 * 60_000)).toBe(true);
    expect(isStuckRun(run({ id: "b", status: "running", heartbeat_at: at(2) }), NOW, 10 * 60_000)).toBe(false);
  });

  it("never flags a settled run, however old", () => {
    expect(isStuckRun(run({ id: "c", status: "completed", heartbeat_at: at(9999) }), NOW, 10 * 60_000)).toBe(false);
    expect(isStuckRun(run({ id: "d", status: "failed", heartbeat_at: null, created_at: at(9999) }), NOW, 10 * 60_000)).toBe(false);
  });

  it("falls back to created_at so a run that died before its first beat is caught", () => {
    expect(isStuckRun(run({ id: "e", status: "queued", heartbeat_at: null, created_at: at(45) }), NOW, 10 * 60_000)).toBe(true);
  });

  it("collects only the stuck ones", () => {
    const rows = [
      run({ id: "ok", status: "running", heartbeat_at: at(1) }),
      run({ id: "stuck", status: "running", heartbeat_at: at(60) }),
      run({ id: "done", status: "completed", heartbeat_at: at(60) }),
    ];
    expect(stuckRuns(rows, NOW).map((r) => r.id)).toEqual(["stuck"]);
  });
});

describe("sandboxes", () => {
  const sandbox = (partial: Partial<SandboxRow> & Pick<SandboxRow, "id" | "state">): SandboxRow => ({
    run_id: "run-1",
    org_id: "org-1",
    kind: "code",
    per_sec_cents: 1,
    started_at: at(10),
    stopped_at: null,
    idle_deadline: null,
    ...partial,
  });

  it("flags a session still open past its idle deadline", () => {
    const leaked = leakedSandboxes(
      [
        sandbox({ id: "leak", state: "running", idle_deadline: at(5) }),
        sandbox({ id: "fine", state: "running", idle_deadline: new Date(NOW + 60_000).toISOString() }),
        sandbox({ id: "closed", state: "stopped", idle_deadline: at(5), stopped_at: at(4) }),
      ],
      NOW
    );
    expect(leaked.map((s) => s.id)).toEqual(["leak"]);
  });

  it("bills an open session up to now, a closed one to its stop time", () => {
    // 10 minutes = 600s at 1 cent/sec
    expect(sandboxCostCents(sandbox({ id: "open", state: "running" }), NOW)).toBe(600);
    expect(sandboxCostCents(sandbox({ id: "shut", state: "stopped", stopped_at: at(9) }), NOW)).toBe(60);
  });

  it("costs nothing when it never started", () => {
    expect(sandboxCostCents(sandbox({ id: "never", state: "queued", started_at: null }), NOW)).toBe(0);
  });
});

describe("toolBreakdown", () => {
  const step = (partial: Partial<StepRow> & Pick<StepRow, "step_type">): StepRow => ({
    run_id: "run-1",
    tool_name: null,
    status: "completed",
    cost_cents: 0,
    latency_ms: null,
    input_tokens: null,
    output_tokens: null,
    ...partial,
  });

  it("groups by tool, ranks by call volume", () => {
    const stats = toolBreakdown([
      step({ step_type: "mcp", tool_name: "mcp__deepwiki__ask_question" }),
      step({ step_type: "mcp", tool_name: "mcp__deepwiki__ask_question" }),
      step({ step_type: "memory", tool_name: "memory" }),
    ]);
    expect(stats[0].tool).toBe("mcp__deepwiki__ask_question");
    expect(stats[0].calls).toBe(2);
    expect(stats[1].tool).toBe("memory");
  });

  it("keeps MCP servers separate so one flaky server is visible", () => {
    const stats = toolBreakdown([
      step({ step_type: "mcp", tool_name: "mcp__deepwiki__ask_question", status: "completed" }),
      step({ step_type: "mcp", tool_name: "mcp__context7__query-docs", status: "failed" }),
    ]);
    const broken = stats.find((s) => s.tool === "mcp__context7__query-docs")!;
    expect(broken.failure_rate_pct).toBe(100);
    expect(stats.find((s) => s.tool === "mcp__deepwiki__ask_question")!.failure_rate_pct).toBe(0);
  });

  it("falls back to step_type when a step has no tool name", () => {
    expect(toolBreakdown([step({ step_type: "model" })])[0].tool).toBe("model");
  });

  it("averages latency over steps that reported it", () => {
    const stats = toolBreakdown([
      step({ step_type: "code", tool_name: "code", latency_ms: 100 }),
      step({ step_type: "code", tool_name: "code", latency_ms: 300 }),
      step({ step_type: "code", tool_name: "code", latency_ms: null }),
    ]);
    expect(stats[0].avg_latency_ms).toBe(200);
  });

  it("reports null latency when nothing measured it", () => {
    expect(toolBreakdown([step({ step_type: "model" })])[0].avg_latency_ms).toBeNull();
  });
});

describe("agentToolNames", () => {
  it("reads both string and object tool shapes", () => {
    expect(agentToolNames(["web_search", { type: "code" }, { name: "memory" }])).toEqual(["web_search", "code", "memory"]);
  });

  it("qualifies MCP tools by server so two servers are distinguishable", () => {
    // Live shape: {type:"mcp", server_slug:"deepwiki"}. Rendering both as a
    // bare "mcp" hid which servers an agent depends on and collided as React
    // keys (found on the real admin page, 2026-07-28).
    expect(agentToolNames([{ type: "mcp", server_slug: "deepwiki" }, { type: "mcp", server_slug: "context7" }])).toEqual([
      "mcp:deepwiki",
      "mcp:context7",
    ]);
  });

  it("names function tools rather than labelling them all 'function'", () => {
    expect(agentToolNames([{ type: "function", name: "echo_note", webhook_url: "https://x" }])).toEqual([
      "function:echo_note",
    ]);
  });

  it("produces unique labels for the real Omni agent config", () => {
    const labels = agentToolNames([
      { type: "file_search", collection_id: "abc" },
      { type: "web_search" },
      { type: "function", name: "echo_note" },
      { type: "code" },
    ]);
    expect(labels).toEqual(["file_search", "web_search", "function:echo_note", "code"]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("falls back to the bare type when nothing distinguishes the entry", () => {
    expect(agentToolNames([{ type: "mcp" }])).toEqual(["mcp"]);
  });

  it("is empty for a missing or malformed tools field", () => {
    expect(agentToolNames(null)).toEqual([]);
    expect(agentToolNames({})).toEqual([]);
    expect(agentToolNames([1, true])).toEqual([]);
  });
});

describe("agentStats", () => {
  it("rolls up runs, failures, cost and last activity per agent", () => {
    const stats = agentStats([
      run({ id: "1", agent_id: "a", status: "completed", cost_cents: 10, created_at: at(50) }),
      run({ id: "2", agent_id: "a", status: "failed", cost_cents: 5, created_at: at(10) }),
      run({ id: "3", agent_id: "b", status: "completed", cost_cents: 1, created_at: at(30) }),
    ]);
    expect(stats.get("a")).toEqual({ agent_id: "a", runs: 2, failures: 1, cost_cents: 15, last_run_at: at(10) });
    expect(stats.get("b")!.runs).toBe(1);
  });

  it("ignores runs with no agent (ad-hoc responses)", () => {
    expect(agentStats([run({ id: "x", agent_id: null, status: "completed" })]).size).toBe(0);
  });
});

describe("mcpHealth", () => {
  const server = (partial: Partial<McpServerRow>): McpServerRow => ({
    id: "1",
    slug: "deepwiki",
    display_name: "DeepWiki",
    org_id: "org-1",
    status: "active",
    oauth_status: null,
    last_error: null,
    schemas_refreshed_at: null,
    tool_schemas: [],
    ...partial,
  });

  it("is ok when active and error-free", () => {
    expect(mcpHealth(server({}))).toBe("ok");
  });

  it("is error when the server reported a failure", () => {
    expect(mcpHealth(server({ last_error: "connection refused" }))).toBe("error");
    expect(mcpHealth(server({ oauth_last_error: "token refresh failed" }))).toBe("error");
  });

  it("treats a broken OAuth connection as error even while status says active", () => {
    // Reachable but unusable: the agent still loses the tool.
    expect(mcpHealth(server({ oauth_status: "expired" }))).toBe("error");
    expect(mcpHealth(server({ oauth_status: "connected" }))).toBe("ok");
  });

  it("is disabled when not active", () => {
    expect(mcpHealth(server({ status: "disabled", last_error: "x" }))).toBe("disabled");
  });

  it("counts published tools", () => {
    expect(mcpToolCount(server({ tool_schemas: [{ name: "a" }, { name: "b" }] }))).toBe(2);
    expect(mcpToolCount(server({ tool_schemas: null }))).toBe(0);
  });
});
