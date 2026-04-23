'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Copy,
  Loader2,
  Plus,
  RotateCw,
  // Server,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

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

function statusColor(status: string) {
  switch (status) {
    case 'running':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    case 'stopped':
      return 'bg-white/[0.06] text-white/50 border-white/10';
    case 'provisioning':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
    case 'suspended':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
    default:
      return 'bg-red-500/15 text-red-400 border-red-500/20';
  }
}

function statusAccent(status: string) {
  switch (status) {
    case 'running': return 'bg-emerald-500';
    case 'stopped': return 'bg-white/20';
    case 'provisioning': return 'bg-blue-500';
    case 'suspended': return 'bg-amber-500';
    default: return 'bg-red-500';
  }
}

export default function VPSPage() {
  const [servers, setServers] = useState<ServerData[]>([]);
  const [loading, setLoading] = useState(true);
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
        .from('servers')
        .select('id, name, ip, os, cpu_cores, memory_mb, disk_gb, status, hourly_cost, created_at, details')
        .eq('owner_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServers(data || []);
    } catch (err) {
      console.error('[loadServers]', err);
      toast.error('Unable to load your servers. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadServers().catch(() => {});

    const channel = supabase
      .channel('servers-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'servers' },
        (payload) => {
          const newRecord = payload.new as ServerData | undefined;
          const oldRecord = payload.old as { id?: number } | undefined;

          setServers((prev) => {
            if (payload.eventType === 'INSERT' && newRecord) {
              if (prev.some((s) => s.id === newRecord.id)) {
                return prev.map((s) => (s.id === newRecord.id ? newRecord : s));
              }
              return [newRecord, ...prev];
            }
            if (payload.eventType === 'UPDATE' && newRecord) {
              return prev.map((s) => (s.id === newRecord.id ? newRecord : s));
            }
            if (payload.eventType === 'DELETE' && oldRecord?.id) {
              return prev.filter((s) => s.id !== oldRecord.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyToClipboard = async (e: React.MouseEvent, text: string, label: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const runningCount = servers.filter((s) => s.status === 'running').length;
  const provisioningCount = servers.filter((s) => s.status === 'provisioning').length;
  const estimatedMonthlySpend = servers.reduce((t, s) => t + (s.hourly_cost || 0) * 730, 0);

  return (
    <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-6 glass-panel overflow-hidden"
      >
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/70">
              Compute Services
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Virtual Private Servers
              </h1>
              <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Live
              </Badge>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
              Deploy, monitor, and manage your fleet of virtual machines.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {['KVM hypervisor', 'NVMe SSD', 'IPv4 included', 'Up to 32 vCPUs'].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/42"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                onClick={loadServers}
                variant="outline"
                disabled={loading}
                size="sm"
                className="rounded-none border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
              >
                <RotateCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button asChild size="sm" className="rounded-none border border-cyan-400/25 bg-cyan-500/90 text-slate-950 hover:bg-cyan-400">
                <Link href="/dashboard/services/compute/vps/new">
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Create VPS
                </Link>
              </Button>
            </div>
          </div>
          <Image
            src="/dashboard-services-icons/da compute.png"
            alt=""
            width={160}
            height={160}
            className="hidden shrink-0 object-contain lg:block lg:h-[190px] lg:w-[190px] xl:h-[210px] xl:w-[210px]"
            priority
            unoptimized
          />
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04, duration: 0.24 }}
        className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {[
          { label: 'Fleet Size',    value: servers.length,                          sub: 'Total instances',   icon: '/dashboard-icons/total-clusters-1.png' },
          { label: 'Healthy',       value: runningCount,                            sub: 'Currently running', icon: '/dashboard-icons/healthy.png' },
          { label: 'Provisioning',  value: provisioningCount,                       sub: 'In progress',       icon: '/dashboard-icons/active-builds.png' },
          { label: 'Est. Monthly',  value: `$${estimatedMonthlySpend.toFixed(2)}`,  sub: 'Hourly pricing',    icon: '/dashboard-icons/payment.png' },
        ].map((stat) => (
          <div key={stat.label} className="glass-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">{stat.label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-white tabular-nums">{stat.value}</p>
                <p className="mt-1 text-xs text-white/40">{stat.sub}</p>
              </div>
              <Image src={stat.icon} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain opacity-60" />
            </div>
          </div>
        ))}
      </motion.div>

      {/* Server list */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.24 }}
      >
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-panel h-[72px] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        ) : servers.length > 0 ? (
          <div className="glass-panel overflow-hidden">
            {/* Table header */}
            <div className="hidden border-b border-white/[0.06] px-5 py-3 sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_36px] sm:gap-4">
              {['Server', 'IP Address', 'Resources', 'OS', 'Monthly'].map((h) => (
                <div key={h} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/28">{h}</div>
              ))}
              <div />
            </div>

            {/* Rows */}
            {servers.map((server) => {
              const isProvisioning = server.status === 'provisioning';
              const isFailed = server.status === 'failed' || server.status === 'error';
              const isRunning = server.status === 'running';
              const provisioning = server.details?.provisioning;
              const progress = provisioning?.progress || 10;
              const monthly = ((server.hourly_cost || 0) * 730).toFixed(2);
              const memGB = Math.round(server.memory_mb / 1024);

              return (
                <Link
                  key={server.id}
                  href={`/dashboard/services/compute/vps/${server.id}`}
                  className="group relative block border-b border-white/[0.04] last:border-b-0 transition-colors hover:bg-white/[0.025]"
                >
                  {/* Left status accent */}
                  <span className={`absolute left-0 top-0 h-full w-0.5 ${statusAccent(server.status)} opacity-60`} />

                  <div className="px-5 py-4 pl-6">
                    {/* Mobile layout */}
                    <div className="flex items-center justify-between sm:hidden">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-sm font-semibold text-white truncate">{server.name}</span>
                          <span className={`inline-flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${statusColor(server.status)}`}>
                            {isProvisioning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                            {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                            {isFailed && <XCircle className="h-2.5 w-2.5" />}
                            {server.status}
                          </span>
                        </div>
                        {isProvisioning && (
                          <div className="mt-2">
                            <div className="h-1 overflow-hidden bg-white/[0.06]">
                              <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-700" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="mt-1 text-[11px] text-blue-400">{provisioning?.message}</p>
                          </div>
                        )}
                        {!isProvisioning && (
                          <div className="mt-1.5 flex items-center gap-3 text-xs text-white/38">
                            <span className="font-mono">{server.ip}</span>
                            <span>{server.cpu_cores}vCPU · {memGB}GB RAM · {server.disk_gb}GB</span>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="ml-3 h-4 w-4 shrink-0 text-white/20 transition-colors group-hover:text-white/50" />
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_36px] sm:gap-4 sm:items-center">
                      {/* Server name + status */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-sm font-semibold text-white truncate">{server.name}</span>
                          <span className={`inline-flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${statusColor(server.status)}`}>
                            {isProvisioning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                            {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                            {isFailed && <XCircle className="h-2.5 w-2.5" />}
                            {server.status}
                          </span>
                        </div>
                        {isProvisioning && (
                          <div className="mt-2 max-w-[180px]">
                            <div className="h-1 overflow-hidden bg-white/[0.06]">
                              <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-700" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="mt-1 truncate text-[11px] text-blue-400">{provisioning?.message}</p>
                          </div>
                        )}
                        {isFailed && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            {provisioning?.message || 'Deployment failed'}
                          </p>
                        )}
                      </div>

                      {/* IP */}
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-sm text-white/60 truncate">{server.ip || '—'}</span>
                        {server.ip && (
                          <button
                            onClick={(e) => copyToClipboard(e, server.ip, 'IP')}
                            className="shrink-0 text-white/20 transition-colors hover:text-white/60"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Resources */}
                      <div className="flex items-center gap-3 text-xs text-white/50">
                        <span className="flex items-center gap-1.5">
                          <Image src="/dashboard-icons/cpu.png" alt="" width={12} height={12} className="h-3 w-3 object-contain opacity-50"  unoptimized />
                          {server.cpu_cores} cores
                        </span>
                        <span className="text-white/15">·</span>
                        <span className="flex items-center gap-1.5">
                          <Image src="/dashboard-icons/ram.png" alt="" width={12} height={12} className="h-3 w-3 object-contain opacity-50"  unoptimized />
                          {memGB} GB
                        </span>
                        <span className="text-white/15">·</span>
                        <span className="flex items-center gap-1.5">
                          <Image src="/dashboard-icons/storage.png" alt="" width={12} height={12} className="h-3 w-3 object-contain opacity-50"  unoptimized />
                          {server.disk_gb} GB
                        </span>
                      </div>

                      {/* OS */}
                      <div className="truncate text-sm text-white/48">{server.os}</div>

                      {/* Cost */}
                      <div className="font-mono text-sm font-medium text-white tabular-nums">${monthly}</div>

                      {/* Arrow */}
                      <div className="flex justify-end">
                        <ArrowRight className="h-4 w-4 text-white/15 transition-all group-hover:translate-x-0.5 group-hover:text-white/50" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="glass-panel overflow-hidden">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Image
                src="/dashboard-services-icons/da compute.png"
                alt=""
                width={120}
                height={120}
                className="mb-5 h-28 w-28 object-contain opacity-60"
                unoptimized
              />
              <h3 className="mb-2 text-lg font-semibold text-white">No servers yet</h3>
              <p className="mb-6 max-w-sm text-sm text-white/40">
                Deploy your first virtual machine to get started with compute.
              </p>
              <Button asChild className="rounded-none border border-cyan-400/25 bg-cyan-500/90 text-slate-950 hover:bg-cyan-400">
                <Link href="/dashboard/services/compute/vps/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first VPS
                </Link>
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
