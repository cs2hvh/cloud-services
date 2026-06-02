'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Trash2, RefreshCw, } from 'lucide-react';
import { useConfirm } from "@/components/ui/confirm";
// import { Agent as UndiciAgent } from 'undici';

interface Server {
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
  owner_email: string | null;
  created_at: string;
}

// type HostConfig = {
//   id: string;
//   host_url: string;
//   allow_insecure_tls: boolean;
//   token_id: string | null;
//   token_secret: string | null;
//   username: string | null;
//   password: string | null;
// };

// function withTimeout<T>(p: Promise<T>, ms = 60000): Promise<T> {
//   return new Promise((resolve, reject) => {
//     const id = setTimeout(() => reject(new Error("Request timed out")), ms);
//     p.then((v) => { clearTimeout(id); resolve(v); })
//      .catch((e) => { clearTimeout(id); reject(e); });
//   });
// }

export function ServersManager() {
  const confirm = useConfirm();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/servers', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load servers');
      }
      setServers(data.servers || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load servers';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleDelete = useCallback(async (server: Server) => {
    if (!(await confirm({ title: `Delete server "${server.name}"?`, description: `This deletes the VM from Proxmox (VMID ${server.vmid}) and removes the database record. This action cannot be undone.`, confirmText: "Delete server", danger: true }))) {
      return;
    }

    setActingId(server.id);
    try {
      const res = await fetch(`/api/admin/servers?id=${server.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Delete failed');
      }

      toast.success(`Server "${server.name}" deleted successfully`);
      await loadServers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      toast.error(msg);
    } finally {
      setActingId(null);
    }
  }, [loadServers]);

  return (
    <Card className="bg-black/50 border-white/10">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-white">All Servers</CardTitle>
          <CardDescription className="text-white/60">Manage all VPS instances across all users</CardDescription>
        </div>
        <Button
          onClick={loadServers}
          disabled={loading}
          className="bg-white/10 text-white border border-white/10 hover:bg-white/15"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-white/60 text-center py-8">Loading servers...</div>
        ) : servers.length === 0 ? (
          <div className="text-white/60 text-center py-8">No servers found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-white/60 border-b border-white/10">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">IP</th>
                  <th className="py-3 pr-4">VMID</th>
                  <th className="py-3 pr-4">Node</th>
                  <th className="py-3 pr-4">Specs</th>
                  <th className="py-3 pr-4">OS</th>
                  <th className="py-3 pr-4">Access</th>
                  <th className="py-3 pr-4">Owner</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => (
                  <tr key={server.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 pr-4 text-white">{server.name}</td>
                    <td className="py-3 pr-4 text-white/80">{server.ip}</td>
                    <td className="py-3 pr-4 text-white/80">{server.vmid}</td>
                    <td className="py-3 pr-4 text-white/80">{server.node}</td>
                    <td className="py-3 pr-4 text-white/80">
                      {server.cpu_cores}c • {Math.round(server.memory_mb / 1024)}GB • {server.disk_gb}GB
                    </td>
                    <td className="py-3 pr-4 text-white/80">{server.os}</td>
                    <td className="py-3 pr-4 text-white/80 text-xs">
                      {(server.os || '').toLowerCase().includes('windows')
                        ? <span className="text-blue-400">RDP :3389</span>
                        : <span className="text-green-400">SSH :22</span>
                      }
                    </td>
                    <td className="py-3 pr-4 text-white/80 text-xs">{server.owner_email || 'N/A'}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-1 rounded ${
                        server.status === 'running' ? 'bg-green-500/20 text-green-400' :
                        server.status === 'stopped' ? 'bg-gray-500/20 text-gray-400' :
                        server.status === 'provisioning' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {server.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <Button
                        onClick={() => handleDelete(server)}
                        disabled={actingId === server.id}
                        size="sm"
                        variant="destructive"
                        className="bg-red-600/20 text-red-400 border border-red-400/30 hover:bg-red-600/30"
                      >
                        {actingId === server.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
