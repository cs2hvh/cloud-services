"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, RefreshCw, Boxes, Cpu, Plug, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/axios/axios";
import { HealthCards } from "./health-cards";
import { AgentsTable, McpTable, RunsTable, SandboxTable, ToolsTable } from "./tables";
import type { AgentcoreOverview } from "./types";

/**
 * Admin view of the inference agent platform (`agentcore`) — agents and the
 * tools they run with, run outcomes, per-tool reliability, sandbox sessions and
 * MCP server health.
 *
 * This is ADDITIVE: the existing /dashboard/admin/ai-agents console is
 * untouched. Doc: nextstespsAI/21-admin-platform.md (§4, A4).
 */
export default function AgentcoreAdmin() {
  const [data, setData] = useState<AgentcoreOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/agentcore/overview");
      setData(res.data);
    } catch {
      toast.error("Failed to load the agent platform overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const alerts = data
    ? [
        data.stuck_runs.length > 0 && {
          key: "stuck",
          text: `${data.stuck_runs.length} run(s) in flight with a stale heartbeat — the longest for ${Math.max(
            ...data.stuck_runs.map((r) => r.stuck_for_minutes)
          )} minutes. Their worker has most likely died.`,
        },
        data.open_sandboxes.some((s) => s.leaked) && {
          key: "sandbox",
          text: `${data.open_sandboxes.filter((s) => s.leaked).length} sandbox session(s) running past their idle deadline — billing per second.`,
        },
        data.mcp_servers.some((s) => s.health === "error") && {
          key: "mcp",
          text: `MCP server(s) failing: ${data.mcp_servers
            .filter((s) => s.health === "error")
            .map((s) => s.slug)
            .join(", ")} — every agent using them has lost those tools.`,
        },
      ].filter(Boolean as unknown as (v: unknown) => v is { key: string; text: string })
    : [];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-2">
            <Bot className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Inference Agents</h1>
            <p className="mt-0.5 text-sm text-neutral-400">
              Agents and their tools, run outcomes, tool reliability, sandboxes and MCP health
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="border-white/10" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl bg-white/5" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl bg-white/5" />
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
          Could not load agent data.
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <HealthCards overview={data} />

          {alerts.map((alert) => (
            <div
              key={alert.key}
              className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 backdrop-blur-xl"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm text-red-200">{alert.text}</p>
            </div>
          ))}

          <Tabs defaultValue="agents" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="border border-white/10 bg-black/40 p-1">
                <TabsTrigger value="agents" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                  <Bot className="mr-2 h-4 w-4" />
                  Agents ({data.agents.length})
                </TabsTrigger>
                <TabsTrigger value="runs" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                  <Cpu className="mr-2 h-4 w-4" />
                  Runs ({data.runs.length})
                </TabsTrigger>
                <TabsTrigger value="tools" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                  <Wrench className="mr-2 h-4 w-4" />
                  Tools ({data.tools.length})
                </TabsTrigger>
                <TabsTrigger value="mcp" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                  <Plug className="mr-2 h-4 w-4" />
                  MCP ({data.mcp_servers.length})
                </TabsTrigger>
                <TabsTrigger value="sandboxes" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                  <Boxes className="mr-2 h-4 w-4" />
                  Sandboxes ({data.open_sandboxes.length})
                </TabsTrigger>
              </TabsList>
              <p className="text-xs text-neutral-500">
                most recent {data.window.runs} run(s) · {data.window.steps} step(s)
              </p>
            </div>

            <TabsContent value="agents">
              <AgentsTable agents={data.agents} />
            </TabsContent>
            <TabsContent value="runs">
              <RunsTable runs={data.runs} />
            </TabsContent>
            <TabsContent value="tools">
              <ToolsTable tools={data.tools} />
            </TabsContent>
            <TabsContent value="mcp">
              <McpTable servers={data.mcp_servers} />
            </TabsContent>
            <TabsContent value="sandboxes">
              <SandboxTable sandboxes={data.open_sandboxes} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
