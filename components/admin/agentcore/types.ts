/** Client shapes for the agentcore admin — mirrors /api/admin/agentcore/overview. */
import type { AgentRow, AgentStat, McpHealth, RunRow, RunHealth, SandboxRow, ToolStat } from "@/lib/admin/agentcore-ops";

export type AgentWithStats = AgentRow & { tool_names: string[]; stats: AgentStat };
export type StuckRun = RunRow & { stuck_for_minutes: number };
export type OpenSandbox = SandboxRow & { cost_cents: number; leaked: boolean };

export interface McpServerView {
  id: string;
  slug: string;
  display_name: string | null;
  org_id: string;
  status: string;
  oauth_status: string | null;
  last_error: string | null;
  schemas_refreshed_at: string | null;
  health: McpHealth;
  tool_count: number;
}

export interface AgentcoreOverview {
  window: { runs: number; run_limit: number; steps: number; step_limit: number };
  health: RunHealth;
  stuck_runs: StuckRun[];
  open_sandboxes: OpenSandbox[];
  tools: ToolStat[];
  agents: AgentWithStats[];
  runs: RunRow[];
  mcp_servers: McpServerView[];
}

export type { RunRow, ToolStat };
