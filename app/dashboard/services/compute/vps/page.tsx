'use client';

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Server, Plus, Power, RotateCw, Play, Copy, Loader2, XCircle, AlertTriangle } from "lucide-react";
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Virtual Private Servers</h1>
          <p className="text-slate-400 mt-2">
            Manage your VPS instances
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadServers} variant="outline" disabled={loading}>
            <RotateCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/dashboard/services/compute/vps/new">
              <Plus className="h-4 w-4 mr-2" />
              Create New VPS
            </Link>
          </Button>
        </div>
      </div>

      {/* VPS Instances */}
      <div className="space-y-4">
        {loading ? (
          <Card className="bg-slate-900/30 border-slate-800">
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-slate-400">Loading servers...</div>
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
                <Card key={server.id} className={`border ${
                  isProvisioning ? 'bg-slate-900/50 border-blue-500/20' :
                  isFailed ? 'bg-slate-900/50 border-red-500/20' :
                  'bg-slate-900/50 border-slate-800'
                }`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="text-xl font-semibold text-white">{server.name}</h3>
                          <span className={`text-xs px-2 py-1 rounded flex items-center gap-1.5 ${
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
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div>
                            <div className="text-slate-500 text-sm">IP Address</div>
                            <div className="text-white flex items-center gap-2">
                              {server.ip}
                              <button
                                onClick={() => copyToClipboard(server.ip, 'IP')}
                                className="text-slate-400 hover:text-white"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500 text-sm">Configuration</div>
                            <div className="text-white">
                              {server.cpu_cores} vCPU • {Math.round(server.memory_mb / 1024)} GB RAM
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500 text-sm">OS</div>
                            <div className="text-white">{server.os}</div>
                          </div>
                          <div>
                            <div className="text-slate-500 text-sm">
                              {(() => {
                                const osL = (server.os || "").toLowerCase();
                                return (osL.includes("windows") || osL.includes("desktop")) ? "RDP Connection" : "SSH Command";
                              })()}
                            </div>
                            {(() => {
                              const osL = (server.os || "").toLowerCase();
                              const isRDP = osL.includes("windows") || osL.includes("desktop");
                              const user = osL.includes("windows") ? "admin" : osL.includes("debian") ? "debian" : "ubuntu";
                              return (
                                <button
                                  onClick={() => copyToClipboard(
                                    isRDP ? `${server.ip}:3389 (user: ${user})` : `ssh ${user}@${server.ip}`,
                                    isRDP ? 'RDP address' : 'SSH command'
                                  )}
                                  className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                                >
                                  <Copy className="h-3.5 w-3.5" /> Copy
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                        )}

                        {/* Provisioning info bar */}
                        {isProvisioning && (
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                              <div className="text-slate-500 text-sm">IP Address</div>
                              <div className="text-white">{server.ip}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 text-sm">Configuration</div>
                              <div className="text-white">
                                {server.cpu_cores} vCPU • {Math.round(server.memory_mb / 1024)} GB RAM
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500 text-sm">OS</div>
                              <div className="text-white">{server.os}</div>
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
          <Card className="bg-slate-900/30 border-slate-800 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Server className="h-12 w-12 text-slate-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No VPS Instances</h3>
              <p className="text-slate-400 text-center mb-4">
                Create your first VPS instance to get started with scalable virtual servers.
              </p>
              <Button asChild>
                <Link href="/dashboard/services/compute/vps/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First VPS
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
