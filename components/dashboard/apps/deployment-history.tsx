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

// ─── Design tokens (match app-overview-tab / app-bandwidth-card) ────
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const ACCENT = "#0095FF";

type Tone = "green" | "amber" | "red" | "blue" | "neutral";

const TONE: Record<Tone, { color: string; bg: string; border: string }> = {
  green: { color: "#4ade80", bg: "rgba(74,222,128,0.10)", border: "rgba(74,222,128,0.30)" },
  amber: { color: "#fbbf24", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.30)" },
  red: { color: "#f87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.30)" },
  blue: { color: ACCENT, bg: "rgba(0,149,255,0.10)", border: "rgba(0,149,255,0.30)" },
  neutral: { color: "rgba(255,255,255,0.6)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.10)" },
};

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

function statusMeta(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "SUCCESS":  return { tone: "green", label: "Success" };
    case "FAILURE":  return { tone: "red", label: "Failed" };
    case "BUILDING": return { tone: "blue", label: "Building" };
    case "ABORTED":  return { tone: "neutral", label: "Cancelled" };
    case "UNSTABLE": return { tone: "amber", label: "Unstable" };
    default:         return { tone: "neutral", label: status };
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
  const t = TONE[meta.tone];
  const isBuilding = status === "BUILDING";
  return (
    <span
      className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] w-fit`}
      style={{ color: t.color, background: t.bg, borderColor: t.border }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isBuilding ? "animate-pulse" : ""}`}
        style={{ background: t.color, boxShadow: `0 0 5px ${t.color}` }}
      />
      {meta.label}
    </span>
  );
}

function ViewLogsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`${MONO} inline-flex items-center gap-1 rounded-[5px] border border-white/[0.08] bg-[#111216] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white`}
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
    <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-2.5 transition-colors last:border-b-0 hover:bg-white/[0.015]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`${MONO} truncate text-[12px] text-white/80`}>
          {getLabel(deployment)}
        </span>
        <StatusPill status={deployment.status} />
        {deployment.operation_details?.verification?.status === "degraded" && (
          <span className={`${MONO} flex items-center gap-1 truncate text-[10px] text-amber-300/80`}>
            <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" />
            {deployment.operation_details.verification.message ?? "Still converging"}
          </span>
        )}
      </div>
      <div className="ml-3 flex flex-shrink-0 items-center gap-3">
        <span
          className={`${MONO} text-[10.5px] tabular-nums text-white/40`}
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
    <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-3 transition-colors last:border-b-0 hover:bg-white/[0.015]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#0d0e11]" style={{ color: ACCENT }}>
          <RotateCcw className="h-3 w-3" />
        </span>
        <span className={`${MONO} truncate text-[13px] text-white`}>
          {getLabel(deployment)}
        </span>
        <StatusPill status={deployment.status} />
        {deployment.operation_details?.verification?.status === "degraded" && (
          <span className={`${MONO} flex items-center gap-1 truncate text-[10px] text-amber-300/80`}>
            <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" />
            {deployment.operation_details.verification.message ?? "Still converging"}
          </span>
        )}
      </div>
      <div className="ml-3 flex flex-shrink-0 items-center gap-3">
        <span
          className={`${MONO} text-[10.5px] tabular-nums text-white/40`}
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
      className={`flex flex-col gap-2.5 border-b border-white/[0.04] px-4 py-3.5 transition-colors last:border-b-0 ${
        isCurrentlyServing
          ? "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.06]"
          : "hover:bg-white/[0.015]"
      }`}
      style={
        isCurrentlyServing
          ? { boxShadow: "inset 2px 0 0 #4ade80" }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`${MONO} truncate text-[13px] font-medium text-white`}>
            {label}
          </span>
          <StatusPill status={deployment.status} />
          {deployment.trigger && (
            <span className={`${MONO} inline-flex items-center rounded-[4px] border border-white/[0.06] px-2 py-0.5 text-[9.5px] uppercase tracking-[0.1em] text-white/40`}>
              {formatTrigger(deployment.trigger)}
            </span>
          )}
          {isCurrentlyServing && (
            <span
              className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]`}
              style={{ color: TONE.green.color, background: TONE.green.bg, borderColor: TONE.green.border }}
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              Serving
            </span>
          )}
          {showDeployFailed && (
            <span
              className={`${MONO} inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]`}
              style={{ color: TONE.amber.color, background: TONE.amber.bg, borderColor: TONE.amber.border }}
            >
              Deploy Failed
            </span>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-3">
          <span
            className={`${MONO} text-[10.5px] tabular-nums text-white/40`}
            title={new Date(deployment.started_at).toLocaleString()}
          >
            {formatRelative(deployment.started_at)}
          </span>
          <ViewLogsButton onClick={onSelectBuild} />
        </div>
      </div>

      {deployment.commit_sha && (
        <div className="flex items-center gap-1.5 pl-0.5">
          <GitCommit className="h-3 w-3 flex-shrink-0 text-white/30" />
          <code
            className={`${MONO} inline-flex items-center rounded-[4px] border border-white/[0.06] bg-[#0d0e11] px-1.5 py-0.5 text-[10.5px]`}
            style={{ color: ACCENT }}
          >
            {deployment.commit_sha.substring(0, 7)}
          </code>
        </div>
      )}

      {deployment.status === "FAILURE" && deployment.failure_reason && (
        <div className={`${MONO} flex items-start gap-2 rounded-[6px] border border-red-500/20 bg-red-500/[0.05] px-2.5 py-2 text-[11px] text-red-300/80`}>
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-red-400/60" />
          <span className="leading-relaxed">{deployment.failure_reason}</span>
        </div>
      )}
    </div>
  );
}

function ConnectionBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <span
        className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]`}
        style={{ color: TONE.green.color, background: TONE.green.bg, borderColor: TONE.green.border }}
      >
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full"
          style={{ background: TONE.green.color, boxShadow: "0 0 5px #4ade80" }}
        />
        Live
      </span>
    );
  }
  if (status === "connecting") {
    return (
      <span
        className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]`}
        style={{ color: TONE.blue.color, background: TONE.blue.bg, borderColor: TONE.blue.border }}
      >
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Connecting
      </span>
    );
  }
  if (status === "disconnected") {
    return (
      <span
        className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]`}
        style={{ color: TONE.amber.color, background: TONE.amber.bg, borderColor: TONE.amber.border }}
      >
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
      <section className="rounded-[8px] border border-white/[0.06] bg-[#111216] px-6 py-12">
        <div className="flex flex-col items-center justify-center gap-3 text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className={`${MONO} text-[11px] uppercase tracking-[0.14em]`}>
            Loading deployments
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[8px] border border-white/[0.06] bg-[#111216] overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#0d0e11]" style={{ color: ACCENT }}>
            <Layers className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-white">Deployment history</h3>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={`${MONO} hidden text-[10px] tabular-nums text-white/30 sm:inline`}
            title="Log retention: success / failed / production"
          >
            logs {LOG_RETENTION_LABEL}
          </span>
          <ConnectionBadge status={connectionStatus} />
        </div>
      </header>

      <div>
        {deployments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-white/30">
            <Clock className="h-7 w-7 text-white/25" />
            <p className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/45`}>
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
              <div>
                {builds.length === 0 ? (
                  <p className={`${MONO} py-10 text-center text-[11px] uppercase tracking-[0.14em] text-white/30`}>
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
              <div>
                {operations.length === 0 ? (
                  <p className={`${MONO} py-10 text-center text-[11px] uppercase tracking-[0.14em] text-white/30`}>
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
    </section>
  );
}
