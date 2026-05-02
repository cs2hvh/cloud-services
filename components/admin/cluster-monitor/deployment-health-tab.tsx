"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { motion } from "motion/react";
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  Loader2,
  Info,
  RotateCcw,
  Cpu,
  MemoryStick,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import api from "@/lib/axios/axios";
import type { DeploymentHealth } from "@/lib/services/kubernetes-monitor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeSince(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatCpu(cores: number): string {
  if (cores === 0) return "—";
  const m = Math.round(cores * 1000);
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(2)} cores`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ s }: { s: DeploymentHealth["status"] }) {
  const cfg: Record<DeploymentHealth["status"], { label: string; icon: React.ReactNode; cls: string }> = {
    healthy:     { label: "Healthy",   icon: <CheckCircle2 className="h-3.5 w-3.5" />,              cls: "bg-green-500/10 text-green-400 border-green-500/20" },
    degraded:    { label: "Degraded",  icon: <AlertTriangle className="h-3.5 w-3.5" />,             cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
    failing:     { label: "Failing",   icon: <AlertCircle className="h-3.5 w-3.5" />,               cls: "bg-red-500/10 text-red-400 border-red-500/20" },
    progressing: { label: "Deploying", icon: <Clock className="h-3.5 w-3.5 animate-pulse" />,       cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    unknown:     { label: "Unknown",   icon: <Info className="h-3.5 w-3.5" />,                      cls: "bg-neutral-700 text-neutral-400 border-neutral-600" },
  };
  const { label, icon, cls } = cfg[s];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ─── Inline diagnosis (shown under deployment name) ───────────────────────────

function InlineDiagnosis({ d }: { d: DeploymentHealth }) {
  if (d.status === "healthy" && d.totalRestarts === 0) return null;

  if (d.status === "healthy") {
    return (
      <p className="text-xs text-amber-400/70 mt-0.5 flex items-center gap-1">
        <RotateCcw className="h-3 w-3 shrink-0" />
        {d.totalRestarts} restart{d.totalRestarts !== 1 ? "s" : ""} since last deploy
      </p>
    );
  }

  if (d.status === "progressing") {
    const pct = d.desiredReplicas > 0
      ? Math.round((d.updatedReplicas / d.desiredReplicas) * 100)
      : 0;
    return (
      <div className="mt-1 space-y-1">
        <p className="text-xs text-blue-400 flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0 animate-pulse" />
          Rolling out… {pct}%
          {d.lastRolloutTime && (
            <span className="text-blue-400/60 ml-1">· started {timeSince(d.lastRolloutTime)}</span>
          )}
        </p>
        <div className="w-28">
          <Progress value={pct} className="h-1 bg-neutral-700" indicatorClassName="bg-blue-500" />
        </div>
      </div>
    );
  }

  if (d.inlineDiagnosis) {
    const isRed = d.status === "failing";
    return (
      <p className={`text-xs mt-0.5 flex items-center gap-1 ${isRed ? "text-red-400" : "text-yellow-400"}`}>
        <AlertCircle className="h-3 w-3 shrink-0" />
        {d.inlineDiagnosis}
      </p>
    );
  }

  return null;
}

// ─── Replica detail cell ──────────────────────────────────────────────────────

function ReplicaCell({ d }: { d: DeploymentHealth }) {
  const readyOk   = d.readyReplicas     >= d.desiredReplicas;
  const updatedOk = d.updatedReplicas   >= d.desiredReplicas;
  const availOk   = d.availableReplicas >= d.desiredReplicas;

  return (
    <div className="space-y-0.5 min-w-[90px]">
      <div className={`text-sm font-medium ${readyOk ? "text-white" : "text-yellow-400"}`}>
        {d.readyReplicas}/{d.desiredReplicas}
        <span className="text-xs font-normal text-neutral-500 ml-1">ready</span>
      </div>
      {d.desiredReplicas > 0 && (
        <div className="text-xs text-neutral-500 flex items-center gap-1.5">
          <span className={updatedOk ? "text-neutral-400" : "text-amber-500"} title="Updated replicas">
            {d.updatedReplicas}↑
          </span>
          <span className="text-neutral-700">·</span>
          <span className={availOk ? "text-neutral-400" : "text-amber-500"} title="Available replicas">
            {d.availableReplicas}✓
          </span>
        </div>
      )}
      {d.status === "progressing" && d.desiredReplicas > 0 && (
        <div className="w-20 pt-0.5">
          <Progress
            value={Math.round((d.updatedReplicas / d.desiredReplicas) * 100)}
            className="h-1 bg-neutral-700"
            indicatorClassName="bg-blue-500"
          />
        </div>
      )}
    </div>
  );
}

// ─── Restart count cell ───────────────────────────────────────────────────────

function RestartCell({ count }: { count: number }) {
  if (count === 0)
    return <span className="text-neutral-600 text-sm">0</span>;
  if (count < 5)
    return (
      <span className="text-amber-400 text-sm font-medium flex items-center justify-end gap-1">
        <RotateCcw className="h-3 w-3" />{count}
      </span>
    );
  return (
    <span className="text-red-400 text-sm font-bold flex items-center justify-end gap-1">
      <RotateCcw className="h-3 w-3" />{count}
    </span>
  );
}

// ─── Diagnostics drawer ───────────────────────────────────────────────────────

interface DiagnosticsDrawerProps {
  deployment: DeploymentHealth;
  onClose: () => void;
}

function DiagnosticsDrawer({ deployment, onClose }: DiagnosticsDrawerProps) {
  const [data, setData] = useState<{
    events: Array<{ reason: string; message: string; count: number; lastTime: string }>;
    failedPodReasons: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    api
      .get(
        `/admin/cluster/deployments?namespace=${encodeURIComponent(deployment.namespace)}&deployment=${encodeURIComponent(deployment.name)}&diagnostics=true`,
      )
      .then((r) => setData(r.data?.data ?? null))
      .catch((e) => setError(e?.message ?? "Failed to load diagnostics"))
      .finally(() => setLoading(false));
  }, [deployment.name, deployment.namespace]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-4 mt-2 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">
            Diagnostics — {deployment.namespace}/{deployment.name}
          </h4>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0 text-neutral-400 hover:text-white">
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>

        {/* Resource context — available immediately, no extra fetch */}
        <div className="flex flex-wrap items-center gap-4 py-2 px-3 bg-neutral-800/50 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Cpu className="h-3.5 w-3.5 text-blue-400" />
            <span>CPU requested:</span>
            <span className="text-white font-medium">{formatCpu(deployment.cpuRequested)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <MemoryStick className="h-3.5 w-3.5 text-purple-400" />
            <span>Memory requested:</span>
            <span className="text-white font-medium">{formatBytes(deployment.memoryRequested)}</span>
          </div>
          {deployment.lastRolloutTime && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Clock className="h-3.5 w-3.5 text-neutral-500" />
              <span>Last rollout:</span>
              <span className="text-white font-medium">{timeSince(deployment.lastRolloutTime)}</span>
            </div>
          )}
          {deployment.totalRestarts > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
              <span>Total restarts:</span>
              <span className={`font-medium ${deployment.totalRestarts >= 5 ? "text-red-400" : "text-amber-400"}`}>
                {deployment.totalRestarts}
              </span>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-neutral-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading diagnostics…
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {data && !loading && (
          <>
            {/* Conditions */}
            {deployment.conditions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Conditions</p>
                <div className="space-y-1">
                  {deployment.conditions.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={`mt-0.5 ${c.status === "True" ? "text-green-400" : "text-red-400"}`}>●</span>
                      <div>
                        <span className="text-white font-medium">{c.type}</span>
                        {c.reason && <span className="text-neutral-400 ml-2">({c.reason})</span>}
                        {c.lastTransitionTime && (
                          <span className="text-neutral-600 ml-2 text-xs">{timeSince(c.lastTransitionTime)}</span>
                        )}
                        {c.message && <p className="text-neutral-400 text-xs mt-0.5">{c.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pod failure reasons */}
            {data.failedPodReasons.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Pod Failure Reasons</p>
                <div className="flex flex-wrap gap-2">
                  {data.failedPodReasons.map((r, i) => (
                    <span key={i} className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-xs">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Related events */}
            {data.events.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Related Events ({data.events.length})
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {data.events.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs bg-neutral-800/50 rounded p-2">
                      <AlertTriangle className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-yellow-400 font-medium">{e.reason}</span>
                        {e.count > 1 && <span className="ml-2 text-neutral-500">×{e.count}</span>}
                        <p className="text-neutral-300 mt-0.5 break-words">{e.message}</p>
                        <p className="text-neutral-500 mt-0.5">
                          {e.lastTime ? new Date(e.lastTime).toLocaleString("en-US") : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.events.length === 0 && data.failedPodReasons.length === 0 && deployment.conditions.length === 0 && (
              <p className="text-sm text-neutral-400">No diagnostic data found for this deployment.</p>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeploymentHealthTab() {
  const [deployments, setDeployments] = useState<DeploymentHealth[]>([]);
  const [filtered,    setFiltered]    = useState<DeploymentHealth[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [statusFilter, setStatusFilter] = useState<DeploymentHealth["status"] | "all">("all");
  const [expandedRow,  setExpandedRow]  = useState<string | null>(null);
  const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null);
  const hasFetched = useRef(false);

  const fetchDeployments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get("/admin/cluster/deployments");
      const data: DeploymentHealth[] = res.data?.data ?? [];
      setDeployments(data);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchDeployments();
    const interval = setInterval(fetchDeployments, 30_000);
    return () => clearInterval(interval);
  }, [fetchDeployments]);

  useEffect(() => {
    let result = [...deployments];
    if (statusFilter !== "all") result = result.filter((d) => d.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) => d.name.toLowerCase().includes(q) || d.namespace.toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  }, [deployments, search, statusFilter]);

  const counts = {
    healthy:     deployments.filter((d) => d.status === "healthy").length,
    degraded:    deployments.filter((d) => d.status === "degraded").length,
    failing:     deployments.filter((d) => d.status === "failing").length,
    progressing: deployments.filter((d) => d.status === "progressing").length,
  };

  const needsAttention = deployments.filter(
    (d) => d.status !== "healthy" || d.totalRestarts >= 5,
  ).length;

  if (loading && deployments.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-neutral-400">Loading deployment health…</p>
        </div>
      </div>
    );
  }

  if (error && deployments.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <div>
            <p className="text-white font-medium">Failed to load deployments</p>
            <p className="text-neutral-400 text-sm mt-1">{error}</p>
          </div>
          <Button variant="outline" onClick={fetchDeployments} className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Deployment Health</h2>
          {lastUpdated && (
            <p className="text-sm text-neutral-400">
              Last updated: {lastUpdated.toLocaleTimeString("en-US")} · {deployments.length} deployments
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchDeployments}
          disabled={loading}
          className="border-neutral-700 hover:bg-neutral-800"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Alert banner */}
      {needsAttention > 0 && (
        <div className="bg-red-950/20 border border-red-500/25 rounded-xl p-3 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <span className="font-semibold">
              {needsAttention} deployment{needsAttention !== 1 ? "s" : ""}
            </span>{" "}
            need{needsAttention === 1 ? "s" : ""} attention — expand ▾ for root cause
          </p>
        </div>
      )}

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {(["all", "healthy", "degraded", "failing", "progressing"] as const).map((s) => {
          const dotColor = {
            all: "bg-neutral-400", healthy: "bg-green-500",
            degraded: "bg-yellow-500", failing: "bg-red-500", progressing: "bg-blue-500",
          }[s];
          const count = s === "all" ? deployments.length : counts[s as keyof typeof counts];
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                statusFilter === s
                  ? "bg-white text-black border-white"
                  : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:border-neutral-500"
              }`}
            >
              {s !== "all" && <span className={`h-2 w-2 rounded-full ${dotColor}`} />}
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              <span className={`px-1.5 py-0.5 rounded text-xs ${statusFilter === s ? "bg-black/10" : "bg-neutral-800 text-neutral-400"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
        <Input
          placeholder="Search by name or namespace…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/30">
              <th className="px-4 py-3 text-left text-neutral-400 font-medium w-28">Status</th>
              <th className="px-4 py-3 text-left text-neutral-400 font-medium">Deployment</th>
              <th className="px-4 py-3 text-left text-neutral-400 font-medium hidden md:table-cell">Namespace</th>
              <th className="px-4 py-3 text-left text-neutral-400 font-medium">
                Replicas
                <span className="text-neutral-600 text-xs font-normal ml-1">↑updated ✓avail</span>
              </th>
              <th className="px-4 py-3 text-right text-neutral-400 font-medium hidden sm:table-cell w-24">Restarts</th>
              <th className="px-4 py-3 text-left text-neutral-400 font-medium hidden lg:table-cell w-28">Last Rollout</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                  No deployments match your filters.
                </td>
              </tr>
            )}
            {filtered.map((d) => {
              const key        = `${d.namespace}/${d.name}`;
              const isExpanded = expandedRow === key;
              const rowHighlight =
                d.status === "failing"  ? "bg-red-950/10" :
                d.status === "degraded" ? "bg-yellow-950/10" : "";

              return (
                <Fragment key={key}>
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`hover:bg-neutral-800/30 transition-colors ${rowHighlight}`}
                  >
                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge s={d.status} />
                    </td>

                    {/* Deployment name + inline diagnosis */}
                    <td className="px-4 py-3">
                      <p className="text-white font-medium leading-tight">{d.name}</p>
                      <InlineDiagnosis d={d} />
                    </td>

                    {/* Namespace */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge variant="outline" className="text-xs text-neutral-400 border-neutral-700">
                        {d.namespace}
                      </Badge>
                    </td>

                    {/* Replicas */}
                    <td className="px-4 py-3">
                      <ReplicaCell d={d} />
                    </td>

                    {/* Restarts */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <RestartCell count={d.totalRestarts} />
                    </td>

                    {/* Last rollout */}
                    <td className="px-4 py-3 text-neutral-400 text-xs hidden lg:table-cell">
                      {d.lastRolloutTime ? timeSince(d.lastRolloutTime) : "—"}
                    </td>

                    {/* Expand */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : key)}
                        className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                        title="Toggle diagnostics"
                      >
                        {isExpanded
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </td>
                  </motion.tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="px-4 pb-3">
                        <DiagnosticsDrawer
                          deployment={d}
                          onClose={() => setExpandedRow(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
