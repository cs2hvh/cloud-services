'use client';

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  Copy,
  Cpu,
  HardDrive,
  Loader2,
  Play,
  Plus,
  Power,
  RotateCw,
  Server,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface ProvisioningInfo {
  stage: string;
  progress: number;
  message: string;
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
}

interface ServerData {
  id: number;
  name: string;
  ip: string;
  os: string;
  cpu_cores: number;
  memory_mb: number;
  disk_gb: number;
  status: string;
  hourly_cost: number;
  created_at: string;
  details?: { provisioning?: ProvisioningInfo } | null;
}

export default function VPSPage() {
  const [servers, setServers] = useState<ServerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userIdRef = useRef<string | null>(null);

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        setServers([]);
        return;
      }
      userIdRef.current = userData.user.id;

      const { data, error } = await supabase
        .from("servers")
        .select("id, name, ip, os, cpu_cores, memory_mb, disk_gb, status, hourly_cost, created_at, details")
        .eq("owner_id", userData.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setServers(data || []);
    } catch (err) {
      console.error("Failed to load servers:", err);
      toast.error("Failed to load servers");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Initial load + realtime subscription
  useEffect(() => {
    loadServers().catch(() => {});

    // Subscribe to all server changes — realtime will deliver updates as provisioning progresses
    const channel = supabase
      .channel("servers-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "servers" },
        (payload) => {
          const newRecord = payload.new as ServerData | undefined;
          const oldRecord = payload.old as { id?: number } | undefined;

          // Only process records owned by current user
          setServers((prev) => {
            if (payload.eventType === "INSERT" && newRecord) {
              // Prevent duplicates
              if (prev.some(s => s.id === newRecord.id)) {
                return prev.map(s => s.id === newRecord.id ? newRecord : s);
              }
              return [newRecord, ...prev];
            }
            if (payload.eventType === "UPDATE" && newRecord) {
              const exists = prev.some(s => s.id === newRecord.id);
              if (exists) {
                return prev.map(s => s.id === newRecord.id ? newRecord : s);
              }
              return prev;
            }
            if (payload.eventType === "DELETE" && oldRecord?.id) {
              return prev.filter(s => s.id !== oldRecord.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const powerAction = async (serverId: number, action: "start" | "stop" | "reboot") => {
    setActingId(serverId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch("/api/services/compute/vms/power", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ serverId, action }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Action failed");
      }

      toast.success(`Server ${action} successful`);
      await loadServers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} server`);
    } finally {
      setActingId(null);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const runningCount = servers.filter((server) => server.status === "running").length;
  const provisioningCount = servers.filter((server) => server.status === "provisioning").length;
  const failedCount = servers.filter((server) => ["failed", "error"].includes(server.status)).length;
  const estimatedMonthlySpend = servers.reduce(
    (total, server) => total + ((server.hourly_cost || 0) * 730),
    0,
  );

  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/70">
            Compute Services
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Operate virtual machines with clearer runtime visibility.
            </h1>
            <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
              Live updates
            </Badge>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
            Review fleet health, monitor provisioning in real time, and control VPS lifecycle actions
            from one cleaner operational view.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={loadServers}
            variant="outline"
            disabled={loading}
            className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
          >
            <RotateCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh inventory
          </Button>
          <Button asChild className="border border-cyan-400/25 bg-cyan-500/90 text-slate-950 hover:bg-cyan-400">
            <Link href="/dashboard/services/compute/vps/new">
              <Plus className="mr-2 h-4 w-4" />
              Create VPS
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Fleet Size</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{servers.length}</p>
              <p className="mt-1 text-sm text-white/45">Provisioned VPS instances</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.06] text-cyan-300">
              <Server className="h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Healthy</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{runningCount}</p>
              <p className="mt-1 text-sm text-white/45">Servers currently serving traffic</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.06] text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Provisioning</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{provisioningCount}</p>
              <p className="mt-1 text-sm text-white/45">Builds and boots in progress</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.06] text-blue-300">
              <Activity className="h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Est. Monthly</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-white">${estimatedMonthlySpend.toFixed(2)}</p>
              <p className="mt-1 text-sm text-white/45">Based on current hourly pricing</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.06] text-white/70">
              <Zap className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel mb-6 overflow-hidden">
        <div className="grid gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Operational View</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Runtime control, provisioning feedback, and access details in one place.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
              This surface is optimized for day-two management: check fleet posture, copy connection
              details, and intervene quickly when a machine is stopped or a deployment fails.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Failed Deployments</div>
              <div className="mt-2 text-sm font-medium text-white">{failedCount} issue{failedCount === 1 ? '' : 's'} need attention</div>
              <p className="mt-1 text-sm leading-5 text-white/45">Failed records stay visible with the provisioning message so retry decisions are faster.</p>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Access Model</div>
              <div className="mt-2 text-sm font-medium text-white">SSH or RDP details available inline</div>
              <p className="mt-1 text-sm leading-5 text-white/45">Use one-click copy for IPs and connection commands without opening a secondary detail page.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <Card className="glass-panel overflow-hidden border-white/10">
            <CardContent className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-white/55">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading virtual machines...
              </div>
            </CardContent>
          </Card>
        ) : servers.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {servers.map((server) => {
              const stopped = server.status?.toLowerCase() === 'stopped';
              const isProvisioning = server.status === 'provisioning';
              const isFailed = server.status === 'failed' || server.status === 'error';
              const isActing = actingId === server.id;
              const provisioning = server.details?.provisioning;
              const progress = provisioning?.progress || 10;

              return (
                <Card key={server.id} className={`glass-panel overflow-hidden border ${
                  isProvisioning ? 'border-blue-500/25' :
                  isFailed ? 'border-red-500/25' :
                  'border-white/10'
                }`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="text-xl font-semibold text-white">{server.name}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1.5 ${
                            server.status === 'running' ? 'bg-green-500/20 text-green-400' :
                            server.status === 'stopped' ? 'bg-gray-500/20 text-gray-400' :
                            server.status === 'provisioning' ? 'bg-blue-500/20 text-blue-400' :
                            server.status === 'suspended' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {isProvisioning && <Loader2 className="h-3 w-3 animate-spin" />}
                            {isFailed && <XCircle className="h-3 w-3" />}
                            {server.status || 'unknown'}
                          </span>
                        </div>

                        {/* Provisioning Progress Bar */}
                        {isProvisioning && (
                          <div className="mb-4 space-y-2">
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-blue-400">{provisioning?.message || 'Provisioning...'}</span>
                              <span className="text-slate-500">{progress}%</span>
                            </div>
                          </div>
                        )}

                        {/* Failed State Message */}
                        {isFailed && (
                          <div className="mb-4 bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3 flex items-start gap-3">
                            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                            <div>
                              <div className="text-sm text-red-400">
                                {provisioning?.message || 'Deployment failed'}
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                Contact support if the issue persists.
                              </div>
                            </div>
                          </div>
                        )

                        }

                        {/* Server Details — only show when not provisioning */}
                        {!isProvisioning && !isFailed && (
                        <div className="grid grid-cols-1 gap-3 mb-5 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">IP Address</div>
                            <div className="mt-2 text-white flex items-center gap-2">
                              {server.ip}
                              <button
                                onClick={() => copyToClipboard(server.ip, 'IP')}
                                className="text-white/45 hover:text-white"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Configuration</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-white">
                              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80">
                                <Cpu className="h-3.5 w-3.5 text-cyan-300" /> {server.cpu_cores} vCPU
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80">
                                <Zap className="h-3.5 w-3.5 text-blue-300" /> {Math.round(server.memory_mb / 1024)} GB RAM
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80">
                                <HardDrive className="h-3.5 w-3.5 text-white/70" /> {server.disk_gb} GB SSD
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Operating System</div>
                            <div className="mt-2 text-white">
                              {server.os}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                              {(() => {
                                const osL = (server.os || "").toLowerCase();
                                return (osL.includes("windows") || osL.includes("desktop")) ? "RDP Connection" : "SSH Command";
                              })()}
                            </div>
                            {(() => {
                              const osL = (server.os || "").toLowerCase();
                              const isRDP = osL.includes("windows") || osL.includes("desktop");
                              const user = osL.includes("windows") ? "admin" : osL.includes("debian") ? "debian" : osL.includes("centos") ? "centos" : "ubuntu";
                              return (
                                <button
                                  onClick={() => copyToClipboard(
                                    isRDP ? `${server.ip}:3389 (user: ${user})` : `ssh ${user}@${server.ip}`,
                                    isRDP ? 'RDP address' : 'SSH command'
                                  )}
                                  className="mt-2 inline-flex items-center gap-1 text-sm text-cyan-300 hover:text-cyan-200"
                                >
                                  <Copy className="h-3.5 w-3.5" /> Copy access details
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                        )}

                        {isProvisioning && (
                          <div className="grid grid-cols-1 gap-3 mb-5 md:grid-cols-3">
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Reserved IP</div>
                              <div className="mt-2 text-white">{server.ip}</div>
                            </div>
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Requested Size</div>
                              <div className="mt-2 text-white">
                              {server.cpu_cores} vCPU • {Math.round(server.memory_mb / 1024)} GB RAM
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Image</div>
                              <div className="mt-2 text-white">{server.os}</div>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2">
                          {isProvisioning ? (
                            <Button disabled size="sm" className="bg-blue-600/20 text-blue-400 cursor-not-allowed">
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Deploying...
                            </Button>
                          ) : isFailed ? (
                            <Button
                              asChild
                              size="sm"
                              className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
                            >
                              <Link href="/dashboard/services/compute/vps/new">
                                <Plus className="h-4 w-4 mr-2" />
                                Try Again
                              </Link>
                            </Button>
                          ) : stopped ? (
                            <Button
                              onClick={() => powerAction(server.id, 'start')}
                              disabled={isActing}
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Start
                            </Button>
                          ) : (
                            <>
                              <Button
                                onClick={() => powerAction(server.id, 'reboot')}
                                disabled={isActing}
                                size="sm"
                                variant="outline"
                                className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                              >
                                <RotateCw className="h-4 w-4 mr-2" />
                                Reboot
                              </Button>
                              <Button
                                onClick={() => powerAction(server.id, 'stop')}
                                disabled={isActing}
                                size="sm"
                                variant="outline"
                                className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                              >
                                <Power className="h-4 w-4 mr-2" />
                                Stop
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="glass-panel overflow-hidden border border-dashed border-white/10">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Server className="mb-4 h-12 w-12 text-white/30" />
              <h3 className="mb-2 text-lg font-medium text-white">No VPS inventory yet</h3>
              <p className="mb-4 max-w-md text-center text-white/45">
                Launch your first virtual machine to start building compute capacity with routed public IPs,
                realtime deployment status, and inline lifecycle controls.
              </p>
              <Button asChild className="border border-cyan-400/25 bg-cyan-500/90 text-slate-950 hover:bg-cyan-400">
                <Link href="/dashboard/services/compute/vps/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first VPS
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
