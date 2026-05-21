'use client';

// VPS detail page — editorial dark surface matching the GPU deploy /
// apps wizard / VPS create design language. Aurora-glow canvas, Nunito
// accent header, horizontal pill tab nav, sharp-edged tab panels.

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Tabs, TabsContent } from '@/components/ui/tabs';
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

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

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
      let json: Record<string, unknown>;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      if (!text || !res.ok || !json.ok) {
        console.error('[fetchServer] HTTP', res.status, text?.slice(0, 200));
        throw new Error('Unable to load server details. Please refresh the page.');
      }
      setServer(json.server as ServerData);
    } catch (err) {
      console.error(err);
      toast.error('Unable to load server details. Please refresh the page.');
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error('failed');
      toast.success(`Server ${action} successful`);
      await fetchServer();
    } catch {
      toast.error(`Could not ${action} server. Please try again.`);
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error('failed');
      toast.success('Server renamed');
      setShowRenameInput(false);
      await fetchServer();
    } catch {
      toast.error('Could not rename server. Please try again.');
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error('failed');
      toast.success('Server destroyed');
      router.push('/dashboard/services/compute/vps');
    } catch {
      toast.error('Could not destroy server. Please try again.');
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('failed');
      setConsoleWsPath(data.console.wsPath);
      setConsoleVncPassword(data.console.ticket);
      setConsoleState('ready');
    } catch {
      setConsoleError('Could not open console. Make sure the server is running.');
      setConsoleState('error');
    }
  };

  /* ─── loading / not found ───────────────────────────── */

  if (loading) {
    return (
      <PageShell>
        <div className="mb-6 flex items-center gap-3">
          <Link href="/dashboard/services/compute/vps" className="text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-5 w-32 bg-white/[0.06] animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 border border-white/[0.06] bg-[#111216] animate-pulse" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (!server) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-24">
          <Server className="mb-4 h-12 w-12 text-white/20" />
          <h2 className="text-[16px] font-semibold text-white">Server not found</h2>
          <p className="mt-2 text-[13px] text-white/45">This server may have been deleted.</p>
          <Link
            href="/dashboard/services/compute/vps"
            className={`${MONO} mt-6 inline-flex h-9 items-center gap-2 px-4 border border-white/[0.1] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/75 hover:text-white hover:bg-white/[0.04] transition-colors`}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to VPS
          </Link>
        </div>
      </PageShell>
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

  /* ─── render ────────────────────────────────────────── */

  return (
    <PageShell>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-6">
        {/* Horizontal pill-tab nav (replaces sidebar tab list) */}
        <div className="border-b border-white/[0.06] mb-5">
          <div className="flex items-center gap-1 -mb-px overflow-x-auto no-scrollbar">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={`${MONO} relative px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] transition-colors whitespace-nowrap`}
                  style={{
                    color: isActive ? '#ffffff' : 'rgba(255,255,255,0.45)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.75)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.45)';
                  }}
                >
                  {tab.label}
                  {isActive && (
                    <span
                      className="absolute left-2 right-2 bottom-0 h-[2px]"
                      style={{ background: ACCENT, boxShadow: `0 0 8px rgba(0,149,255,0.5)` }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
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
      </Tabs>
    </PageShell>
  );
}

// ─── Page shell with aurora + dotted grid (matches other pages) ─

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)' }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>
      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">{children}</div>
    </div>
  );
}
