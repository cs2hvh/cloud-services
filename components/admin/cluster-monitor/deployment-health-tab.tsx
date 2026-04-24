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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/axios/axios";
import type { DeploymentHealth } from "@/lib/services/kubernetes-monitor";

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusIcon(s: DeploymentHealth["status"]) {
  switch (s) {
    case "healthy":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "degraded":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "failing":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "progressing":
      return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    default:
      return <Info className="h-4 w-4 text-neutral-400" />;
  }
}

function statusBadge(s: DeploymentHealth["status"]) {
  const variants: Record<
    DeploymentHealth["status"],
    { label: string; className: string }
  > = {
    healthy:     { label: "Healthy",     className: "bg-green-500/10 text-green-400 border-green-500/20" },
    degraded:    { label: "Degraded",    className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
    failing:     { label: "Failing",     className: "bg-red-500/10 text-red-400 border-red-500/20" },
    progressing: { label: "Progressing", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    unknown:     { label: "Unknown",     className: "bg-neutral-700 text-neutral-400 border-neutral-600" },
  };
  const v = variants[s];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${v.className}`}
    >
      {statusIcon(s)}
      {v.label}
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
  const [error, setError] = useState<string | null>(null);

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
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">
            Diagnostics — {deployment.namespace}/{deployment.name}
          </h4>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0 text-neutral-400 hover:text-white">
            <ChevronUp className="h-4 w-4" />
          </Button>
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
                        {c.message && <p className="text-neutral-400 text-xs mt-0.5">{c.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failed pod reasons */}
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

            {/* Events */}
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
                        {e.count > 1 && (
                          <span className="ml-2 text-neutral-500">×{e.count}</span>
                        )}
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
  const [filtered, setFiltered] = useState<DeploymentHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DeploymentHealth["status"] | "all">("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
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
              Last updated: {lastUpdated.toLocaleTimeString("en-US")}
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

      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        {(["all", "healthy", "degraded", "failing", "progressing"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              statusFilter === s
                ? "bg-white text-black border-white"
                : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:border-neutral-500"
            }`}
          >
            {s === "all"
              ? `All (${deployments.length})`
              : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s as keyof typeof counts]})`}
          </button>
        ))}
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
            <tr className="border-b border-neutral-800">
              <th className="px-4 py-3 text-left text-neutral-400 font-medium">Status</th>
              <th className="px-4 py-3 text-left text-neutral-400 font-medium">Deployment</th>
              <th className="px-4 py-3 text-left text-neutral-400 font-medium">Namespace</th>
              <th className="px-4 py-3 text-center text-neutral-400 font-medium">Replicas</th>
              <th className="px-4 py-3 text-left text-neutral-400 font-medium">Created</th>
              <th className="px-4 py-3 text-center text-neutral-400 font-medium">Diagnose</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                  No deployments match your filters.
                </td>
              </tr>
            )}
            {filtered.map((d) => {
              const key = `${d.namespace}/${d.name}`;
              const isExpanded = expandedRow === key;

              return (
                <Fragment key={key}>
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">{statusBadge(d.status)}</td>
                    <td className="px-4 py-3 text-white font-medium">{d.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs text-neutral-400 border-neutral-700">
                        {d.namespace}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={d.readyReplicas < d.desiredReplicas ? "text-yellow-400" : "text-white"}>
                        {d.readyReplicas}/{d.desiredReplicas}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-US") : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : key)}
                        className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                        title="Toggle diagnostics"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </motion.tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-3">
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
