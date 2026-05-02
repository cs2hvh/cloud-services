"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "motion/react";
import {
  Cpu,
  MemoryStick,
  Server,
  Box,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Activity,
  Zap,
  BarChart3,
  RotateCcw,
  TrendingUp,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClusterMetrics, NodeMetrics, DeploymentRolloutDetail } from "@/lib/services/prometheus";
import api from "@/lib/axios/axios";

interface PendingPodInfo {
  namespace: string;
  name: string;
  reason: string;
  ageSeconds: number;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Format CPU cores — uses rounded millicores to avoid float boundary bugs
// (e.g. parseCpuQuantity("1000m") can return 0.9999 → would show as "1000m" not "1.00 cores")
function formatCpu(cores: number): string {
  const m = Math.round(cores * 1000);
  if (m === 0) return "0m";
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(2)} cores`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// Get color based on percentage
function getUsageColor(percentage: number): string {
  if (percentage >= 90) return "text-red-500";
  if (percentage >= 70) return "text-yellow-500";
  return "text-green-500";
}

function getProgressColor(percentage: number): string {
  if (percentage >= 90) return "bg-red-500";
  if (percentage >= 70) return "bg-yellow-500";
  return "bg-green-500";
}

// Risk level descriptor for CPU/memory request pressure
function getRisk(pct: number): { label: string; textColor: string; dotColor: string } {
  if (pct >= 90) return { label: "Critical", textColor: "text-red-400",    dotColor: "bg-red-500" };
  if (pct >= 70) return { label: "Pressure", textColor: "text-yellow-400", dotColor: "bg-yellow-500" };
  return              { label: "Healthy",  textColor: "text-green-400",  dotColor: "bg-green-500" };
}

export default function ClusterUsageTab() {
  const [metrics, setMetrics] = useState<ClusterMetrics | null>(null);
  const [pendingPods, setPendingPods] = useState<PendingPodInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasFetched = useRef(false);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [metricsRes, pendingRes] = await Promise.all([
        api.get("/admin/cluster-metrics"),
        api.get("/admin/cluster/pending-pods"),
      ]);

      setMetrics(metricsRes?.data?.data ?? null);
      setPendingPods(pendingRes?.data?.data ?? []);
      setLastUpdated(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Prevent double fetch in React Strict Mode
    if (hasFetched.current) return;
    hasFetched.current = true;
    
    fetchMetrics();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-neutral-400">Loading cluster metrics...</p>
        </div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <div>
            <p className="text-white font-medium">Failed to load cluster metrics</p>
            <p className="text-neutral-400 text-sm mt-1">{error}</p>
          </div>
          <Button
            variant="outline"
            onClick={fetchMetrics}
            className="mt-2"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Cluster Resource Usage</h2>
          {lastUpdated && (
            <p className="text-sm text-neutral-400">
              Last updated: {lastUpdated.toLocaleTimeString("en-US")}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchMetrics}
          disabled={loading}
          className="border-neutral-700 hover:bg-neutral-800"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Row 1: CPU + Memory (wide cards) ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CPU Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Cpu className="h-5 w-5 text-blue-500" />
            </div>
            <h3 className="text-white font-medium">CPU Usage</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <span className={`text-3xl font-bold ${getUsageColor(metrics?.cpu?.percentage || 0)}`}>
                {metrics?.cpu?.percentage || 0}%
              </span>
              <span className="text-sm text-neutral-400">
                {formatCpu(metrics?.cpu?.used || 0)} / {formatCpu(metrics?.cpu?.total || 0)}
              </span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-neutral-500">Actual usage</span>
              </div>
              <Progress
                value={metrics?.cpu?.percentage || 0}
                className="h-2 bg-neutral-800"
                indicatorClassName={getProgressColor(metrics?.cpu?.percentage || 0)}
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-amber-400/80">Requested (K8s schedules by this)</span>
                <span className="text-amber-400">{metrics?.cpu?.requestedPercentage || 0}% · {formatCpu(metrics?.cpu?.requested || 0)}</span>
              </div>
              <Progress
                value={metrics?.cpu?.requestedPercentage || 0}
                className="h-2 bg-neutral-800"
                indicatorClassName="bg-amber-500"
              />
            </div>
          </div>
        </motion.div>

        {/* Memory Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <MemoryStick className="h-5 w-5 text-purple-500" />
            </div>
            <h3 className="text-white font-medium">Memory Usage</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <span className={`text-3xl font-bold ${getUsageColor(metrics?.memory.percentage || 0)}`}>
                {metrics?.memory.percentage || 0}%
              </span>
              <span className="text-sm text-neutral-400">
                {formatBytes(metrics?.memory.used || 0)} / {formatBytes(metrics?.memory.total || 0)}
              </span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-neutral-500">Actual usage</span>
              </div>
              <Progress
                value={metrics?.memory.percentage || 0}
                className="h-2 bg-neutral-800"
                indicatorClassName={getProgressColor(metrics?.memory.percentage || 0)}
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-amber-400/80">Requested (K8s schedules by this)</span>
                <span className="text-amber-400">{metrics?.memory.requestedPercentage || 0}% · {formatBytes(metrics?.memory.requested || 0)}</span>
              </div>
              <Progress
                value={metrics?.memory.requestedPercentage || 0}
                className="h-2 bg-neutral-800"
                indicatorClassName="bg-amber-500"
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Row 2: Pods / Workloads / Nodes / Scheduling (stat cards) ──── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pods Card — breakdown by phase */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Box className="h-5 w-5 text-green-500" />
            </div>
            <h3 className="text-white font-medium">Pods</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-white">{metrics?.pods.running ?? 0}</span>
              <span className="text-sm text-neutral-400">of {metrics?.pods.total ?? 0} total</span>
            </div>
            <Progress
              value={metrics?.pods.total ? ((metrics?.pods.running ?? 0) / metrics.pods.total) * 100 : 0}
              className="h-2 bg-neutral-800"
              indicatorClassName="bg-green-500"
            />
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="flex items-center gap-1 text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                {metrics?.pods.running ?? 0} running
              </span>
              <span className={`flex items-center gap-1 ${(metrics?.pods.pending ?? 0) > 0 ? "text-yellow-400" : "text-neutral-500"}`}>
                <Clock className="h-3 w-3" />
                {metrics?.pods.pending ?? 0} pending
              </span>
              <span className={`flex items-center gap-1 ${(metrics?.pods.failed ?? 0) > 0 ? "text-red-400" : "text-neutral-500"}`}>
                <AlertCircle className="h-3 w-3" />
                {metrics?.pods.failed ?? 0} failed
              </span>
            </div>
          </div>
        </motion.div>

        {/* Workloads Card — deployments / statefulsets / daemonsets */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <BarChart3 className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="text-white font-medium">Workloads</h3>
          </div>
          <div className="space-y-2.5">
            {/* Deployments */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">Deployments</span>
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{metrics?.workloads?.deployments.total ?? 0}</span>
                {(metrics?.workloads?.deployments.degraded ?? 0) > 0 ? (
                  <span className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full">
                    {metrics?.workloads?.deployments.degraded} degraded
                  </span>
                ) : (
                  <span className="text-xs bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full">all healthy</span>
                )}
              </div>
            </div>
            {/* Degraded deployment details — shown inline when something is broken */}
            {(metrics?.workloads?.deployments.degraded ?? 0) > 0 && (
              <div className="pl-2 space-y-1">
                {metrics?.workloads?.deployments.details
                  ?.filter((d: DeploymentRolloutDetail) => d.ready < d.desired)
                  .map((d: DeploymentRolloutDetail, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs text-red-400/80 bg-red-500/5 rounded px-2 py-1">
                      <span className="font-mono truncate max-w-[120px]" title={d.name}>{d.name}</span>
                      <span>{d.ready}/{d.desired} ready · {d.updated} updated</span>
                    </div>
                  ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">StatefulSets</span>
              <span className="text-white font-medium">{metrics?.workloads?.statefulsets ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">DaemonSets</span>
              <span className="text-white font-medium">{metrics?.workloads?.daemonsets ?? 0}</span>
            </div>
            <div className="border-t border-neutral-800 pt-2 flex items-center justify-between">
              <span className="text-sm text-neutral-400 flex items-center gap-1">
                <RotateCcw className="h-3 w-3" /> Total restarts
              </span>
              <span className={`font-medium text-sm ${(metrics?.workloads?.totalRestarts ?? 0) > 20 ? "text-yellow-400" : "text-neutral-300"}`}>
                {metrics?.workloads?.totalRestarts ?? 0}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Nodes Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Server className="h-5 w-5 text-orange-500" />
            </div>
            <h3 className="text-white font-medium">Cluster Nodes</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-white">
                {metrics?.nodes.length || 0}
              </span>
              <span className="text-sm text-neutral-400">
                {metrics?.nodes.filter(n => n.status === "Ready").length || 0} ready
              </span>
            </div>
            <div className="flex gap-1">
              {metrics?.nodes.map((node, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded ${node.status === "Ready" ? "bg-green-500" : "bg-red-500"}`}
                  title={`${node.name}: ${node.status}`}
                />
              ))}
            </div>
            {/* Pod capacity across cluster */}
            {metrics?.nodes && metrics.nodes.length > 0 && (
              <div className="flex items-center justify-between text-xs text-neutral-500 pt-1">
                <span>Pod slots used</span>
                <span className="text-neutral-300">
                  {metrics.nodes.reduce((s, n) => s + n.podCount, 0)} /
                  {" "}{metrics.nodes.reduce((s, n) => s + n.podCapacity, 0)} max
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Scheduling Pressure Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            </div>
            <h3 className="text-white font-medium">Scheduling</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <span className={`text-3xl font-bold ${(metrics?.scheduling?.pending || 0) > 0 ? "text-yellow-400" : "text-white"}`}>
                {metrics?.scheduling?.pending || 0}
              </span>
              <span className="text-sm text-neutral-400">pending pods</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={(metrics?.scheduling?.unschedulable || 0) > 0 ? "text-red-400" : "text-neutral-400"}>
                {metrics?.scheduling?.unschedulable || 0} unschedulable node{(metrics?.scheduling?.unschedulable ?? 0) !== 1 ? "s" : ""}
              </span>
            </div>
            {/* Scheduling risk hint */}
            {metrics?.nodes && (() => {
              const highNodes = metrics.nodes.filter(n => {
                const reqPct = n.cpuTotal > 0 ? (n.cpuRequested / n.cpuTotal) * 100 : 0;
                return reqPct >= 80;
              });
              return highNodes.length > 0 ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded px-2 py-1">
                  <Zap className="h-3 w-3 shrink-0" />
                  <span>{highNodes.length} node{highNodes.length !== 1 ? "s" : ""} CPU-requested ≥80%</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <CheckCircle2 className="h-3 w-3" /> No scheduling pressure
                </div>
              );
            })()}
          </div>
        </motion.div>
      </div>

      {/* ── Cluster Risk Overview + Fit Capacity ──────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {/* Risk Indicators */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-neutral-400" />
            <h3 className="text-white font-medium text-sm">Cluster Request Pressure</h3>
          </div>
          <div className="space-y-3">
            {/* CPU request risk */}
            {(() => {
              const pct = metrics?.cpu?.requestedPercentage ?? 0;
              const risk = getRisk(pct);
              return (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <span className={`h-2 w-2 rounded-full ${risk.dotColor} shrink-0`} />
                    <span>CPU reserved</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">{pct}%</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      pct >= 90 ? "bg-red-500/10 text-red-400" :
                      pct >= 70 ? "bg-yellow-500/10 text-yellow-400" :
                                  "bg-green-500/10 text-green-400"
                    }`}>{risk.label}</span>
                  </div>
                </div>
              );
            })()}
            {/* Memory request risk */}
            {(() => {
              const pct = metrics?.memory?.requestedPercentage ?? 0;
              const risk = getRisk(pct);
              return (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <span className={`h-2 w-2 rounded-full ${risk.dotColor} shrink-0`} />
                    <span>Memory reserved</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">{pct}%</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      pct >= 90 ? "bg-red-500/10 text-red-400" :
                      pct >= 70 ? "bg-yellow-500/10 text-yellow-400" :
                                  "bg-green-500/10 text-green-400"
                    }`}>{risk.label}</span>
                  </div>
                </div>
              );
            })()}
            {/* Per-node pressure summary */}
            {metrics?.nodes && (() => {
              const hotNodes = metrics.nodes.filter((n) => {
                const cpuPct = n.cpuTotal > 0 ? (n.cpuRequested / n.cpuTotal) * 100 : 0;
                const memPct = n.memoryTotal > 0 ? (n.memoryRequested / n.memoryTotal) * 100 : 0;
                return cpuPct >= 70 || memPct >= 70;
              });
              return hotNodes.length > 0 ? (
                <div className="pt-2 border-t border-neutral-800">
                  <p className="text-xs text-yellow-400/80 flex items-center gap-1">
                    <Zap className="h-3 w-3 shrink-0" />
                    {hotNodes.map((n) => n.name.split("-").slice(-2).join("-")).join(", ")} have ≥70% CPU or MEM reserved
                  </p>
                </div>
              ) : (
                <div className="pt-2 border-t border-neutral-800">
                  <p className="text-xs text-green-400/80 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    All nodes below 70% reserved — no scheduling risk
                  </p>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Fit Capacity */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-neutral-400" />
            <h3 className="text-white font-medium text-sm">Cluster Fit Capacity</h3>
            <span className="text-xs text-neutral-600 ml-1">by scheduler requests</span>
          </div>
          <div className="space-y-1 mb-4">
            <p className="text-xs text-neutral-500">
              Remaining headroom after current requests:
            </p>
            <p className="text-sm text-neutral-300">
              <span className="font-medium text-white">{formatCpu(metrics?.clusterFit?.freeCpuCores ?? 0)}</span>
              {" "}<span className="text-neutral-600">free CPU</span>
              {" · "}
              <span className="font-medium text-white">{formatBytes(metrics?.clusterFit?.freeMemoryBytes ?? 0)}</span>
              {" "}<span className="text-neutral-600">free RAM</span>
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Small pods <span className="text-neutral-600">(100m CPU · 128Mi)</span></span>
              <span className={`text-sm font-semibold ${(metrics?.clusterFit?.small ?? 0) < 3 ? "text-red-400" : (metrics?.clusterFit?.small ?? 0) < 10 ? "text-yellow-400" : "text-green-400"}`}>
                ~{metrics?.clusterFit?.small ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Medium pods <span className="text-neutral-600">(500m CPU · 512Mi)</span></span>
              <span className={`text-sm font-semibold ${(metrics?.clusterFit?.medium ?? 0) < 2 ? "text-red-400" : (metrics?.clusterFit?.medium ?? 0) < 5 ? "text-yellow-400" : "text-green-400"}`}>
                ~{metrics?.clusterFit?.medium ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Large pods <span className="text-neutral-600">(1 core CPU · 1Gi)</span></span>
              <span className={`text-sm font-semibold ${(metrics?.clusterFit?.large ?? 0) < 1 ? "text-red-400" : (metrics?.clusterFit?.large ?? 0) < 3 ? "text-yellow-400" : "text-green-400"}`}>
                ~{metrics?.clusterFit?.large ?? 0}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Nodes Card Grid */}
      {metrics?.nodes && metrics.nodes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Server className="h-4 w-4 text-neutral-400" />
            <h3 className="text-white font-medium">Node Details</h3>
            <span className="text-xs text-neutral-500 ml-1">
              {metrics.nodes.filter((n) => n.status === "Ready").length}/{metrics.nodes.length} ready
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
            {metrics.nodes.map((node: NodeMetrics, index: number) => {
              // Extract short role label from long UUID hostname
              // e.g. "cluster-for-app-d-a5b6e459-...-wp-3" → "wp-3"
              const parts = node.name.split("-");
              const shortName =
                parts.length >= 2
                  ? parts.slice(-2).join("-") // last 2 segments, e.g. "wp-3"
                  : node.name;

              const cpuReqPct = node.cpuTotal > 0
                ? Math.round((node.cpuRequested / node.cpuTotal) * 100)
                : 0;
              const memReqPct = node.memoryTotal > 0
                ? Math.round((node.memoryRequested / node.memoryTotal) * 100)
                : 0;
              const isHighCpuReq = cpuReqPct >= 80;
              const isHighMemReq = memReqPct >= 80;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + index * 0.05 }}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4"
                >
                  {/* Node header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Server className="h-4 w-4 text-neutral-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-white font-semibold text-sm" title={node.name}>
                          {shortName}
                        </p>
                        <p className="text-neutral-500 text-xs truncate max-w-[220px]" title={node.name}>
                          {node.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        node.status === "Ready"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400"
                      }`}>
                        {node.status === "Ready"
                          ? <CheckCircle2 className="h-3 w-3" />
                          : <AlertCircle className="h-3 w-3" />}
                        {node.status}
                      </div>
                      {/* Overcommit warning badge */}
                      {(isHighCpuReq || isHighMemReq) && (
                        <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                          <Zap className="h-3 w-3" />
                          {isHighCpuReq && isHighMemReq ? "CPU+MEM overcommit" : isHighCpuReq ? "CPU overcommit" : "MEM overcommit"}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Pod count for this node */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500 flex items-center gap-1">
                      <Box className="h-3 w-3" /> Pods on node
                    </span>
                    <span className="text-neutral-300">
                      {node.podCount} / {node.podCapacity} slots
                    </span>
                  </div>

                  {/* CPU */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <div className="flex items-center gap-1">
                        <Cpu className="h-3.5 w-3.5" />
                        <span>CPU</span>
                      </div>
                      <div className="text-right">
                        <div>Allocatable: {formatCpu(node.cpuTotal)}</div>
                        {node.cpuCapacity > node.cpuTotal && (
                          <div className="text-neutral-600">Capacity: {formatCpu(node.cpuCapacity)}</div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Actual</span>
                        <span className={getUsageColor(node.cpuPercentage)}>
                          {formatCpu(node.cpuUsed)} · {node.cpuPercentage}%
                        </span>
                      </div>
                      <Progress
                        value={node.cpuPercentage}
                        className="h-2 bg-neutral-700"
                        indicatorClassName={getProgressColor(node.cpuPercentage)}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-amber-400/80">Requested (scheduled)</span>
                        <span className="text-amber-400">
                          {formatCpu(node.cpuRequested)} · {cpuReqPct}%
                        </span>
                      </div>
                      <Progress
                        value={cpuReqPct}
                        className="h-2 bg-neutral-700"
                        indicatorClassName={cpuReqPct >= 90 ? "bg-red-500" : cpuReqPct >= 70 ? "bg-amber-500" : "bg-amber-400"}
                      />
                    </div>
                    {node.cpuLimitTotal > 0 && (
                      <div className="flex items-center justify-between text-xs text-neutral-500 border-t border-neutral-800 pt-1">
                        <span>Limits (throttle ceiling)</span>
                        <span>{formatCpu(node.cpuLimitTotal)}</span>
                      </div>
                    )}
                  </div>

                  {/* Memory */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <div className="flex items-center gap-1">
                        <MemoryStick className="h-3.5 w-3.5" />
                        <span>Memory</span>
                      </div>
                      <div className="text-right">
                        <div>Allocatable: {formatBytes(node.memoryTotal)}</div>
                        {node.memoryCapacity > node.memoryTotal && (
                          <div className="text-neutral-600">Capacity: {formatBytes(node.memoryCapacity)}</div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Actual</span>
                        <span className={getUsageColor(node.memoryPercentage)}>
                          {formatBytes(node.memoryUsed)} · {node.memoryPercentage}%
                        </span>
                      </div>
                      <Progress
                        value={node.memoryPercentage}
                        className="h-2 bg-neutral-700"
                        indicatorClassName={getProgressColor(node.memoryPercentage)}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-amber-400/80">Requested (scheduled)</span>
                        <span className="text-amber-400">
                          {formatBytes(node.memoryRequested)} · {memReqPct}%
                        </span>
                      </div>
                      <Progress
                        value={memReqPct}
                        className="h-2 bg-neutral-700"
                        indicatorClassName={memReqPct >= 90 ? "bg-red-500" : memReqPct >= 70 ? "bg-amber-500" : "bg-amber-400"}
                      />
                    </div>
                    {node.memoryLimitTotal > 0 && (
                      <div className="flex items-center justify-between text-xs text-neutral-500 border-t border-neutral-800 pt-1">
                        <span>Limits (OOM ceiling)</span>
                        <span>{formatBytes(node.memoryLimitTotal)}</span>
                      </div>
                    )}
                  </div>

                  {/* Disk */}
                  {node.diskTotal > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-neutral-500">
                        <span>Disk</span>
                        <span>{formatBytes(node.diskTotal)} total</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-400">Used</span>
                          <span className={getUsageColor(node.diskPercentage)}>
                            {formatBytes(node.diskUsed)} · {node.diskPercentage}%
                          </span>
                        </div>
                        <Progress
                          value={node.diskPercentage}
                          className="h-2 bg-neutral-700"
                          indicatorClassName={getProgressColor(node.diskPercentage)}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-600">Disk: N/A (node_exporter not scraped)</p>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Empty state for nodes */}
      {(!metrics?.nodes || metrics.nodes.length === 0) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center"
        >
          <Server className="h-12 w-12 text-neutral-600 mx-auto mb-4" />
          <p className="text-neutral-400">No node information available</p>
          <p className="text-neutral-500 text-sm mt-1">
            Make sure Prometheus is running and kube-state-metrics is configured
          </p>
        </motion.div>
      )}

      {/* ── Pending Pods Debug Panel ─────────────────────────────────────── */}
      {pendingPods.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="bg-red-950/20 border border-red-500/30 rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b border-red-500/20 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <div>
              <h3 className="text-red-300 font-medium">
                Scheduling Debug — {pendingPods.length} Pending Pod{pendingPods.length !== 1 ? "s" : ""}
              </h3>
              <p className="text-xs text-red-400/70 mt-0.5">
                K8s schedules based on resource <strong>requests</strong>, not actual usage.
                A node may look idle in Prometheus while being fully allocated by requests.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-red-500/10 hover:bg-transparent">
                  <TableHead className="text-red-400/70">Pod</TableHead>
                  <TableHead className="text-red-400/70">Namespace</TableHead>
                  <TableHead className="text-red-400/70">Age</TableHead>
                  <TableHead className="text-red-400/70">Scheduler Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPods.map((pod, i) => (
                  <TableRow key={i} className="border-red-500/10 hover:bg-red-900/10">
                    <TableCell className="text-white font-mono text-xs">{pod.name}</TableCell>
                    <TableCell>
                      <span className="text-xs bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">
                        {pod.namespace}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-neutral-400 text-xs">
                        <Clock className="h-3 w-3" />
                        {formatAge(pod.ageSeconds)}
                      </div>
                    </TableCell>
                    <TableCell className="text-red-300 text-xs max-w-[400px]">
                      {pod.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </motion.div>
      )}

      {/* ── Namespace Resource Usage ──────────────────────────────────────── */}
      {metrics?.namespaces && metrics.namespaces.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b border-neutral-800 flex items-center gap-3">
            <Layers className="h-5 w-5 text-neutral-400" />
            <div>
              <h3 className="text-white font-medium">Namespace Resource Usage</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Multi-tenant visibility — top consumers by memory
              </p>
            </div>
          </div>
          {/* Top CPU reserver warning */}
          {(() => {
            const totalReq = metrics?.cpu?.requested ?? 0;
            if (totalReq === 0) return null;
            const topNs = [...(metrics?.namespaces ?? [])].sort((a, b) => b.cpuRequested - a.cpuRequested)[0];
            if (!topNs) return null;
            const share = Math.round((topNs.cpuRequested / totalReq) * 100);
            if (share < 40) return null;
            return (
              <div className="px-4 py-2.5 bg-amber-400/5 border-b border-amber-400/15 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-xs text-amber-400">
                  <span className="font-mono font-medium">{topNs.namespace}</span>
                  {" "}is the top CPU reserver — {formatCpu(topNs.cpuRequested)} ({share}% of total requested).
                  {" "}If it has low actual usage, consider tightening its resource requests.
                </span>
              </div>
            );
          })()}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-800 hover:bg-transparent">
                  <TableHead className="text-neutral-400">Namespace</TableHead>
                  <TableHead className="text-neutral-400">CPU actual</TableHead>
                  <TableHead className="text-neutral-400">CPU requested</TableHead>
                  <TableHead className="text-neutral-400">Mem actual</TableHead>
                  <TableHead className="text-neutral-400">Mem requested</TableHead>
                  <TableHead className="text-neutral-400">CPU share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  // Sum namespace-level CPU values for the denominator so shares are
                  // internally consistent. Using metrics.cpu.used (a separate Prometheus
                  // query at a different timestamp) causes small namespaces to round wrong.
                  const totalNsCpu = metrics.namespaces.reduce((s, n) => s + n.cpuCores, 0);
                  return metrics.namespaces.slice(0, 12).map((ns, i) => {
                  const cpuShare = totalNsCpu > 0
                    ? Math.round((ns.cpuCores / totalNsCpu) * 100)
                    : 0;
                  return (
                    <TableRow key={i} className="border-neutral-800 hover:bg-neutral-800/50">
                      <TableCell className="text-white font-mono text-sm">{ns.namespace}</TableCell>
                      <TableCell className="text-neutral-300 text-sm">{formatCpu(ns.cpuCores)}</TableCell>
                      <TableCell className="text-amber-400/90 text-sm">{formatCpu(ns.cpuRequested)}</TableCell>
                      <TableCell className="text-neutral-300 text-sm">{formatBytes(ns.memoryBytes)}</TableCell>
                      <TableCell className="text-amber-400/90 text-sm">{formatBytes(ns.memoryRequested)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={cpuShare}
                            className="h-1.5 w-20 bg-neutral-700"
                            indicatorClassName="bg-blue-500"
                          />
                          <span className="text-xs text-neutral-400">{cpuShare}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                  });
                })()}
              </TableBody>
            </Table>
          </div>
        </motion.div>
      )}

      {/* ── Top Resource Consumers ─────────────────────────────────────── */}
      {(metrics?.topPods?.length ?? 0) > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.52 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b border-neutral-800 flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-400" />
            <div>
              <h3 className="text-white font-medium">Top Resource Consumers</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Highest actual CPU + memory usage — Prometheus cAdvisor, last 5m
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-800 hover:bg-transparent">
                  <TableHead className="text-neutral-400">Pod</TableHead>
                  <TableHead className="text-neutral-400">Namespace</TableHead>
                  <TableHead className="text-neutral-400 text-right">CPU actual</TableHead>
                  <TableHead className="text-neutral-400 text-right">Memory actual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics?.topPods?.map((p, i) => (
                  <TableRow key={i} className="border-neutral-800 hover:bg-neutral-800/50">
                    <TableCell className="text-white font-mono text-xs max-w-[280px] truncate" title={p.pod}>
                      {p.pod}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">
                        {p.namespace}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-medium text-sm ${p.cpuCores > 0.5 ? "text-yellow-400" : "text-neutral-300"}`}>
                        {formatCpu(p.cpuCores)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.memoryBytes > 0 ? (
                        <span className={`font-medium text-sm ${p.memoryBytes > 500 * 1024 * 1024 ? "text-yellow-400" : "text-neutral-300"}`}>
                          {formatBytes(p.memoryBytes)}
                        </span>
                      ) : (
                        <span className="text-sm text-neutral-600" title="No memory data in Prometheus — hostPID/hostNetwork pods are not scraped by cAdvisor">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </motion.div>
      )}

      {/* ── Event Summary ─────────────────────────────────────────────────── */}
      {(metrics?.eventSummary?.length ?? 0) > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.56 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b border-neutral-800 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            <div>
              <h3 className="text-white font-medium">Cluster Event Patterns</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Top event reasons aggregated by count — Warning events are highlighted
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-800 hover:bg-transparent">
                  <TableHead className="text-neutral-400">Reason</TableHead>
                  <TableHead className="text-neutral-400 text-right">Count</TableHead>
                  <TableHead className="text-neutral-400">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics?.eventSummary?.map((ev, i) => (
                  <TableRow key={i} className={`border-neutral-800 hover:bg-neutral-800/50 ${ev.isWarning ? "bg-orange-950/10" : ""}`}>
                    <TableCell className={`font-mono text-sm ${ev.isWarning ? "text-orange-300" : "text-neutral-300"}`}>
                      {ev.reason}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-semibold text-sm ${
                        ev.count > 10000 ? "text-red-400" :
                        ev.count > 1000  ? "text-yellow-400" :
                        ev.count > 100   ? "text-orange-400" :
                                           "text-neutral-300"
                      }`}>
                        {ev.count >= 1000 ? `${(ev.count / 1000).toFixed(1)}k` : ev.count}
                      </span>
                    </TableCell>
                    <TableCell>
                      {ev.isWarning ? (
                        <span className="text-xs bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-full">Warning</span>
                      ) : (
                        <span className="text-xs bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded-full">Normal</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </motion.div>
      )}

      {/* ── Top Restarting Pods ───────────────────────────────────────────── */}
      {(metrics?.workloads?.topRestartPods?.length ?? 0) > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b border-neutral-800 flex items-center gap-3">
            <RotateCcw className="h-5 w-5 text-yellow-400" />
            <div>
              <h3 className="text-white font-medium">Top Restarting Pods</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Total cluster restarts: {metrics?.workloads?.totalRestarts ?? 0} — high restarts indicate CrashLoopBackOff or OOM
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-800 hover:bg-transparent">
                  <TableHead className="text-neutral-400">Pod</TableHead>
                  <TableHead className="text-neutral-400">Namespace</TableHead>
                  <TableHead className="text-neutral-400 text-right">Restarts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics?.workloads?.topRestartPods?.map((p, i) => (
                  <TableRow key={i} className="border-neutral-800 hover:bg-neutral-800/50">
                    <TableCell className="text-white font-mono text-xs">{p.name}</TableCell>
                    <TableCell>
                      <span className="text-xs bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">
                        {p.namespace}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-medium text-sm ${p.restarts >= 10 ? "text-red-400" : p.restarts >= 5 ? "text-yellow-400" : "text-neutral-300"}`}>
                        {p.restarts}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
