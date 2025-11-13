'use client';

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Server, Plus, Power, RotateCw, Play, Copy } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface ServerData {
  id: number;
  name: string;
  vmid: number;
  node: string;
  ip: string;
  os: string;
  location: string;
  cpu_cores: number;
  memory_mb: number;
  disk_gb: number;
  status: string;
  hourly_cost: number;
  created_at: string;
}

export default function VPSPage() {
  const [servers, setServers] = useState<ServerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const supabase = createClient();

  console.log('[VPS Page] Component mounted');

  const loadServers = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      console.log('[VPS Page] Current user:', userData.user?.id, userData.user?.email);

      if (!userData.user) {
        setServers([]);
        return;
      }

      const { data, error } = await supabase
        .from("servers")
        .select("*")
        .eq("owner_id", userData.user.id)
        .order("created_at", { ascending: false });

      console.log('[VPS Page] Servers query result:', { data, error, userId: userData.user.id });

      if (error) {
        console.error('[VPS Page] Query error:', error);
        throw error;
      }

      setServers((data as any) || []);
      console.log('[VPS Page] Loaded servers:', data?.length || 0);
    } catch (err) {
      console.error("Failed to load servers:", err);
      toast.error("Failed to load servers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[VPS Page] useEffect running, calling loadServers');
    try {
      loadServers().catch(err => {
        console.error('[VPS Page] loadServers error in useEffect:', err);
      });
    } catch (err) {
      console.error('[VPS Page] useEffect error:', err);
    }
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
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} server`);
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
              const isActing = actingId === server.id;

              return (
                <Card key={server.id} className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="text-xl font-semibold text-white">{server.name}</h3>
                          <span className={`text-xs px-2 py-1 rounded ${
                            server.status === 'running' ? 'bg-green-500/20 text-green-400' :
                            server.status === 'stopped' ? 'bg-gray-500/20 text-gray-400' :
                            server.status === 'provisioning' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {server.status || 'unknown'}
                          </span>
                        </div>

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
                            <div className="text-slate-500 text-sm">SSH Command</div>
                            <button
                              onClick={() => copyToClipboard(`ssh ubuntu@${server.ip}`, 'SSH command')}
                              className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                            >
                              <Copy className="h-3.5 w-3.5" /> Copy
                            </button>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {stopped ? (
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
