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
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppOperationLabel } from "@/lib/app-operations/core/presentation";
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
  if (status === "SUCCESS") return "bg-green-500/20 text-green-400";
  if (status === "FAILURE") return "bg-red-500/20 text-red-400";
  return "bg-yellow-500/20 text-yellow-400";
}

function formatBuildStatus(status: string): string {
  switch (status) {
    case "SUCCESS":  return "Succeeded";
    case "FAILURE":  return "Failed";
    case "BUILDING": return "In Progress";
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
    default:           return trigger.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** A compact single-line row for resize / env_update / other operations */
function OperationRow({
  deployment,
  onViewLogs,
}: {
  deployment: DeploymentEntry;
  onViewLogs: () => void;
}) {
  const label = getLabel(deployment);

  return (
    <div className="flex items-center justify-between border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <Box className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        <span className="text-sm font-mono text-white/70 truncate">{label}</span>
        <Badge className={`rounded-none text-[10px] flex-shrink-0 ${statusColor(deployment.status)}`}>
          {formatBuildStatus(deployment.status)}
        </Badge>
        {deployment.operation_details?.verification?.status === "degraded" && (
          <span className="text-xs text-orange-300 truncate">
            {deployment.operation_details.verification.message ||
              "Deployment is still converging."}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-white/40 flex-shrink-0">
        <span>{new Date(deployment.started_at).toLocaleString()}</span>
        <button
          onClick={onViewLogs}
          className="flex items-center gap-1 border border-white/[0.12] bg-white/[0.03] px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <Terminal className="w-3 h-3" />
          View Logs
        </button>
      </div>
    </div>
  );
}

/** A full multi-line card for release builds */
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

  return (
    <div
      className={`flex flex-col gap-3 border px-4 py-4 ${
        isCurrentlyServing
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : "border-white/[0.08] bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-white">{label}</span>
          <Badge className={`rounded-none ${statusColor(deployment.status)}`}>
            {formatBuildStatus(deployment.status)}
          </Badge>
          {isCurrentlyServing && (
            <Badge className="rounded-none border-emerald-400/20 bg-emerald-500/15 text-emerald-300 text-xs">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse inline-block" />
              Serving
            </Badge>
          )}
          {showDeployFailed && (
            <Badge className="rounded-none border-orange-400/20 bg-orange-500/10 text-orange-300 text-xs">
              Deploy Failed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-white/50">
          <span>{new Date(deployment.started_at).toLocaleString()}</span>
          <button
            onClick={onSelectBuild}
            className="flex items-center gap-1 border border-white/[0.12] bg-white/[0.03] px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <Terminal className="w-3 h-3" />
            View Logs
          </button>
        </div>
      </div>

      {deployment.commit_sha && (
        <div className="flex items-center gap-2 text-xs text-white/60 pl-1">
          <GitCommit className="w-3 h-3 text-white/40" />
          <code className="border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-blue-200">
            {deployment.commit_sha.substring(0, 7)}
          </code>
        </div>
      )}

      {deployment.status === "FAILURE" && deployment.failure_reason && (
        <div className="flex items-center gap-2 border border-red-500/20 bg-red-500/10 px-2 py-2 text-xs text-red-300">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>{deployment.failure_reason}</span>
        </div>
      )}

      {deployment.trigger && (
        <div className="flex items-center gap-2 text-xs text-white/40 pl-1">
          <Badge variant="outline" className="rounded-none text-xs">
            {formatTrigger(deployment.trigger)}
          </Badge>
        </div>
      )}
    </div>
  );
}

/** Rollback operation row — more prominent than resize but not as big as a build */
function RollbackRow({
  deployment,
  onViewLogs,
}: {
  deployment: DeploymentEntry;
  onViewLogs: () => void;
}) {
  const label = getLabel(deployment);

  return (
    <div className="flex items-center justify-between border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <Layers className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        <span className="text-sm font-mono text-white/70 truncate">{label}</span>
        <Badge className={`rounded-none text-[10px] flex-shrink-0 ${statusColor(deployment.status)}`}>
          {formatBuildStatus(deployment.status)}
        </Badge>
        {deployment.operation_details?.verification?.status === "degraded" && (
          <span className="text-xs text-orange-300 truncate">
            {deployment.operation_details.verification.message ||
              "Deployment is still converging."}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-white/40 flex-shrink-0">
        <span>{new Date(deployment.started_at).toLocaleString()}</span>
        <button
          onClick={onViewLogs}
          className="flex items-center gap-1 border border-white/[0.12] bg-white/[0.03] px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <Terminal className="w-3 h-3" />
          View Logs
        </button>
      </div>
    </div>
  );
}

// ─── Connection Status Badge ────────────────────────────────────────────────

function ConnectionBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <Badge className="rounded-none bg-green-500/20 text-green-400 border-green-500/30 text-xs">
        <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse" />
        Live Updates
      </Badge>
    );
  }
  if (status === "connecting") {
    return (
      <Badge className="rounded-none bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        Connecting...
      </Badge>
    );
  }
  if (status === "disconnected") {
    return (
      <Badge className="rounded-none bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
        <XCircle className="w-3 h-3 mr-1" />
        Disconnected
      </Badge>
    );
  }
  return null;
}

// ─── Main Component ─────────────────────────────────────────────────────────

type HistoryTab = "builds" | "operations";

export function DeploymentHistory({
  deployments,
  deploymentsLoading,
  connectionStatus,
  servingBuildNumber,
  onSelectBuild,
  onViewOperationLogs,
}: DeploymentHistoryProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("builds");

  // Split deployments into builds and operations
  const builds = useMemo(
    () => deployments.filter((d) => d.history_type === "release"),
    [deployments]
  );
  const operations = useMemo(
    () => deployments.filter((d) => d.history_type === "operation"),
    [deployments]
  );

  // Pre-compute rollback timestamps for "Deploy Failed" badge logic
  const rollbackTimestamps = useMemo(
    () =>
      operations
        .filter((d) => d.trigger === "rollback" && d.status === "SUCCESS")
        .map((d) => new Date(d.created_at).getTime()),
    [operations]
  );

  if (deploymentsLoading && deployments.length === 0) {
    return (
      <Card className="glass-panel rounded-none border-white/[0.08]">
        <CardContent className="pt-5">
          <div className="text-center py-8 text-white/50">
            <Loader2 className="w-8 h-8 mx-auto mb-2 opacity-50 animate-spin" />
            <p>Loading deployments...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel rounded-none border-white/[0.08]">
      <CardHeader className="border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Deployment History
          </CardTitle>
          <ConnectionBadge status={connectionStatus} />
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {deployments.length === 0 ? (
          <div className="text-center py-8 text-white/50">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No deployment history available</p>
          </div>
        ) : (
          <>
            {/* Tab switcher */}
            <div className="flex items-center gap-1 mb-4 border-b border-white/[0.06]">
              <button
                onClick={() => setActiveTab("builds")}
                className={`px-4 py-2 text-xs font-medium transition-colors -mb-px ${
                  activeTab === "builds"
                    ? "text-white border-b-2 border-blue-500"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                Release Builds
                <Badge className="ml-2 rounded-none bg-white/[0.06] text-white/50 text-[10px]">
                  {builds.length}
                </Badge>
              </button>
              <button
                onClick={() => setActiveTab("operations")}
                className={`px-4 py-2 text-xs font-medium transition-colors -mb-px ${
                  activeTab === "operations"
                    ? "text-white border-b-2 border-blue-500"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                Operations
                <Badge className="ml-2 rounded-none bg-white/[0.06] text-white/50 text-[10px]">
                  {operations.length}
                </Badge>
              </button>
            </div>

            {/* Builds tab */}
            {activeTab === "builds" && (
              <div className="space-y-2">
                {builds.length === 0 ? (
                  <p className="text-center py-6 text-sm text-white/40">No release builds yet</p>
                ) : (
                  builds.map((deployment) => {
                    const buildNumber = deployment.build_number;
                    if (buildNumber === null) return null;

                    const isCurrentlyServing =
                      servingBuildNumber !== null && buildNumber === servingBuildNumber;
                    const wasRolledBack = rollbackTimestamps.some(
                      (ts) => ts > new Date(deployment.created_at).getTime()
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
              <div className="space-y-2">
                {operations.length === 0 ? (
                  <p className="text-center py-6 text-sm text-white/40">No operations yet</p>
                ) : (
                  operations.map((deployment) => {
                    const isRollback = deployment.trigger === "rollback";

                    if (isRollback) {
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
