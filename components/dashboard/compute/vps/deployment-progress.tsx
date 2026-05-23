"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowRight, Check, Copy, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────────────────────────

interface ProvisioningInfo {
  stage: string;
  progress: number;
  message: string;
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
}

interface ServerRecord {
  id: number;
  name: string;
  ip: string;
  os: string;
  status: string;
  cpu_cores: number;
  memory_mb: number;
  disk_gb: number;
  details?: { provisioning?: ProvisioningInfo } | null;
}

interface DeploymentProgressProps {
  serverId: number;
  serverName: string;
  serverIp: string;
  serverOs: string;
  connectionType: "ssh" | "rdp";
  username: string;
  onCreateAnother: () => void;
}

// ─── Constants ──────────────────────────────────────────────────

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

const STAGES = [
  { id: "allocating",  label: "Reserving resources" },
  { id: "cloning",     label: "Creating disk image" },
  { id: "configuring", label: "Configuring hardware" },
  { id: "networking",  label: "Setting up network" },
  { id: "booting",     label: "Starting server" },
  { id: "verifying",   label: "Verifying connectivity" },
] as const;

type StageId = typeof STAGES[number]["id"];

function stageIndex(stageId: string): number {
  const idx = STAGES.findIndex((s) => s.id === stageId);
  return idx >= 0 ? idx : -1;
}

// ─── Component ──────────────────────────────────────────────────

export default function DeploymentProgress({
  serverId,
  serverName,
  serverIp,
  serverOs,
  connectionType,
  username,
  onCreateAnother,
}: DeploymentProgressProps) {
  const [server, setServer] = useState<ServerRecord | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const supabase = createClient();

    const fetchServer = async () => {
      const { data } = await supabase
        .from("servers")
        .select("id, name, ip, os, status, cpu_cores, memory_mb, disk_gb, details")
        .eq("id", serverId)
        .single();
      if (data) setServer(data as ServerRecord);
    };
    fetchServer();

    const channel = supabase
      .channel(`deployment-${serverId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "servers", filter: `id=eq.${serverId}` },
        (payload) => {
          const newRecord = payload.new as ServerRecord;
          if (newRecord) setServer(newRecord);
        },
      )
      .subscribe();
    channelRef.current = channel;

    pollRef.current = setInterval(fetchServer, 3000);

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => {
      channel.unsubscribe();
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [serverId]);

  const serverStatus = server?.status;
  useEffect(() => {
    if (serverStatus === "running" || serverStatus === "failed" || serverStatus === "error") {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [serverStatus]);

  const provisioning = server?.details?.provisioning;
  const currentStage = provisioning?.stage || "allocating";
  const progress = provisioning?.progress || 10;
  const isComplete = currentStage === "complete";
  const isFailed = server?.status === "failed" || server?.status === "error" || currentStage === "failed";
  const currentStageIdx = isComplete ? STAGES.length : stageIndex(currentStage as StageId);

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy`);
    }
  };

  // ─── Failed State ─────────────────────────────────────────────
  if (isFailed) {
    return (
      <article
        className="relative overflow-hidden rounded-[10px] border border-white/[0.10] bg-[#111316] p-8 sm:p-10"
        style={{
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 32px -14px rgba(0,0,0,0.7)",
        }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-rose-400/30 bg-rose-400/[0.08] text-rose-300">
            <XCircle className="h-5 w-5" strokeWidth={1.6} />
          </div>
          <div className="flex-1">
            <p
              className={`${MONO} mb-2 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-rose-300/85`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              Deployment failed
            </p>
            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-white sm:text-[26px]">
              {serverName} could not be provisioned.
            </h2>
            <p className="mt-2 max-w-[520px] text-[13.5px] leading-[1.6] text-white/60">
              {provisioning?.message || "An error occurred during deployment. Our team has been notified."}
            </p>
          </div>
        </div>

        <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          <a
            href="mailto:support@ahurasense.com"
            className={`${MONO} inline-flex h-10 items-center justify-center gap-1.5 rounded-[5px] border border-white/[0.14] bg-transparent px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white`}
          >
            Contact support
          </a>
          <button
            type="button"
            onClick={onCreateAnother}
            className={`${MONO} inline-flex h-10 items-center justify-center gap-1.5 rounded-[5px] border border-white bg-white px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-white/90`}
          >
            Try again
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </article>
    );
  }

  // ─── Complete State ───────────────────────────────────────────
  if (isComplete) {
    const isRDP = connectionType === "rdp";
    const connCmd = isRDP ? `${serverIp}:3389` : `ssh ${username}@${serverIp}`;
    const durationText = provisioning?.started_at && provisioning?.completed_at
      ? formatTime(
          Math.floor(
            (new Date(provisioning.completed_at).getTime() -
              new Date(provisioning.started_at).getTime()) /
              1000,
          ),
        )
      : null;

    return (
      <article
        className="relative overflow-hidden rounded-[10px] border border-white/[0.10] bg-[#111316] p-8 sm:p-10"
        style={{
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 32px -14px rgba(0,0,0,0.7)",
        }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300">
            <Check className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div className="flex-1">
            <p
              className={`${MONO} mb-2 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-emerald-300/85`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Server ready
            </p>
            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-white sm:text-[26px]">
              {serverName} is running.
            </h2>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-white/60">
              {durationText ? `Provisioned in ${durationText}.` : "Provisioned successfully."}{" "}
              Connection details below.
            </p>
          </div>
        </div>

        {/* Connection details */}
        <div className="mt-7 overflow-hidden rounded-[8px] border border-white/[0.08]">
          <div
            className={`${MONO} flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55`}
          >
            <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
            Connection details
          </div>
          <div className="divide-y divide-white/[0.05]">
            <DetailRow
              label="IP address"
              value={serverIp}
              copyValue={serverIp}
              copyLabel="IP"
              onCopy={copyToClipboard}
            />
            <DetailRow label="Username" value={username} />
            <DetailRow
              label={isRDP ? "RDP address" : "SSH command"}
              value={connCmd}
              copyValue={connCmd}
              copyLabel={isRDP ? "RDP address" : "SSH command"}
              onCopy={copyToClipboard}
              highlight
            />
            <DetailRow label="OS" value={serverOs} />
          </div>
        </div>

        <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onCreateAnother}
            className={`${MONO} inline-flex h-10 items-center justify-center gap-1.5 rounded-[5px] border border-white/[0.14] bg-transparent px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white`}
          >
            Create another
          </button>
          <Link
            href="/dashboard/services/compute/vps"
            className={`${MONO} inline-flex h-10 items-center justify-center gap-1.5 rounded-[5px] border border-white bg-white px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-white/90`}
          >
            Go to dashboard
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </article>
    );
  }

  // ─── Provisioning State ───────────────────────────────────────
  return (
    <article
      className="relative overflow-hidden rounded-[10px] border border-white/[0.10] bg-[#111316] p-8 sm:p-10"
      style={{
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 32px -14px rgba(0,0,0,0.7)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <p
            className={`${MONO} mb-3 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/55`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
            Deploying
          </p>
          <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-white sm:text-[26px]">
            {serverName}
          </h2>
          <p className="mt-2 text-[13.5px] leading-[1.6] text-white/60">
            {provisioning?.message || "Provisioning your server…"}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div
            className={`${MONO} text-[28px] font-bold leading-none tabular-nums text-white sm:text-[34px]`}
          >
            {progress}%
          </div>
          <div
            className={`${MONO} mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40`}
          >
            {formatTime(elapsedSeconds)} elapsed
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-6 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${progress}%`,
            background: ACCENT,
            boxShadow: `0 0 12px ${ACCENT}80`,
          }}
        />
      </div>

      {/* Stages */}
      <ol className="mt-7 flex flex-col">
        {STAGES.map((stage, i) => {
          const isDone = currentStageIdx > i;
          const isCurrent = currentStageIdx === i;
          const isPending = !isDone && !isCurrent;

          return (
            <li
              key={stage.id}
              className="relative flex items-center gap-4 border-t border-white/[0.05] py-3 first:border-t-0"
            >
              {/* Status indicator */}
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] border ${
                  isDone
                    ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300"
                    : isCurrent
                      ? "border-[#0095FF]/40 bg-[#0095FF]/[0.10] text-[#0095FF]"
                      : "border-white/[0.08] bg-white/[0.02] text-white/25"
                }`}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
                ) : (
                  <span
                    className={`${MONO} text-[10px] font-semibold tabular-nums`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-[13.5px] font-medium leading-tight ${
                    isCurrent
                      ? "text-white"
                      : isDone
                        ? "text-white/70"
                        : "text-white/35"
                  }`}
                >
                  {stage.label}
                </span>
              </div>

              {/* Status label */}
              {isDone && (
                <span
                  className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300/75`}
                >
                  Done
                </span>
              )}
              {isCurrent && (
                <span
                  className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0095FF]`}
                >
                  In progress
                </span>
              )}
              {isPending && (
                <span
                  className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25`}
                >
                  Pending
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Footer info */}
      <div
        className={`${MONO} mt-7 flex items-center justify-between border-t border-white/[0.06] pt-4 text-[10.5px] uppercase tracking-[0.14em] text-white/40`}
      >
        <span>Server · {serverName}</span>
        <span>{serverOs} · {serverIp}</span>
      </div>

      {elapsedSeconds > 300 && (
        <div
          className={`${MONO} mt-5 flex items-center gap-2 rounded-[6px] border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3 text-[11.5px] uppercase tracking-[0.12em] text-amber-300/85`}
        >
          <span className="h-1 w-1 rounded-full bg-amber-300" />
          Deployment is taking longer than expected — we&apos;ll notify you when ready.
        </div>
      )}
    </article>
  );
}

// ─── Detail row helper ──────────────────────────────────────────

function DetailRow({
  label,
  value,
  copyValue,
  copyLabel,
  onCopy,
  highlight,
}: {
  label: string;
  value: string;
  copyValue?: string;
  copyLabel?: string;
  onCopy?: (text: string, label: string) => void;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-[12.5px] text-white/55">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`${MONO} text-[12.5px] tabular-nums ${
            highlight
              ? "rounded-[3px] border border-[#0095FF]/25 bg-[#0095FF]/[0.08] px-2 py-0.5 text-[#9fcbff]"
              : "text-white"
          }`}
        >
          {value}
        </span>
        {copyValue && onCopy && (
          <button
            type="button"
            onClick={() => onCopy(copyValue, copyLabel || label)}
            className="text-white/35 transition-colors hover:text-white"
            aria-label={`Copy ${copyLabel || label}`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
