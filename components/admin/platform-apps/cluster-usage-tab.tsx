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
import { ClusterMetrics, NodeMetrics } from "@/lib/services/prometheus";
import api from "@/lib/axios/axios";

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Format CPU cores
function formatCpu(cores: number): string {
  if (cores < 1) {
    return `${Math.round(cores * 1000)}m.cores`;
  }
  return `${cores.toFixed(2)} cores`;
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

export default function ClusterUsageTab() {
  const [metrics, setMetrics] = useState<ClusterMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasFetched = useRef(false);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get("/admin/cluster-metrics");

      setMetrics(response.data.data);
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

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                {formatCpu(metrics?.cpu?.used || 0)}/ {formatCpu(metrics?.cpu?.total || 0)}
              </span>
            </div>
            <Progress
              value={metrics?.cpu?.percentage || 0}
              className="h-2 bg-neutral-800"
              // @ts-expect-error - indicatorClassName is valid
              indicatorClassName={getProgressColor(metrics?.cpu?.percentage || 0)}
            />
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
            <Progress
              value={metrics?.memory.percentage || 0}
              className="h-2 bg-neutral-800"
              // @ts-expect-error - indicatorClassName is valid
              indicatorClassName={getProgressColor(metrics?.memory.percentage || 0)}
            />
          </div>
        </motion.div>

        {/* Pods Card */}
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
            <h3 className="text-white font-medium">Running Pods</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-white">
                {metrics?.pods.running || 0}
              </span>
              <span className="text-sm text-neutral-400">
                of {metrics?.pods.total || 0} total
              </span>
            </div>
            <Progress
              value={metrics?.pods.total ? ((metrics?.pods.running || 0) / metrics.pods.total) * 100 : 0}
              className="h-2 bg-neutral-800"
              // @ts-expect-error - indicatorClassName is valid
              indicatorClassName="bg-green-500"
            />
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
                  className={`h-2 flex-1 rounded ${
                    node.status === "Ready" ? "bg-green-500" : "bg-red-500"
                  }`}
                  title={`${node.name}: ${node.status}`}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Nodes Table */}
      {metrics?.nodes && metrics.nodes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b border-neutral-800">
            <h3 className="text-white font-medium">Node Details</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-800 hover:bg-transparent">
                  <TableHead className="text-neutral-400">Node Name</TableHead>
                  <TableHead className="text-neutral-400">Status</TableHead>
                  <TableHead className="text-neutral-400">CPU Usage</TableHead>
                  <TableHead className="text-neutral-400">Memory Usage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.nodes.map((node: NodeMetrics, index: number) => (
                  <TableRow
                    key={index}
                    className="border-neutral-800 hover:bg-neutral-800/50"
                  >
                    <TableCell className="text-white font-medium">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-neutral-500" />
                        {node.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {node.status === "Ready" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className={node.status === "Ready" ? "text-green-500" : "text-red-500"}>
                          {node.status}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className={getUsageColor(node.cpuPercentage)}>
                            {node.cpuPercentage}%
                          </span>
                          <span className="text-neutral-400 text-xs">
                            {formatCpu(node.cpuUsed)} / {formatCpu(node.cpuTotal)}
                          </span>
                        </div>
                        <Progress
                          value={node.cpuPercentage}
                          className="h-1.5 bg-neutral-700"
                          // @ts-expect-error - indicatorClassName is valid
                          indicatorClassName={getProgressColor(node.cpuPercentage)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className={getUsageColor(node.memoryPercentage)}>
                            {node.memoryPercentage}%
                          </span>
                          <span className="text-neutral-400 text-xs">
                            {formatBytes(node.memoryUsed)} / {formatBytes(node.memoryTotal)}
                          </span>
                        </div>
                        <Progress
                          value={node.memoryPercentage}
                          className="h-1.5 bg-neutral-700"
                          // @ts-expect-error - indicatorClassName is valid
                          indicatorClassName={getProgressColor(node.memoryPercentage)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    </div>
  );
}
