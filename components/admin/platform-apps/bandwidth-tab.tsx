"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ShieldOff,
  Zap,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import type { AdminBandwidthRow } from "@/app/api/admin/platform-apps/bandwidth/route";

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v.toFixed(u <= 1 ? 0 : 1)} ${units[u]}`;
}

const LIFECYCLE_STYLE: Record<string, string> = {
  ok:         "bg-green-950/50 text-green-400 border-green-900",
  warning:    "bg-yellow-950/50 text-yellow-400 border-yellow-900",
  critical:   "bg-orange-950/50 text-orange-400 border-orange-900",
  overage:    "bg-purple-950/50 text-purple-400 border-purple-900",
  restricted: "bg-red-950/50 text-red-400 border-red-900",
};

function progressColor(status: string): string {
  switch (status) {
    case "warning":    return "[&>div]:bg-yellow-400";
    case "critical":   return "[&>div]:bg-orange-400";
    case "overage":    return "[&>div]:bg-purple-400";
    case "restricted": return "[&>div]:bg-red-500";
    default:           return "[&>div]:bg-green-500";
  }
}

export default function BandwidthTab() {
  const [rows, setRows] = useState<AdminBandwidthRow[]>([]);
  const [periodStart, setPeriodStart] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"usage" | "status" | "name">("usage");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/platform-apps/bandwidth");
      if (!res.ok) throw new Error("Failed to fetch bandwidth data");
      const data = await res.json();
      setRows(data.rows ?? []);
      setPeriodStart(data.period_start ?? "");
    } catch (err) {
      toast.error("Failed to load bandwidth data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = async (
    action: "lift_restriction" | "force_sync",
    row: AdminBandwidthRow
  ) => {
    const key = `${action}:${row.app_id}`;
    setActionLoading(key);
    try {
      const res = await fetch("/api/admin/platform-apps/bandwidth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, app_id: row.app_id, app_name: row.app_name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      toast.success(action === "lift_restriction" ? `Restriction lifted for ${row.app_name}` : `Sync triggered for ${row.app_name}`);
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const sorted = [...rows].sort((a, b) => {
    if (sortBy === "status") {
      const order = ["restricted", "overage", "critical", "warning", "ok"];
      return order.indexOf(a.lifecycle_status) - order.indexOf(b.lifecycle_status);
    }
    if (sortBy === "name") return a.app_name.localeCompare(b.app_name);
    // default: usage desc
    return b.total_bytes - a.total_bytes;
  });

  const restricted = rows.filter(r => r.lifecycle_status === "restricted").length;
  const overage    = rows.filter(r => r.lifecycle_status === "overage").length;
  const critical   = rows.filter(r => r.lifecycle_status === "critical" || r.lifecycle_status === "warning").length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total tracked", value: rows.length, color: "text-white" },
          { label: "Restricted", value: restricted, color: restricted > 0 ? "text-red-400" : "text-white" },
          { label: "Overage", value: overage, color: overage > 0 ? "text-purple-400" : "text-white" },
          { label: "At risk", value: critical, color: critical > 0 ? "text-orange-400" : "text-white" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
            <p className="text-xs text-neutral-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          {periodStart ? `Period: ${periodStart}` : "Current month"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSortBy(s => s === "usage" ? "status" : s === "status" ? "name" : "usage")}
            className="h-7 px-2 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 border-0"
          >
            <ArrowUpDown className="h-3 w-3 mr-1" />
            Sort: {sortBy}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchData}
            disabled={loading}
            className="h-7 px-2 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 border-0"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-6 w-6 text-neutral-400 animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Activity className="h-8 w-8 text-neutral-600" />
              <p className="text-neutral-400 text-sm">No bandwidth records for this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-800/50 border-b border-neutral-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">App</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Usage</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider hidden sm:table-cell">In / Out</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider hidden md:table-cell">Sampled</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {sorted.map((row) => {
                    const quota = row.quota_total_bytes;
                    const pct = row.percent_used ?? 0;
                    const progressPct = Math.min(pct, 100);
                    const style = LIFECYCLE_STYLE[row.lifecycle_status] ?? LIFECYCLE_STYLE.ok;
                    const isRestricted = row.lifecycle_status === "restricted";
                    const liftKey = `lift_restriction:${row.app_id}`;
                    const syncKey = `force_sync:${row.app_id}`;

                    return (
                      <tr key={row.app_id} className={`hover:bg-neutral-800/30 transition-colors ${isRestricted ? "bg-red-950/10" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white text-sm">{row.app_name}</div>
                          <div className="text-xs text-neutral-500">{row.app_size ?? "—"} · {row.app_status ?? "—"}</div>
                        </td>

                        <td className="px-4 py-3 min-w-[140px]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono text-neutral-300">{fmtBytes(row.total_bytes)}</span>
                            {quota > 0 && (
                              <span className="text-xs text-neutral-500">{pct.toFixed(0)}%</span>
                            )}
                          </div>
                          <Progress
                            value={progressPct}
                            className={`h-1.5 bg-neutral-700 ${progressColor(row.lifecycle_status)}`}
                          />
                          {quota > 0 && (
                            <p className="text-[10px] text-neutral-600 mt-0.5">
                              of {fmtBytes(quota)}
                              {row.purchased_bytes > 0 ? ` incl. ${fmtBytes(row.purchased_bytes)} pack` : ""}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div className="text-xs font-mono text-neutral-400 space-y-0.5">
                            <div>↓ {fmtBytes(row.ingress_bytes)}</div>
                            <div>↑ {fmtBytes(row.egress_bytes)}</div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <Badge className={`text-xs border ${style}`}>
                            {row.lifecycle_status}
                          </Badge>
                        </td>

                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs text-neutral-500" suppressHydrationWarning>
                            {row.last_sampled_at
                              ? new Date(row.last_sampled_at).toLocaleString()
                              : "Never"}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isRestricted && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={actionLoading === liftKey}
                                onClick={() => handleAction("lift_restriction", row)}
                                className="h-7 px-2 text-[11px] bg-red-900/40 hover:bg-red-800/60 text-red-300 border-0"
                              >
                                {actionLoading === liftKey ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><ShieldOff className="h-3 w-3 mr-1" />Lift</>
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={actionLoading === syncKey}
                              onClick={() => handleAction("force_sync", row)}
                              className="h-7 px-2 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-0"
                            >
                              {actionLoading === syncKey ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <><Zap className="h-3 w-3 mr-1" />Sync</>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {restricted > 0 && (
        <div className="flex items-start gap-2 p-3 bg-red-950/20 border border-red-900/40 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-300">
            {restricted} app{restricted > 1 ? "s are" : " is"} currently traffic-restricted.
            Use <strong>Lift</strong> to remove the K8s Ingress block and reset the lifecycle to OK.
            Note: the next cron sync will re-restrict if usage is still above 105%.
          </p>
        </div>
      )}
    </div>
  );
}
