"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle, Copy, Loader2, XCircle,
  Database, HardDrive, Settings, Globe, Power, ShieldCheck, ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

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

// ─── Stage Definitions ──────────────────────────────────────────

const STAGES = [
  { id: "allocating",  label: "Reserving Resources",      icon: Database },
  { id: "cloning",     label: "Creating Disk Image",      icon: HardDrive },
  { id: "configuring", label: "Configuring Hardware",      icon: Settings },
  { id: "networking",  label: "Setting Up Network",        icon: Globe },
  { id: "booting",     label: "Starting Server",           icon: Power },
  { id: "verifying",   label: "Verifying Connectivity",    icon: ShieldCheck },
] as const;

type StageId = typeof STAGES[number]["id"];

function stageIndex(stageId: string): number {
  const idx = STAGES.findIndex(s => s.id === stageId);
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

  // Subscribe to realtime + poll as fallback
  useEffect(() => {
    const supabase = createClient();

    // Initial fetch
    const fetchServer = async () => {
      const { data } = await supabase
        .from("servers")
        .select("id, name, ip, os, status, cpu_cores, memory_mb, disk_gb, details")
        .eq("id", serverId)
        .single();
      if (data) setServer(data as ServerRecord);
    };
    fetchServer();

    // Realtime subscription
    const channel = supabase
      .channel(`deployment-${serverId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "servers", filter: `id=eq.${serverId}` },
        (payload) => {
          const newRecord = payload.new as ServerRecord;
          if (newRecord) setServer(newRecord);
        }
      )
      .subscribe();
    channelRef.current = channel;

    // Polling fallback (every 3s) in case realtime isn't enabled
    pollRef.current = setInterval(fetchServer, 3000);

    // Elapsed timer
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

  // Stop polling once terminal state reached
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
      <Card className="bg-slate-950 border-red-500/30">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-3">
            <XCircle className="h-7 w-7 text-red-400" />
          </div>
          <CardTitle className="text-white text-xl">Deployment Failed</CardTitle>
          <CardDescription className="text-red-400/80">
            {provisioning?.message || "An error occurred during deployment."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 text-sm">
            <div className="text-slate-400">
              Server: <span className="text-white">{serverName}</span>
            </div>
            <div className="text-slate-400 mt-1">
              Our team has been notified and is investigating the issue.
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={onCreateAnother} className="bg-white/10 hover:bg-white/20 text-white border border-white/10">
              Try Again
            </Button>
            <Button variant="outline" className="border-slate-700 text-slate-300" asChild>
              <a href="mailto:support@ahurasense.com">Contact Support</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Complete State ───────────────────────────────────────────
  if (isComplete) {
    const isRDP = connectionType === "rdp";
    const connCmd = isRDP ? `${serverIp}:3389` : `ssh ${username}@${serverIp}`;
    const durationText = provisioning?.started_at && provisioning?.completed_at
      ? formatTime(Math.floor((new Date(provisioning.completed_at).getTime() - new Date(provisioning.started_at).getTime()) / 1000))
      : null;

    return (
      <Card className="bg-slate-950 border-emerald-500/30">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-3">
            <CheckCircle className="h-7 w-7 text-emerald-400" />
          </div>
          <CardTitle className="text-white text-xl">Server Ready</CardTitle>
          <CardDescription className="text-emerald-400/80">
            {serverName} is now running{durationText ? ` — deployed in ${durationText}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Connection Details */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800 text-xs font-medium text-slate-400 uppercase tracking-wider">
              Connection Details
            </div>
            <div className="divide-y divide-slate-800/50">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-slate-400 text-sm">IP Address</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-sm">{serverIp}</span>
                  <button onClick={() => copyToClipboard(serverIp, "IP")} className="text-slate-500 hover:text-white transition">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-slate-400 text-sm">Username</span>
                <span className="text-white font-mono text-sm">{username}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-slate-400 text-sm">{isRDP ? "RDP Address" : "SSH Command"}</span>
                <div className="flex items-center gap-2">
                  <code className="text-blue-400 text-sm bg-blue-500/5 px-2 py-0.5 rounded">{connCmd}</code>
                  <button onClick={() => copyToClipboard(connCmd, isRDP ? "RDP address" : "SSH command")} className="text-slate-500 hover:text-white transition">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-slate-400 text-sm">OS</span>
                <span className="text-white text-sm">{serverOs}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Link href="/dashboard/services/compute/vps">
                Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button onClick={onCreateAnother} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Create Another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Provisioning State ───────────────────────────────────────
  return (
    <Card className="bg-slate-950 border-blue-500/20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white text-lg">Deploying {serverName}</CardTitle>
            <CardDescription className="text-slate-400">
              {provisioning?.message || "Provisioning your server..."}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-400">{progress}%</div>
            <div className="text-xs text-slate-500">{formatTime(elapsedSeconds)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Bar */}
        <div className="relative">
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stages */}
        <div className="space-y-1">
          {STAGES.map((stage, i) => {
            const isDone = currentStageIdx > i;
            const isCurrent = currentStageIdx === i;
            const Icon = stage.icon;

            return (
              <div key={stage.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isCurrent ? "bg-blue-500/5 border border-blue-500/20" :
                isDone ? "opacity-60" : "opacity-30"
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  isDone ? "bg-emerald-500/20 text-emerald-400" :
                  isCurrent ? "bg-blue-500/20 text-blue-400" :
                  "bg-slate-800 text-slate-600"
                }`}>
                  {isDone ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${
                    isDone ? "text-emerald-400/80" :
                    isCurrent ? "text-white" :
                    "text-slate-600"
                  }`}>
                    {stage.label}
                  </div>
                </div>
                {isDone && (
                  <span className="text-xs text-emerald-400/60">Done</span>
                )}
                {isCurrent && (
                  <span className="text-xs text-blue-400 animate-pulse">In progress</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Info Bar */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800/50">
          <span>Server: {serverName}</span>
          <span>{serverOs} • {serverIp}</span>
        </div>

        {elapsedSeconds > 300 && (
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-3 text-sm text-yellow-400/80">
            Deployment is taking longer than expected. Please wait — we&apos;ll notify you when it&apos;s ready.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
