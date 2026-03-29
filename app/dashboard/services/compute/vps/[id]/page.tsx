'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useVMMetrics } from '@/hooks/use-vm-metrics';
import { ArrowLeft, Server } from 'lucide-react';

import { type ServerData, TABS, getAccessInfo } from './_components/types';
import { useUptime } from './hooks/use-uptime';
import { VpsHeader } from './_components/vps-header';
import { VpsStatsRow } from './_components/vps-stats-row';
import { VpsOverviewTab } from './_components/vps-overview-tab';
import { VpsMonitoringTab } from './_components/vps-monitoring-tab';
import { VpsConsoleTab } from './_components/vps-console-tab';
import { VpsNetworkingTab } from './_components/vps-networking-tab';
import { VpsSettingsTab } from './_components/vps-settings-tab';

export default function VMDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serverId = Number(params.id);

  const [server, setServer] = useState<ServerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [actingPower, setActingPower] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [editName, setEditName] = useState('');
  const [showRenameInput, setShowRenameInput] = useState(false);
  const [consoleState, setConsoleState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [consoleWsPath, setConsoleWsPath] = useState<string | null>(null);
  const [consoleVncPassword, setConsoleVncPassword] = useState<string | null>(null);
  const [consoleError, setConsoleError] = useState<string | null>(null);

  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const uptime = useUptime(
    server?.billing_start || server?.created_at || null,
    server?.status === 'running'
  );

  const vmMetrics = useVMMetrics({
    serverId,
    enabled: !!server && server.status === 'running',
    refreshInterval: 15_000,
  });

  /* ─── data fetching ─────────────────────────────────── */

  const fetchServer = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const res = await fetch(`/api/services/compute/vms/${serverId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const text = await res.text();
      if (!text) throw new Error('Empty response from server');
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Invalid response from server');
      }
      if (!res.ok || !json.ok) throw new Error((json.error as string) || 'Failed to load');
      setServer(json.server as ServerData);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to load server');
    } finally {
      setLoading(false);
    }
  }, [serverId, supabase]);

  useEffect(() => {
    fetchServer();

    const channel = supabase
      .channel(`vm-detail-${serverId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'servers', filter: `id=eq.${serverId}` },
        (payload) => {
          const rec = payload.new as ServerData;
          setServer((prev) => (prev ? { ...prev, ...rec } : prev));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'servers', filter: `id=eq.${serverId}` },
        () => {
          toast.success('Server has been destroyed');
          router.push('/dashboard/services/compute/vps');
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  /* ─── actions ───────────────────────────────────────── */

  async function getAuthHeaders() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  const powerAction = async (action: 'start' | 'stop' | 'reboot') => {
    setActingPower(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/services/compute/vms/power', {
        method: 'POST',
        headers,
        body: JSON.stringify({ serverId, action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Action failed');
      toast.success(`Server ${action} successful`);
      await fetchServer();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} server`);
    } finally {
      setActingPower(false);
    }
  };

  const renameServer = async () => {
    if (!editName.trim()) return;
    setRenaming(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/services/compute/vms/${serverId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: editName.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Rename failed');
      toast.success('Server renamed');
      setShowRenameInput(false);
      await fetchServer();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename');
    } finally {
      setRenaming(false);
    }
  };

  const destroyServer = async () => {
    if (confirmName !== server?.name) {
      toast.error('Name does not match');
      return;
    }
    setDestroying(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/services/compute/vms/${serverId}`, {
        method: 'DELETE',
        headers,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Destroy failed');
      toast.success('Server destroyed');
      router.push('/dashboard/services/compute/vps');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to destroy server');
      setDestroying(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const handleLaunchConsole = async () => {
    if (!server) return;
    setConsoleState('loading');
    setConsoleError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/services/compute/vms/${server.id}/console`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start console');
      setConsoleWsPath(data.console.wsPath);
      setConsoleVncPassword(data.console.ticket);
      setConsoleState('ready');
    } catch (err: unknown) {
      setConsoleError(err instanceof Error ? err.message : 'Failed to start console');
      setConsoleState('error');
    }
  };

  /* ─── loading / not found ───────────────────────────── */

  if (loading) {
    return (
      <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/dashboard/services/compute/vps" className="text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-5 w-32 bg-white/[0.06] animate-pulse" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-panel h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">
        <div className="flex flex-col items-center justify-center py-24">
          <Server className="mb-4 h-12 w-12 text-white/20" />
          <h2 className="text-lg font-medium text-white">Server not found</h2>
          <p className="mt-2 text-sm text-white/45">This server may have been deleted.</p>
          <Button asChild className="mt-6 border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]">
            <Link href="/dashboard/services/compute/vps">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to VPS
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  /* ─── derived state ─────────────────────────────────── */

  const isRunning = server.status === 'running';
  const isProvisioning = server.status === 'provisioning';
  const isFailed = server.status === 'failed' || server.status === 'error';
  const monthlyCost = (server.hourly_cost || 0) * 730;
  const dailyCost = (server.hourly_cost || 0) * 24;
  const { isRDP, user: sshUser } = getAccessInfo(server.os);
  const accessCmd = isRDP ? `${server.ip}:3389` : `ssh ${sshUser}@${server.ip}`;
  const memGB = Math.round(server.memory_mb / 1024);

  const activeSection = TABS.find((t) => t.value === activeTab) || TABS[0];

  /* ─── render ────────────────────────────────────────── */

  return (
    <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">
      <VpsHeader
        server={server}
        uptime={uptime}
        actingPower={actingPower}
        memGB={memGB}
        monthlyCost={monthlyCost}
        accessCmd={accessCmd}
        onPowerAction={powerAction}
      />

      <VpsStatsRow
        server={server}
        isRunning={isRunning}
        vmMetrics={vmMetrics.metrics}
        memGB={memGB}
        monthlyCost={monthlyCost}
      />

      {/* Tab layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start">
          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08, duration: 0.24 }}
            className="space-y-4 xl:sticky xl:top-8"
          >
            <div className="glass-panel overflow-hidden p-2">
              <div className="px-3 pb-2 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/28">
                  Sections
                </p>
              </div>
              <div className="space-y-1">
                  {TABS.map((tab) => {
                    const isActive = activeTab === tab.value;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setActiveTab(tab.value)}
                        className={`relative w-full px-3 py-3 text-left transition-all duration-150 ${
                          isActive
                            ? 'border border-cyan-500/15 bg-cyan-500/[0.08]'
                            : 'border border-transparent hover:bg-white/[0.02]'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-active"
                            className="absolute left-0 top-2 bottom-2 w-[2px] bg-cyan-400"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}
                        <div className="min-w-0">
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors ${isActive ? 'text-cyan-200' : 'text-white/24'}`}>
                            {tab.eyebrow}
                          </p>
                          <p className={`mt-1 text-[13px] font-medium transition-colors ${isActive ? 'text-white' : 'text-white/54'}`}>
                            {tab.label}
                          </p>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.24 }}
          >
            <div className="glass-panel overflow-hidden">
              <div className="px-6 py-5 sm:px-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/28">
                  {activeSection.eyebrow}
                </p>
                <h2 className="mt-2 text-base font-semibold text-white">
                  {activeSection.label}
                </h2>
              </div>

              <div className="border-t border-white/[0.06] px-6 py-6 sm:px-7">
                <TabsContent value="overview" className="mt-0">
                  <VpsOverviewTab
                    server={server}
                    isRunning={isRunning}
                    isProvisioning={isProvisioning}
                    isFailed={isFailed}
                    isRDP={isRDP}
                    accessCmd={accessCmd}
                    memGB={memGB}
                    monthlyCost={monthlyCost}
                    dailyCost={dailyCost}
                    copyToClipboard={copyToClipboard}
                  />
                </TabsContent>

                <TabsContent value="monitoring" className="mt-0">
                  <VpsMonitoringTab
                    server={server}
                    isRunning={isRunning}
                    metrics={vmMetrics.metrics}
                    history={vmMetrics.history}
                    loading={vmMetrics.loading}
                    error={vmMetrics.error}
                    onRefetch={vmMetrics.refetch}
                  />
                </TabsContent>

                <TabsContent value="console" className="mt-0">
                  <VpsConsoleTab
                    server={server}
                    isRunning={isRunning}
                    consoleState={consoleState}
                    consoleWsPath={consoleWsPath}
                    consoleVncPassword={consoleVncPassword}
                    consoleError={consoleError}
                    onLaunchConsole={handleLaunchConsole}
                  />
                </TabsContent>

                <TabsContent value="networking" className="mt-0">
                  <VpsNetworkingTab
                    server={server}
                    isRunning={isRunning}
                    isRDP={isRDP}
                    copyToClipboard={copyToClipboard}
                    metrics={vmMetrics.metrics}
                    history={vmMetrics.history}
                  />
                </TabsContent>

                <TabsContent value="settings" className="mt-0">
                  <VpsSettingsTab
                    server={server}
                    editName={editName}
                    setEditName={setEditName}
                    showRenameInput={showRenameInput}
                    setShowRenameInput={setShowRenameInput}
                    renaming={renaming}
                    onRename={renameServer}
                    confirmName={confirmName}
                    setConfirmName={setConfirmName}
                    destroying={destroying}
                    onDestroy={destroyServer}
                  />
                </TabsContent>
              </div>
            </div>
          </motion.div>
        </div>
      </Tabs>
    </div>
  );
}
