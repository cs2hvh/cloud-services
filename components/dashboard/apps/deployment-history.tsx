"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  GitCommit,
  Layers,
  Loader2,
  Terminal,
  XCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppOperationLabel } from "@/lib/app-operations/core/presentation";
import { getPlatformAppRetentionPolicy } from "@/lib/platform-apps/retention";
import type { Deployment } from "@/hooks/use-realtime-deployments";

// ─── Types ──────────────────────────────────────────────────────────────────

type DeploymentEntry = Deployment;

export interface DeploymentHistoryProps {
  deployments: DeploymentEntry[];
  deploymentsLoading: boolean;
  connectionStatus: string;
  servingBuildNumber: number | null;
  onSelectBuild: (buildNumber: number) => void;
  onViewOperationLogs: (deploymentId: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLabel(d: DeploymentEntry): string {
  return getAppOperationLabel({
    buildNumber: d.build_number,
    trigger: d.trigger,
    rollbackTargetBuildNumber: d.rollback_target_build_number ?? null,
    operationDetails: d.operation_details ?? null,
  });
}

function statusColor(status: string): string {
  switch (status) {
    case "SUCCESS":  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "FAILURE":  return "bg-red-500/15 text-red-400 border-red-500/20";
    case "BUILDING": return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    case "ABORTED":  return "bg-white/8 text-white/40 border-white/10";
    default:         return "bg-yellow-500/15 text-yellow-400 border-yellow-500/20";
  }
}

function formatBuildStatus(status: string): string {
  switch (status) {
    case "SUCCESS":  return "Success";
    case "FAILURE":  return "Failed";
    case "BUILDING": return "Building";
    case "ABORTED":  return "Cancelled";
    case "UNSTABLE": return "Unstable";
    default:         return status;
  }
}

function formatTrigger(trigger: string): string {
  switch (trigger) {
    case "push":       return "Git Push";
    case "manual":     return "Manual";
    case "rollback":   return "Rollback";
    case "resize":     return "Resize";
    case "env_update": return "Env Update";
    case "webhook":    return "Webhook";
    default:           return trigger.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function formatRelative(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ViewLogsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 border border-white/[0.10] bg-white/[0.03] px-2.5 py-1 text-xs text-white/50 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white/80"
    >
      <Terminal className="w-3 h-3" />
      Logs
    </button>
  );
}

/** Compact single-line row for resize / env_update */
function OperationRow({
  deployment,
  onViewLogs,
}: {
  deployment: DeploymentEntry;
  onViewLogs: () => void;
}) {
  return (
    <div className="flex items-center justify-between border border-white/[0.05] bg-white/[0.015] px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
      <div className="flex items-center gap-2.5 min-w-0">
        <Box className="w-3 h-3 text-white/25 flex-shrink-0" />
        <span className="text-xs font-mono text-white/60 truncate">{getLabel(deployment)}</span>
        <Badge className={`rounded-none text-[10px] px-1.5 py-0 border flex-shrink-0 ${statusColor(deployment.status)}`}>
          {formatBuildStatus(deployment.status)}
        </Badge>
        {deployment.operation_details?.verification?.status === "degraded" && (
          <span className="text-[10px] text-orange-300/80 truncate flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
            {deployment.operation_details.verification.message ?? "Still converging"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <span className="text-xs text-white/30" title={new Date(deployment.started_at).toLocaleString()}>
          {formatRelative(deployment.started_at)}
        </span>
        <ViewLogsButton onClick={onViewLogs} />
      </div>
    </div>
  );
}

/** Medium row for rollback operations */
function RollbackRow({
  deployment,
  onViewLogs,
}: {
  deployment: DeploymentEntry;
  onViewLogs: () => void;
}) {
  return (
    <div className="flex items-center justify-between border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.035]">
      <div className="flex items-center gap-2.5 min-w-0">
        <RotateCcw className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        <span className="text-sm font-mono text-white/65 truncate">{getLabel(deployment)}</span>
        <Badge className={`rounded-none text-[10px] px-1.5 py-0 border flex-shrink-0 ${statusColor(deployment.status)}`}>
          {formatBuildStatus(deployment.status)}
        </Badge>
        {deployment.operation_details?.verification?.status === "degraded" && (
          <span className="text-[10px] text-orange-300/80 truncate flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
            {deployment.operation_details.verification.message ?? "Still converging"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <span className="text-xs text-white/30" title={new Date(deployment.started_at).toLocaleString()}>
          {formatRelative(deployment.started_at)}
        </span>
        <ViewLogsButton onClick={onViewLogs} />
      </div>
    </div>
  );
}

/** Full card for release builds */
function BuildRow({
  deployment,
  isCurrentlyServing,
  showDeployFailed,
  onSelectBuild,
}: {
  deployment: DeploymentEntry;
  isCurrentlyServing: boolean;
  showDeployFailed: boolean;
  onSelectBuild: () => void;
}) {
  const label = getLabel(deployment);
  const isBuilding = deployment.status === "BUILDING";

  return (
    <div
      className={`flex flex-col gap-2.5 border px-4 py-3.5 transition-colors ${
        isCurrentlyServing
          ? "border-emerald-500/25 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.06]"
          : "border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.04]"
      }`}
    >
      {/* Top row: label + badges + time + button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-mono text-white/90 truncate">{label}</span>

          <Badge className={`rounded-none text-[10px] px-1.5 py-0 border ${statusColor(deployment.status)}`}>
            {isBuilding && (
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
            )}
            {formatBuildStatus(deployment.status)}
          </Badge>

          {deployment.trigger && (
            <Badge variant="outline" className="rounded-none text-[10px] px-1.5 py-0 text-white/35 border-white/[0.08]">
              {formatTrigger(deployment.trigger)}
            </Badge>
          )}

          {isCurrentlyServing && (
            <Badge className="rounded-none border-emerald-400/20 bg-emerald-500/12 text-emerald-300 text-[10px] px-1.5 py-0">
              <CheckCircle2 className="w-2.5 h-2.5 mr-1 inline" />
              Serving
            </Badge>
          )}

          {showDeployFailed && (
            <Badge className="rounded-none border-orange-400/20 bg-orange-500/10 text-orange-300/80 text-[10px] px-1.5 py-0">
              Deploy Failed
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-white/30" title={new Date(deployment.started_at).toLocaleString()}>
            {formatRelative(deployment.started_at)}
          </span>
          <ViewLogsButton onClick={onSelectBuild} />
        </div>
      </div>

      {/* Commit SHA */}
      {deployment.commit_sha && (
        <div className="flex items-center gap-1.5 text-xs text-white/45 pl-0.5">
          <GitCommit className="w-3 h-3 text-white/30 flex-shrink-0" />
          <code className="border border-white/[0.07] bg-white/[0.04] px-1.5 py-0.5 font-mono text-blue-300/70 text-[11px]">
            {deployment.commit_sha.substring(0, 7)}
          </code>
        </div>
      )}

      {/* Failure reason */}
      {deployment.status === "FAILURE" && deployment.failure_reason && (
        <div className="flex items-start gap-2 border border-red-500/15 bg-red-500/[0.06] px-2.5 py-2 text-xs text-red-300/80">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-red-400/60" />
          <span className="leading-relaxed">{deployment.failure_reason}</span>
        </div>
      )}
    </div>
  );
}

// ─── Connection Badge ────────────────────────────────────────────────────────

function ConnectionBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <Badge className="rounded-none bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[10px] px-1.5 py-0">
        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5 animate-pulse inline-block" />
        Live
      </Badge>
    );
  }
  if (status === "connecting") {
    return (
      <Badge className="rounded-none bg-blue-500/15 text-blue-400 border border-blue-500/20 text-[10px] px-1.5 py-0">
        <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
        Connecting
      </Badge>
    );
  }
  if (status === "disconnected") {
    return (
      <Badge className="rounded-none bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 text-[10px] px-1.5 py-0">
        <XCircle className="w-2.5 h-2.5 mr-1" />
        Offline
      </Badge>
    );
  }
  return null;
}

// ─── Main Component ─────────────────────────────────────────────────────────

type HistoryTab = "builds" | "operations";

const RETENTION_POLICY = getPlatformAppRetentionPolicy();
const LOG_RETENTION_LABEL = `${RETENTION_POLICY.logs.successfulBuildDays}d / ${RETENTION_POLICY.logs.failedBuildDays}d / ${RETENTION_POLICY.logs.productionBuildDays}d`;

export function DeploymentHistory({
  deployments,
  deploymentsLoading,
  connectionStatus,
  servingBuildNumber,
  onSelectBuild,
  onViewOperationLogs,
}: DeploymentHistoryProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("builds");

  const builds = useMemo(
    () => deployments.filter((d) => d.history_type === "release"),
    [deployments]
  );
  const operations = useMemo(
    () => deployments.filter((d) => d.history_type === "operation"),
    [deployments]
  );

  const rollbackTimestamps = useMemo(
    () =>
      operations
        .filter((d) => d.trigger === "rollback" && d.status === "SUCCESS" && d.started_at)
        .map((d) => new Date(d.started_at).getTime()),
    [operations]
  );

  if (deploymentsLoading && deployments.length === 0) {
    return (
      <Card className="glass-panel rounded-none border-white/[0.08]">
        <CardContent className="pt-5">
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-white/40">
            <Loader2 className="w-6 h-6 animate-spin opacity-50" />
            <p className="text-sm">Loading deployments…</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel rounded-none border-white/[0.08]">
      <CardHeader className="border-b border-white/[0.06] pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2 text-white/90">
            <Layers className="w-4 h-4 text-white/50" />
            Deployment History
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-white/25 sm:inline" title="Log retention: success / failed / production">
              logs {LOG_RETENTION_LABEL}
            </span>
            <ConnectionBadge status={connectionStatus} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 px-0">
        {deployments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-white/30">
            <Clock className="w-6 h-6 opacity-40" />
            <p className="text-sm">No deployment history yet</p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center gap-0 border-b border-white/[0.06] px-4 mb-4">
              {(["builds", "operations"] as HistoryTab[]).map((tab) => {
                const count = tab === "builds" ? builds.length : operations.length;
                const label = tab === "builds" ? "Releases" : "Operations";
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-2 text-xs font-medium transition-colors -mb-px border-b-2 ${
                      activeTab === tab
                        ? "text-white border-blue-500"
                        : "text-white/40 border-transparent hover:text-white/60"
                    }`}
                  >
                    {label}
                    <span className={`ml-1.5 text-[10px] ${activeTab === tab ? "text-white/50" : "text-white/25"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Releases tab */}
            {activeTab === "builds" && (
              <div className="flex flex-col gap-1.5 px-4">
                {builds.length === 0 ? (
                  <p className="text-center py-8 text-sm text-white/30">No release builds yet</p>
                ) : (
                  builds.map((deployment) => {
                    const buildNumber = deployment.build_number;
                    if (buildNumber === null) return null;

                    const isCurrentlyServing =
                      servingBuildNumber !== null && buildNumber === servingBuildNumber;
                    const wasRolledBack = rollbackTimestamps.some(
                      (ts) => ts > new Date(deployment.started_at).getTime()
                    );
                    const showDeployFailed =
                      deployment.status === "SUCCESS" &&
                      !isCurrentlyServing &&
                      !wasRolledBack &&
                      servingBuildNumber !== null &&
                      buildNumber > servingBuildNumber;

                    return (
                      <BuildRow
                        key={deployment.id}
                        deployment={deployment}
                        isCurrentlyServing={isCurrentlyServing}
                        showDeployFailed={showDeployFailed}
                        onSelectBuild={() => onSelectBuild(buildNumber)}
                      />
                    );
                  })
                )}
              </div>
            )}

            {/* Operations tab */}
            {activeTab === "operations" && (
              <div className="flex flex-col gap-1.5 px-4">
                {operations.length === 0 ? (
                  <p className="text-center py-8 text-sm text-white/30">No operations yet</p>
                ) : (
                  operations.map((deployment) => {
                    if (deployment.trigger === "rollback") {
                      return (
                        <RollbackRow
                          key={deployment.id}
                          deployment={deployment}
                          onViewLogs={() => onViewOperationLogs(deployment.id)}
                        />
                      );
                    }
                    return (
                      <OperationRow
                        key={deployment.id}
                        deployment={deployment}
                        onViewLogs={() => onViewOperationLogs(deployment.id)}
                      />
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
