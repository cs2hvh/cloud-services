// GET /api/admin/agentcore/overview — operational view of the LIVE agent platform.
//
// Replaces the old /api/admin/ai-agents/* routes, which read the retired
// `agents` schema (last write 2026-06-04, no customer-facing consumer). The
// real platform is `agentcore`: agents with tools, runs, run steps, sandbox
// sessions and MCP servers. See nextstespsAI/21-admin-platform.md §1.4.
//
// Thin by design: fetch + delegate. Every derivation (failure rate, stuck runs,
// leaked sandboxes, per-tool reliability, MCP health) lives in
// lib/admin/agentcore-ops.ts so it can be unit-tested without a database.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import {
  agentStats,
  agentToolNames,
  leakedSandboxes,
  mcpHealth,
  mcpToolCount,
  runHealth,
  sandboxCostCents,
  stuckRuns,
  toolBreakdown,
  type AgentRow,
  type McpServerRow,
  type RunRow,
  type SandboxRow,
  type StepRow,
} from "@/lib/admin/agentcore-ops";

export const dynamic = "force-dynamic";

// Bounded reads: this page must stay fast as run volume grows. The caps are
// reported back so the UI can say the numbers are over a window, never implying
// they cover all history.
const RUN_LIMIT = 500;
const STEP_LIMIT = 5000;

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const staleMinutes = Math.max(1, Number(req.nextUrl.searchParams.get("stale_minutes") ?? 10) || 10);
  const supabase = inferenceAdminClient();
  const ac = () => supabase.schema("agentcore");

  const [agentsRes, runsRes, stepsRes, sandboxRes, mcpRes] = await Promise.all([
    ac().from("agents").select("id, name, model, tools, is_active, max_cost_cents, max_steps, org_id, created_at").returns<AgentRow[]>(),
    ac()
      .from("runs")
      .select("id, agent_id, org_id, status, cost_cents, step_count, error, depth, parent_run_id, created_at, updated_at, heartbeat_at, claimed_by")
      .order("created_at", { ascending: false })
      .limit(RUN_LIMIT)
      .returns<RunRow[]>(),
    ac()
      .from("run_steps")
      .select("run_id, step_type, tool_name, status, cost_cents, latency_ms, input_tokens, output_tokens")
      .order("created_at", { ascending: false })
      .limit(STEP_LIMIT)
      .returns<StepRow[]>(),
    ac().from("sandbox_sessions").select("id, run_id, org_id, kind, state, per_sec_cents, started_at, stopped_at, idle_deadline").returns<SandboxRow[]>(),
    ac()
      .from("mcp_servers")
      .select("id, slug, display_name, org_id, status, oauth_status, last_error, oauth_last_error, schemas_refreshed_at, tool_schemas")
      .returns<McpServerRow[]>(),
  ]);

  const firstError = agentsRes.error || runsRes.error || stepsRes.error || sandboxRes.error || mcpRes.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const agents = agentsRes.data ?? [];
  const runs = runsRes.data ?? [];
  const steps = stepsRes.data ?? [];
  const sandboxes = sandboxRes.data ?? [];
  const servers = mcpRes.data ?? [];

  const now = Date.now();
  const perAgent = agentStats(runs);
  const stuck = stuckRuns(runs, now, staleMinutes * 60_000);
  const leaked = leakedSandboxes(sandboxes, now);

  return NextResponse.json({
    window: { runs: runs.length, run_limit: RUN_LIMIT, steps: steps.length, step_limit: STEP_LIMIT },
    health: runHealth(runs),
    stuck_runs: stuck.map((r) => ({ ...r, stuck_for_minutes: Math.round((now - Date.parse(r.heartbeat_at ?? r.created_at)) / 60_000) })),
    open_sandboxes: sandboxes
      .filter((s) => s.state !== "stopped" && !s.stopped_at)
      .map((s) => ({ ...s, cost_cents: sandboxCostCents(s, now), leaked: leaked.some((l) => l.id === s.id) })),
    tools: toolBreakdown(steps),
    agents: agents.map((a) => ({
      ...a,
      tool_names: agentToolNames(a.tools),
      stats: perAgent.get(a.id) ?? { agent_id: a.id, runs: 0, failures: 0, cost_cents: 0, last_run_at: null },
    })),
    runs: runs.slice(0, 100),
    mcp_servers: servers.map((s) => ({
      id: s.id,
      slug: s.slug,
      display_name: s.display_name,
      org_id: s.org_id,
      status: s.status,
      oauth_status: s.oauth_status,
      last_error: s.last_error ?? s.oauth_last_error ?? null,
      schemas_refreshed_at: s.schemas_refreshed_at,
      health: mcpHealth(s),
      tool_count: mcpToolCount(s),
    })),
  });
}
