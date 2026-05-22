"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  GitCommit,
  Layers,
  Loader2,
  Terminal,
  XCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";

import { getAppOperationLabel } from "@/lib/app-operations/core/presentation";
import { getPlatformAppRetentionPolicy } from "@/lib/platform-apps/retention";
import type { Deployment } from "@/hooks/use-realtime-deployments";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

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

function statusMeta(status: string): { color: string; label: string } {
  switch (status) {
    case "SUCCESS":  return { color: "#4ade80", label: "Success" };
    case "FAILURE":  return { color: "#f87171", label: "Failed" };
    case "BUILDING": return { color: ACCENT, label: "Building" };
    case "ABORTED":  return { color: "rgba(255,255,255,0.45)", label: "Cancelled" };
    case "UNSTABLE": return { color: "#fbbf24", label: "Unstable" };
    default:         return { color: "rgba(255,255,255,0.45)", label: status };
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

function StatusPill({ status }: { status: string }) {
  const meta = statusMeta(status);
  const isBuilding = status === "BUILDING";
  return (
    <span
      className={`${MONO} inline-flex items-center gap-1.5 px-2 py-0.5 border text-[9.5px] uppercase tracking-[0.1em] font-semibold rounded-[20px]`}
      style={{
        borderColor: `${meta.color}33`,
        color: meta.color,
        background: `${meta.color}0d`,
      }}
    >
      <span
        className={`h-1 w-1 rounded-full ${isBuilding ? "animate-pulse" : ""}`}
        style={{ background: meta.color, boxShadow: `0 0 4px ${meta.color}` }}
      />
      {meta.label}
    </span>
  );
}

function ViewLogsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`${MONO} inline-flex items-center gap-1 px-2 py-1 border border-white/[0.08] bg-[#0d0e11] text-[10px] uppercase tracking-[0.08em] text-white/55 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
    >
      <Terminal className="h-3 w-3" />
      Logs
    </button>
  );
}

function OperationRow({
  deployment,
  onViewLogs,
}: {
  deployment: DeploymentEntry;
  onViewLogs: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`${MONO} text-[11.5px] text-white/70 truncate`}>
          {getLabel(deployment)}
        </span>
        <StatusPill status={deployment.status} />
        {deployment.operation_details?.verification?.status === "degraded" && (
          <span className={`${MONO} text-[10px] text-orange-300/80 truncate flex items-center gap-1`}>
            <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" />
            {deployment.operation_details.verification.message ?? "Still converging"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <span
          className={`${MONO} text-[10.5px] text-white/40 tabular-nums`}
          title={new Date(deployment.started_at).toLocaleString()}
        >
          {formatRelative(deployment.started_at)}
        </span>
        <ViewLogsButton onClick={onViewLogs} />
      </div>
    </div>
  );
}

function RollbackRow({
  deployment,
  onViewLogs,
}: {
  deployment: DeploymentEntry;
  onViewLogs: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-6 w-6 shrink-0 inline-flex items-center justify-center border border-white/[0.06] bg-[#0d0e11] rounded-[5px] text-white/45">
          <RotateCcw className="h-3 w-3" />
        </div>
        <span className={`${MONO} text-[12px] text-white/75 truncate`}>
          {getLabel(deployment)}
        </span>
        <StatusPill status={deployment.status} />
        {deployment.operation_details?.verification?.status === "degraded" && (
          <span className={`${MONO} text-[10px] text-orange-300/80 truncate flex items-center gap-1`}>
            <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" />
            {deployment.operation_details.verification.message ?? "Still converging"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <span
          className={`${MONO} text-[10.5px] text-white/40 tabular-nums`}
          title={new Date(deployment.started_at).toLocaleString()}
        >
          {formatRelative(deployment.started_at)}
        </span>
        <ViewLogsButton onClick={onViewLogs} />
      </div>
    </div>
  );
}

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
      className={`flex flex-col gap-2.5 px-4 py-3.5 transition-colors ${
        isCurrentlyServing
          ? "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.06]"
          : "hover:bg-white/[0.02]"
      }`}
      style={
        isCurrentlyServing
          ? { boxShadow: "inset 2px 0 0 #4ade80" }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className={`${MONO} text-[12.5px] text-white/90 truncate font-medium`}>
            {label}
          </span>
          <StatusPill status={deployment.status} />
          {deployment.trigger && (
            <span className={`${MONO} inline-flex items-center px-2 py-0.5 text-[9.5px] uppercase tracking-[0.08em] text-white/40 border border-white/[0.06] rounded-[20px]`}>
              {formatTrigger(deployment.trigger)}
            </span>
          )}
          {isCurrentlyServing && (
            <span
              className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 border border-emerald-400/25 bg-emerald-500/[0.08] text-[9.5px] uppercase tracking-[0.1em] text-emerald-300 rounded-[20px]`}
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              Serving
            </span>
          )}
          {showDeployFailed && (
            <span className={`${MONO} inline-flex items-center px-2 py-0.5 border border-orange-400/25 bg-orange-500/[0.06] text-[9.5px] uppercase tracking-[0.1em] text-orange-300/80 rounded-[20px]`}>
              Deploy Failed
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className={`${MONO} text-[10.5px] text-white/40 tabular-nums`}
            title={new Date(deployment.started_at).toLocaleString()}
          >
            {formatRelative(deployment.started_at)}
          </span>
          <ViewLogsButton onClick={onSelectBuild} />
        </div>
      </div>

      {deployment.commit_sha && (
        <div className="flex items-center gap-1.5 pl-0.5">
          <GitCommit className="h-3 w-3 text-white/30 flex-shrink-0" />
          <code
            className={`${MONO} inline-flex items-center px-1.5 py-0.5 border border-white/[0.06] bg-[#0d0e11] text-[10.5px] rounded-[3px]`}
            style={{ color: ACCENT }}
          >
            {deployment.commit_sha.substring(0, 7)}
          </code>
        </div>
      )}

      {deployment.status === "FAILURE" && deployment.failure_reason && (
        <div className={`${MONO} flex items-start gap-2 border border-rose-500/20 bg-rose-500/[0.05] rounded-[5px] px-2.5 py-2 text-[11px] text-rose-300/80`}>
          <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5 text-rose-400/60" />
          <span className="leading-relaxed">{deployment.failure_reason}</span>
        </div>
      )}
    </div>
  );
}

function ConnectionBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <span className={`${MONO} inline-flex items-center gap-1.5 px-2 py-0.5 border border-emerald-500/25 bg-emerald-500/[0.06] text-[9.5px] uppercase tracking-[0.1em] text-emerald-300 rounded-[20px]`}>
        <span
          className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse"
          style={{ boxShadow: "0 0 5px #4ade80" }}
        />
        Live
      </span>
    );
  }
  if (status === "connecting") {
    return (
      <span
        className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 border text-[9.5px] uppercase tracking-[0.1em] rounded-[20px]`}
        style={{
          borderColor: `${ACCENT}33`,
          background: `${ACCENT}0d`,
          color: ACCENT,
        }}
      >
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Connecting
      </span>
    );
  }
  if (status === "disconnected") {
    return (
      <span className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 border border-yellow-500/25 bg-yellow-500/[0.06] text-[9.5px] uppercase tracking-[0.1em] text-yellow-300 rounded-[20px]`}>
        <XCircle className="h-2.5 w-2.5" />
        Offline
      </span>
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
      <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-6 py-12">
        <div className="flex flex-col items-center justify-center gap-3 text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className={`${MONO} text-[11px] uppercase tracking-[0.14em]`}>
            Loading deployments
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
      <div className="border-b border-white/[0.06] px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-white/45" />
          <h3 className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/65 font-semibold`}>
            Deployment history
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`${MONO} hidden sm:inline text-[10px] text-white/30 tabular-nums`}
            title="Log retention: success / failed / production"
          >
            logs {LOG_RETENTION_LABEL}
          </span>
          <ConnectionBadge status={connectionStatus} />
        </div>
      </div>

      <div>
        {deployments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-white/30">
            <Clock className="h-5 w-5" />
            <p className={`${MONO} text-[11px] uppercase tracking-[0.14em]`}>
              No deployment history yet
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-0 border-b border-white/[0.06] px-4">
              {(["builds", "operations"] as HistoryTab[]).map((tab) => {
                const count = tab === "builds" ? builds.length : operations.length;
                const label = tab === "builds" ? "Releases" : "Operations";
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`${MONO} relative inline-flex items-center gap-1.5 px-3 py-3 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                      isActive ? "text-white" : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    {label}
                    <span className={`tabular-nums ${isActive ? "text-white/55" : "text-white/25"}`}>
                      {count}
                    </span>
                    {isActive && (
                      <span
                        className="absolute left-2 right-2 -bottom-px h-[2px]"
                        style={{
                          background: ACCENT,
                          boxShadow: `0 0 8px ${ACCENT}`,
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {activeTab === "builds" && (
              <div className="divide-y divide-white/[0.04]">
                {builds.length === 0 ? (
                  <p className={`${MONO} text-center py-10 text-[11px] uppercase tracking-[0.14em] text-white/30`}>
                    No release builds yet
                  </p>
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

            {activeTab === "operations" && (
              <div className="divide-y divide-white/[0.04]">
                {operations.length === 0 ? (
                  <p className={`${MONO} text-center py-10 text-[11px] uppercase tracking-[0.14em] text-white/30`}>
                    No operations yet
                  </p>
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
      </div>
    </div>
  );
}
