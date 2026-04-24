"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { motion } from "motion/react";
import {
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GitBranch,
  Cpu,
  MemoryStick,
  Layers,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Globe,
  RotateCcw,
  Activity,
} from "lucide-react";
import api from "@/lib/axios/axios";
import type { PlatformAppResource } from "@/app/api/admin/cluster/platform-apps/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCpu(cores: number): string {
  if (cores === 0) return "—";
  if (cores < 0.001) return `${(cores * 1_000_000).toFixed(0)}μ`;
  if (cores < 1) return `${(cores * 1000).toFixed(0)}m`;
  return `${cores.toFixed(2)}c`;
}

function fmtMem(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Status helpers ───────────────────────────────────────────────────────────

type K8sStatus = "healthy" | "degraded" | "failing" | "progressing" | "unknown" | "not_deployed";

function K8sStatusBadge({ status }: { status: string }) {
  const s = status as K8sStatus;
  const cfg: Record<K8sStatus, { label: string; className: string; icon: React.ReactNode }> = {
    healthy: {
      label: "Healthy",
      className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    degraded: {
      label: "Degraded",
      className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    failing: {
      label: "Failing",
      className: "bg-red-500/15 text-red-400 border-red-500/30",
      icon: <XCircle className="h-3 w-3" />,
    },
    progressing: {
      label: "Deploying",
      className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      icon: <Clock className="h-3 w-3 animate-spin" />,
    },
    unknown: {
      label: "Unknown",
      className: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    not_deployed: {
      label: "Not Deployed",
      className: "bg-neutral-700/40 text-neutral-500 border-neutral-600/30",
      icon: <XCircle className="h-3 w-3" />,
    },
  };
  const { label, className, icon } = cfg[s] ?? cfg.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

function AppStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    running: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    deploying: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    failed: "bg-red-500/15 text-red-400 border-red-500/30",
    stopped: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  };
  const cls = colorMap[status.toLowerCase()] ?? "bg-neutral-700/40 text-neutral-500 border-neutral-600/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${cls}`}>
      {status}
    </span>
  );
}

function SizeBadge({ size }: { size: string | null }) {
  if (!size) return <span className="text-neutral-600">—</span>;
  const colorMap: Record<string, string> = {
    small: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    medium: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    large: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  const cls = colorMap[size.toLowerCase()] ?? "bg-neutral-700/40 text-neutral-400 border-neutral-600/20";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium capitalize ${cls}`}>
      {size}
    </span>
  );
}

function UsageCell({
  actual,
  requested,
  limited,
  fmt,
}: {
  actual: number;
  requested: number;
  limited?: number;
  fmt: (v: number) => string;
}) {
  if (requested === 0) {
    return <span className="font-mono text-xs text-neutral-400">{actual > 0 ? fmt(actual) : "\u2014"}</span>;
  }
  const pctReq = (actual / requested) * 100;
  // Color and bar based on limit % when available; fall back to request %
  const pctLimit = limited && limited > 0 ? (actual / limited) * 100 : null;
  const effectivePct = pctLimit ?? pctReq;
  const isHigh = effectivePct > 80;
  const isAboveReq = pctReq > 100 && !isHigh; // over request but under limit — normal K8s burstable
  const isLow = pctReq < 20;
  const color = isHigh ? "text-red-400" : isAboveReq ? "text-orange-400" : isLow ? "text-amber-400" : "text-emerald-400";
  const barColor = isHigh ? "bg-red-500" : isAboveReq ? "bg-orange-500" : isLow ? "bg-amber-500" : "bg-emerald-500";
  const barW = Math.min(effectivePct, 100);
  const pctDisplay = pctLimit !== null
    ? (pctLimit < 1 ? "<1%" : `${Math.round(pctLimit)}%`)
    : (pctReq < 1 ? "<1%" : `${Math.round(pctReq)}%`);
  return (
    <div className="flex flex-col gap-0.5 min-w-[72px]">
      <span className="font-mono text-xs text-neutral-200">{fmt(actual)}</span>
      <div className="flex items-center gap-1.5">
        <div className="w-10 h-1 bg-neutral-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barW}%` }} />
        </div>
        <span className={`text-[10px] font-semibold ${color}`}>
          {pctDisplay}
          {isLow && " \u26a0"}
        </span>
      </div>
      <span className="text-[10px] text-neutral-600">/ {fmt(requested)} req</span>
    </div>
  );
}

function RestartBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-neutral-600 text-xs">{"\u2014"}</span>;
  const cls =
    count >= 5
      ? "text-red-400 bg-red-500/10 border-red-500/20"
      : "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium ${cls}`}>
      <RotateCcw className="h-2.5 w-2.5" />
      {count}
    </span>
  );
}

// ─── Detail Row ───────────────────────────────────────────────────────────────

function DetailRow({ app }: { app: PlatformAppResource }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-neutral-900/60 rounded-lg border border-neutral-800/50">
      {/* Deployment URL */}
      <div>
        <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
          <Globe className="h-3 w-3" />
          Deployment URL
        </p>
        {app.deployment_url ? (
          <a
            href={app.deployment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 text-sm hover:underline flex items-center gap-1 truncate"
          >
            {app.deployment_url}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className="text-neutral-500 text-sm">Not assigned</span>
        )}
      </div>

      {/* IP */}
      <div>
        <p className="text-xs text-neutral-500 mb-1">Node IP</p>
        <p className="text-sm text-neutral-300 font-mono">{app.ip ?? "—"}</p>
      </div>

      {/* Repository */}
      <div>
        <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          Repository
        </p>
        <a
          href={app.repository_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 text-sm hover:underline flex items-center gap-1 truncate"
        >
          {app.repository_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\.git$/, "")}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <p className="text-xs text-neutral-500 mt-0.5">Branch: {app.branch}</p>
      </div>

      {/* K8s replicas */}
      <div>
        <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
          <Layers className="h-3 w-3" />
          Replicas
        </p>
        <p className="text-sm text-neutral-300">
          <span className={app.readyReplicas < app.desiredReplicas ? "text-yellow-400" : "text-emerald-400"}>
            {app.readyReplicas}
          </span>
          <span className="text-neutral-500"> / {app.desiredReplicas} ready</span>
        </p>
      </div>

      {/* CPU */}
      <div>
        <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
          <Cpu className="h-3 w-3" />
          CPU Usage
        </p>
        <p className="text-sm text-neutral-300 font-mono">
          {fmtCpu(app.cpuCores)}
          {app.cpuRequested > 0 && (
            <span className="text-neutral-500 text-xs"> / {fmtCpu(app.cpuRequested)} req</span>
          )}
          {app.cpuLimited > 0 && (
            <span className="text-neutral-600 text-xs"> ({fmtCpu(app.cpuLimited)} limit)</span>
          )}
        </p>
        {app.cpuLimited > 0 && (
          <p className={`text-xs mt-0.5 ${app.cpuCores / app.cpuLimited > 0.8 ? "text-red-400" : app.cpuCores / app.cpuRequested < 0.2 ? "text-amber-400" : "text-emerald-400"}`}>
            {Math.round((app.cpuCores / app.cpuLimited) * 100)}% of limit
          </p>
        )}
      </div>

      {/* Memory */}
      <div>
        <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
          <MemoryStick className="h-3 w-3" />
          Memory Usage
        </p>
        <p className="text-sm text-neutral-300 font-mono">
          {fmtMem(app.memoryBytes)}
          {app.memoryRequested > 0 && (
            <span className="text-neutral-500 text-xs"> / {fmtMem(app.memoryRequested)} req</span>
          )}
          {app.memoryLimited > 0 && (
            <span className="text-neutral-600 text-xs"> ({fmtMem(app.memoryLimited)} limit)</span>
          )}
        </p>
        {app.memoryLimited > 0 && (
          <p className={`text-xs mt-0.5 ${app.memoryBytes / app.memoryLimited > 0.8 ? "text-red-400" : app.memoryBytes / app.memoryRequested < 0.2 ? "text-amber-400" : "text-emerald-400"}`}>
            {Math.round((app.memoryBytes / app.memoryLimited) * 100)}% of limit
          </p>
        )}
      </div>

      {/* Owner */}
      <div>
        <p className="text-xs text-neutral-500 mb-1">Owner</p>
        <p className="text-sm text-neutral-300">{app.owner_email ?? "—"}</p>
        {app.owner_username && (
          <p className="text-xs text-neutral-500">@{app.owner_username}</p>
        )}
      </div>

      {/* Framework */}
      <div>
        <p className="text-xs text-neutral-500 mb-1">Framework</p>
        <p className="text-sm text-neutral-300 capitalize">{app.framework ?? "Unknown"}</p>
      </div>

      {/* Created */}
      <div>
        <p className="text-xs text-neutral-500 mb-1">Created</p>
        <p className="text-sm text-neutral-300">{fmtDate(app.created_at)}</p>
      </div>

      {/* Last Deploy */}
      {app.lastRolloutTime && (
        <div>
          <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Last Deploy
          </p>
          <p className="text-sm text-neutral-300">{fmtDate(app.lastRolloutTime)}</p>
        </div>
      )}

      {/* Diagnosis */}
      {app.inlineDiagnosis && (
        <div className="sm:col-span-2 lg:col-span-3">
          <p className="text-xs text-neutral-500 mb-1">Diagnosis</p>
          <p className="text-xs text-yellow-300/80 bg-yellow-500/5 border border-yellow-500/10 rounded px-2 py-1.5">
            {app.inlineDiagnosis}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 30_000;

type SortKey = "name" | "cpu" | "memory" | "status" | "restarts" | "owner";

export default function PlatformAppsTab() {
  const [apps, setApps] = useState<PlatformAppResource[]>([]);
  const [filtered, setFiltered] = useState<PlatformAppResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cpu");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchApps = useCallback(async () => {
    try {
      const res = await api.get<{ apps: PlatformAppResource[]; timestamp: string }>(
        "/admin/cluster/platform-apps",
      );
      if (!res.data?.apps) {
        setError("No data returned from server.");
        return;
      }
      setApps(res.data.apps);
      setLastUpdated(new Date(res.data.timestamp));
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load platform apps";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApps();
    intervalRef.current = setInterval(fetchApps, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchApps]);

  // Filter + sort
  useEffect(() => {
    let list = [...apps];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.owner_email ?? "").toLowerCase().includes(q) ||
          (a.owner_username ?? "").toLowerCase().includes(q) ||
          (a.framework ?? "").toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.name.localeCompare(b.name);
      else if (sortKey === "cpu") diff = a.cpuCores - b.cpuCores;
      else if (sortKey === "memory") diff = a.memoryBytes - b.memoryBytes;
      else if (sortKey === "status") diff = a.k8sStatus.localeCompare(b.k8sStatus);
      else if (sortKey === "restarts") diff = a.totalRestarts - b.totalRestarts;
      else if (sortKey === "owner") diff = (a.owner_email ?? "").localeCompare(b.owner_email ?? "");
      return sortAsc ? diff : -diff;
    });

    setFiltered(list);
  }, [apps, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortAsc ? <ChevronUp className="h-3 w-3 inline ml-1" /> : <ChevronDown className="h-3 w-3 inline ml-1" />
    ) : null;

  // Summary stats
  const healthyCount = apps.filter((a) => a.k8sStatus === "healthy").length;
  const unhealthyCount = apps.filter((a) =>
    ["failing", "degraded"].includes(a.k8sStatus),
  ).length;
  const overProvisionedCount = apps.filter(
    (a) => a.cpuRequested > 0 && a.cpuCores / a.cpuRequested < 0.2,
  ).length;
  const totalRestartCount = apps.reduce((s, a) => s + a.totalRestarts, 0);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">Platform Apps</h2>
          {lastUpdated && (
            <span className="text-xs text-neutral-500">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={() => { setLoading(true); fetchApps(); }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      {!loading && apps.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Apps", value: apps.length.toString(), color: "text-white", sub: null },
            { label: "Healthy", value: healthyCount.toString(), color: "text-emerald-400", sub: null },
            { label: "Issues", value: unhealthyCount.toString(), color: unhealthyCount > 0 ? "text-red-400" : "text-neutral-400", sub: null },
            { label: "Not Deployed", value: apps.filter((a) => a.k8sStatus === "not_deployed").length.toString(), color: "text-neutral-400", sub: null },
            { label: "Over-provisioned", value: overProvisionedCount.toString(), color: overProvisionedCount > 0 ? "text-amber-400" : "text-neutral-400", sub: "CPU < 20% util" },
            { label: "Total Restarts", value: totalRestartCount.toString(), color: totalRestartCount > 0 ? "text-orange-400" : "text-neutral-400", sub: null },
          ].map((card) => (
            <div key={card.label} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
              <p className="text-xs text-neutral-500 mb-0.5">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              {card.sub && <p className="text-[10px] text-neutral-600 mt-0.5">{card.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
        <input
          type="text"
          placeholder="Search by name, owner, framework…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-neutral-800/50 rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/50">
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-200 select-none"
                  onClick={() => toggleSort("name")}
                >
                  App <SortIcon k="name" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Owner
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Plan
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Pods
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-200 select-none"
                  onClick={() => toggleSort("cpu")}
                >
                  CPU <SortIcon k="cpu" />
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-200 select-none"
                  onClick={() => toggleSort("memory")}
                >
                  Memory <SortIcon k="memory" />
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-200 select-none"
                  onClick={() => toggleSort("restarts")}
                >
                  Restarts <SortIcon k="restarts" />
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-200 select-none"
                  onClick={() => toggleSort("status")}
                >
                  Status <SortIcon k="status" />
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-neutral-500">
                    {apps.length === 0 ? "No platform apps found." : "No apps match your search."}
                  </td>
                </tr>
              )}
              {filtered.map((app) => {
                const rowKey = app.id;
                const isExpanded = expandedRow === rowKey;
                return (
                  <Fragment key={rowKey}>
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-neutral-800/30 transition-colors"
                    >
                      {/* App name */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-white">{app.name}</span>
                          <div className="flex items-center gap-1">
                            <AppStatusBadge status={app.status} />
                            {app.framework && (
                              <span className="text-xs text-neutral-500 capitalize">{app.framework}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Owner */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-neutral-300 text-xs truncate max-w-[140px]">
                            {app.owner_email ?? "—"}
                          </span>
                          {app.owner_username && (
                            <span className="text-neutral-600 text-xs">@{app.owner_username}</span>
                          )}
                        </div>
                      </td>

                      {/* Plan size */}
                      <td className="px-4 py-3">
                        <SizeBadge size={app.size} />
                      </td>

                      {/* Pods */}
                      <td className="px-4 py-3">
                        {app.desiredReplicas === 0 ? (
                          <span className="text-neutral-600 text-xs">—</span>
                        ) : (
                          <span
                            className={`font-mono text-sm ${
                              app.readyReplicas < app.desiredReplicas
                                ? "text-yellow-400"
                                : "text-emerald-400"
                            }`}
                          >
                            {app.readyReplicas}/{app.desiredReplicas}
                          </span>
                        )}
                      </td>

                      {/* CPU */}
                      <td className="px-4 py-3">
                        <UsageCell actual={app.cpuCores} requested={app.cpuRequested} limited={app.cpuLimited} fmt={fmtCpu} />
                      </td>

                      {/* Memory */}
                      <td className="px-4 py-3">
                        <UsageCell actual={app.memoryBytes} requested={app.memoryRequested} limited={app.memoryLimited} fmt={fmtMem} />
                      </td>

                      {/* Restarts */}
                      <td className="px-4 py-3">
                        <RestartBadge count={app.totalRestarts} />
                      </td>

                      {/* K8s status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <K8sStatusBadge status={app.k8sStatus} />
                          {app.inlineDiagnosis && (
                            <span className="text-[10px] text-neutral-500 max-w-[140px] leading-tight">
                              {app.inlineDiagnosis}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Expand button */}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                          className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                          title="View details"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </motion.tr>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} className="px-4 pb-3 pt-0">
                          <DetailRow app={app} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
