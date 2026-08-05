"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination, usePagedRows } from "@/components/admin/table-pagination";
import type { AgentWithStats, McpServerView, OpenSandbox, RunRow, ToolStat } from "./types";

const money = (cents: number | null) => `$${((cents ?? 0) / 100).toFixed(2)}`;
const ago = (iso: string | null) => {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "failed") return <Badge variant="destructive">{status}</Badge>;
  if (status === "completed") return <Badge variant="secondary">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

/** Agents with the tools they're configured with, and how they've actually run. */
export function AgentsTable({ agents }: { agents: AgentWithStats[] }) {
  const paged = usePagedRows(agents, 25);
  if (agents.length === 0) return <Empty>No agents defined.</Empty>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
      <Table>
        <TableHeader className="[&_tr]:border-white/10">
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Tools</TableHead>
            <TableHead className="text-right">Runs</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Last run</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.pageRows.map((agent) => (
            <TableRow
              key={agent.id}
              className={`border-white/5 hover:bg-white/[0.03] ${agent.is_active ? "" : "opacity-60"}`}
            >
              <TableCell>
                <div className="font-medium">{agent.name}</div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-neutral-400">{agent.id.slice(0, 8)}</span>
                  {!agent.is_active && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      inactive
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{agent.model ?? "—"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {agent.tool_names.length === 0 ? (
                    <span className="text-xs text-neutral-400">none</span>
                  ) : (
                    // Index-suffixed key: labels are qualified (mcp:deepwiki),
                    // but an agent may legitimately list the same tool twice.
                    agent.tool_names.map((tool, i) => (
                      <Badge key={`${tool}-${i}`} variant="outline" className="text-[10px] border-white/15">
                        {tool}
                      </Badge>
                    ))
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{agent.stats.runs}</TableCell>
              <TableCell className="text-right tabular-nums">
                {agent.stats.failures > 0 ? (
                  <span className="text-red-600 dark:text-red-400">{agent.stats.failures}</span>
                ) : (
                  "0"
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(agent.stats.cost_cents)}</TableCell>
              <TableCell className="text-right text-xs text-neutral-500">{ago(agent.stats.last_run_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination paged={paged} noun="agent" className="px-4 pb-3" />
    </div>
  );
}

/** Per-tool reliability — which tool is failing, how slow, how expensive. */
export function ToolsTable({ tools }: { tools: ToolStat[] }) {
  const paged = usePagedRows(tools, 25);
  if (tools.length === 0) return <Empty>No tool calls recorded in this window.</Empty>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
      <Table>
        <TableHeader className="[&_tr]:border-white/10">
          <TableRow>
            <TableHead>Tool</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Calls</TableHead>
            <TableHead className="text-right">Failures</TableHead>
            <TableHead className="text-right">Avg latency</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.pageRows.map((tool) => (
            <TableRow key={tool.tool} className="border-white/5 hover:bg-white/[0.03]">
              <TableCell className="font-mono text-xs">{tool.tool}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">
                  {tool.step_type}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{tool.calls}</TableCell>
              <TableCell className="text-right tabular-nums">
                {tool.failures > 0 ? (
                  <span className="text-red-600 dark:text-red-400">
                    {tool.failures} ({tool.failure_rate_pct.toFixed(0)}%)
                  </span>
                ) : (
                  "0"
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-neutral-400">
                {tool.avg_latency_ms === null ? "—" : `${tool.avg_latency_ms}ms`}
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(tool.cost_cents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination paged={paged} noun="tool" className="px-4 pb-3" />
    </div>
  );
}

/**
 * Recent runs, newest first. Errors are shown, not hidden behind a click.
 *
 * Paged: the route returns up to RUN_LIMIT (500) and every one of them used to
 * go into the DOM — 330 rows on this platform today, and the table has an
 * expandable error cell per row.
 */
export function RunsTable({ runs }: { runs: RunRow[] }) {
  const paged = usePagedRows(runs, 50);
  if (runs.length === 0) return <Empty>No runs yet.</Empty>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
      <Table>
        <TableHeader className="[&_tr]:border-white/10">
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Steps</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Depth</TableHead>
            <TableHead>Error</TableHead>
            <TableHead className="text-right">Started</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.pageRows.map((run) => (
            <TableRow key={run.id} className="border-white/5 hover:bg-white/[0.03]">
              <TableCell className="font-mono text-[10px]">{run.id.slice(0, 8)}</TableCell>
              <TableCell>
                <StatusBadge status={run.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{run.step_count ?? 0}</TableCell>
              <TableCell className="text-right tabular-nums">{money(run.cost_cents)}</TableCell>
              <TableCell className="text-right tabular-nums text-neutral-400">
                {run.depth ? `↳ ${run.depth}` : "—"}
              </TableCell>
              <TableCell className="max-w-[320px] truncate text-xs text-neutral-400" title={run.error ?? undefined}>
                {run.error ?? "—"}
              </TableCell>
              <TableCell className="text-right text-xs text-neutral-500">{ago(run.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination paged={paged} noun="run" className="px-4 pb-3" />
    </div>
  );
}

/** Sandboxes still open — the platform's most direct per-second money leak. */
export function SandboxTable({ sandboxes }: { sandboxes: OpenSandbox[] }) {
  const paged = usePagedRows(sandboxes, 25);
  if (sandboxes.length === 0) return <Empty>No open sandbox sessions.</Empty>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
      <Table>
        <TableHeader className="[&_tr]:border-white/10">
          <TableRow>
            <TableHead>Session</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="text-right">Cost so far</TableHead>
            <TableHead className="text-right">Started</TableHead>
            <TableHead>Idle deadline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.pageRows.map((s) => (
            <TableRow key={s.id} className="border-white/5 hover:bg-white/[0.03]">
              <TableCell className="font-mono text-[10px]">{s.id.slice(0, 8)}</TableCell>
              <TableCell className="text-xs">{s.kind ?? "—"}</TableCell>
              <TableCell>
                {s.leaked ? <Badge variant="destructive">past deadline</Badge> : <Badge variant="outline">{s.state}</Badge>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(s.cost_cents)}</TableCell>
              <TableCell className="text-right text-xs text-neutral-500">{ago(s.started_at)}</TableCell>
              <TableCell className="text-xs text-neutral-400">{ago(s.idle_deadline)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination paged={paged} noun="sandbox" className="px-4 pb-3" />
    </div>
  );
}

/** MCP servers — a broken one silently removes a tool from every agent using it. */
export function McpTable({ servers }: { servers: McpServerView[] }) {
  const paged = usePagedRows(servers, 25);
  if (servers.length === 0) return <Empty>No MCP servers registered.</Empty>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
      <Table>
        <TableHeader className="[&_tr]:border-white/10">
          <TableRow>
            <TableHead>Server</TableHead>
            <TableHead>Health</TableHead>
            <TableHead className="text-right">Tools</TableHead>
            <TableHead>Auth</TableHead>
            <TableHead>Last error</TableHead>
            <TableHead className="text-right">Schemas refreshed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.pageRows.map((server) => (
            <TableRow key={server.id} className="border-white/5 hover:bg-white/[0.03]">
              <TableCell>
                <div className="font-medium">{server.display_name ?? server.slug}</div>
                <div className="font-mono text-[10px] text-neutral-400">{server.slug}</div>
              </TableCell>
              <TableCell>
                {server.health === "ok" && <Badge variant="secondary">ok</Badge>}
                {server.health === "error" && <Badge variant="destructive">error</Badge>}
                {server.health === "disabled" && <Badge variant="outline">disabled</Badge>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{server.tool_count}</TableCell>
              <TableCell className="text-xs text-neutral-400">{server.oauth_status ?? "static"}</TableCell>
              <TableCell className="max-w-[280px] truncate text-xs text-neutral-400" title={server.last_error ?? undefined}>
                {server.last_error ?? "—"}
              </TableCell>
              <TableCell className="text-right text-xs text-neutral-500">{ago(server.schemas_refreshed_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination paged={paged} noun="server" className="px-4 pb-3" />
    </div>
  );
}
