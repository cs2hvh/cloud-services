'use client';

import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  ExternalLink, Copy, CheckCircle2, XCircle, Loader2, Clock,
  RefreshCw, Save, HardDrive, Cpu, MemoryStick, BarChart3,
} from 'lucide-react';
import { getServiceDefinition } from '@/lib/services/registry';
import { resolveServiceIcon } from '@/lib/ui/service-icons';
import { EnvEditor, type EnvPair } from './env-editor';
import { ScalingControls } from './scaling-controls';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ServiceDetail = {
  service_name: string;
  service_type: string;
  engine: string;
  status: 'pending' | 'deploying' | 'healthy' | 'failed';
  public_domain: string | null;
  private_domain: string | null;
  image: string;
  volumes?: { name: string; mountPath: string; sizeGb: number }[];
};

type Props = {
  open: boolean;
  service: ServiceDetail | null;
  instanceId: string;
  onClose: () => void;
  onRefresh: () => void;
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div>
      <p className="text-[11px] text-white/40 mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 group">
        <code className="text-xs text-white/70 flex-1 truncate font-mono">{value}</code>
        <button onClick={copy} className="text-white/30 hover:text-white transition-colors flex-shrink-0">
          {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    healthy:   { icon: <CheckCircle2 className="w-4 h-4" />, cls: 'text-green-400 bg-green-500/15 border-green-500/30', label: 'Healthy' },
    failed:    { icon: <XCircle className="w-4 h-4" />,      cls: 'text-red-400 bg-red-500/15 border-red-500/30',       label: 'Failed'  },
    deploying: { icon: <Loader2 className="w-4 h-4 animate-spin" />, cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30', label: 'Deploying' },
    pending:   { icon: <Clock className="w-4 h-4" />,        cls: 'text-white/40 bg-white/5 border-white/20',            label: 'Pending' },
  };
  const s = map[status] ?? map.pending;
  return (
    <div className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border ${s.cls}`}>
      {s.icon} {s.label}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ServiceMetrics = { cpuMillicores: number; memoryMiB: number } | null;

export function ServiceDetailSheet({ open, service, instanceId, onClose, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'variables' | 'settings' | 'scaling' | 'metrics' | 'logs'>('overview');
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState('');
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Metrics tab state
  const [metrics, setMetrics] = useState<ServiceMetrics>(null);
  const [metricsReplicas, setMetricsReplicas] = useState<number>(0);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsMessage, setMetricsMessage] = useState('');
  const metricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Variables tab state
  const [envPairs, setEnvPairs] = useState<EnvPair[]>([]);
  const [envLoading, setEnvLoading] = useState(false);
  const [envSaving, setEnvSaving] = useState(false);
  const [envError, setEnvError] = useState('');
  const [envSaved, setEnvSaved] = useState(false);

  // Settings tab state
  const [imageInput, setImageInput] = useState('');
  const [imgSaving, setImgSaving] = useState(false);
  const [imgError, setImgError] = useState('');
  const [imgSaved, setImgSaved] = useState(false);

  // Logs tab state
  const [logs, setLogs] = useState('');
  const [logPodName, setLogPodName] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const logsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch env vars when sheet opens
  useEffect(() => {
    if (!open || !service) { setActiveTab('overview'); return; }
    setEnvLoading(true);
    setEnvError('');
    setImageInput(service.image);
    fetch(`/api/instances/${instanceId}/services/${service.service_name}`)
      .then(r => r.json())
      .then(d => {
        const vars = (d.service?.env_vars as Record<string, string>) ?? {};
        setEnvPairs(Object.entries(vars).map(([key, value]) => ({ key, value })));
      })
      .catch(() => setEnvError('Failed to load variables'))
      .finally(() => setEnvLoading(false));
  }, [open, service, instanceId]);

  // Fetch logs and set up auto-refresh when logs tab is active
  async function fetchLogs() {
    if (!service) return;
    setLogsLoading(true);
    setLogsError('');
    try {
      const res = await fetch(`/api/instances/${instanceId}/services/${service.service_name}/logs`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data = await res.json();
      setLogs(data.logs ?? '');
      setLogPodName(data.podName ?? null);
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch {
      setLogsError('Failed to fetch logs from the cluster.');
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== 'logs' || !open || !service) {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
      return;
    }
    fetchLogs();
    logsIntervalRef.current = setInterval(fetchLogs, 5000);
    return () => {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, open, service, instanceId]);

  async function fetchMetrics() {
    if (!service) return;
    setMetricsLoading(true);
    try {
      const res = await fetch(`/api/instances/${instanceId}/services/${service.service_name}/metrics`);
      const data = await res.json();
      setMetrics(data.metrics ?? null);
      setMetricsReplicas(data.replicas ?? 0);
      setMetricsMessage(data.message ?? '');
    } catch {
      setMetricsMessage('Failed to fetch metrics.');
    } finally {
      setMetricsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== 'metrics' || !open || !service) {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
        metricsIntervalRef.current = null;
      }
      return;
    }
    fetchMetrics();
    metricsIntervalRef.current = setInterval(fetchMetrics, 8000);
    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
        metricsIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, open, service, instanceId]);

  async function saveEnv() {
    if (!service) return;
    setEnvSaving(true); setEnvError(''); setEnvSaved(false);
    try {
      const env = Object.fromEntries(envPairs.filter(p => p.key).map(p => [p.key, p.value]));
      const res = await fetch(`/api/instances/${instanceId}/services/${service.service_name}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      setEnvSaved(true);
      setTimeout(() => setEnvSaved(false), 2000);
      onRefresh();
    } catch (e) {
      setEnvError((e as Error).message);
    } finally {
      setEnvSaving(false);
    }
  }

  async function saveImage() {
    if (!service || !imageInput) return;
    setImgSaving(true); setImgError(''); setImgSaved(false);
    try {
      const res = await fetch(`/api/instances/${instanceId}/services/${service.service_name}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update image');
      setImgSaved(true);
      setTimeout(() => setImgSaved(false), 2000);
      onRefresh();
    } catch (e) {
      setImgError((e as Error).message);
    } finally {
      setImgSaving(false);
    }
  }

  async function handleRestart() {
    if (!service) return;
    setRestarting(true);
    setRestartError('');
    try {
      const res = await fetch(`/api/instances/${instanceId}/services/${service.service_name}/restart`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRestartError(data.error ?? 'Restart failed');
        return;
      }
      onRefresh();
    } catch {
      setRestartError('Network error — restart request failed');
    } finally {
      setRestarting(false);
    }
  }

  if (!service) return null;
  const def = getServiceDefinition(service.engine);
  const Icon = resolveServiceIcon(def.icon);

  const TABS = [
    { id: 'overview',  label: 'Overview'  },
    { id: 'variables', label: 'Variables' },
    { id: 'settings',  label: 'Settings'  },
    { id: 'scaling',   label: 'Scaling'   },
    { id: 'metrics',   label: 'Metrics'   },
    { id: 'logs',      label: 'Logs'      },
  ] as const;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[380px] sm:w-[440px] bg-zinc-950 border-white/10 text-white p-0 flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2.5 text-white">
              <span className={def.color.text}><Icon className="w-4 h-4" /></span>
              {service.service_name}
            </SheetTitle>
            <p className="text-xs text-white/40">{def.label}</p>
          </SheetHeader>

          {/* Tab bar */}
          <div className="flex gap-1 mt-3 bg-white/5 rounded-lg p-0.5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 text-xs py-1 rounded-md font-medium transition-all ${
                  activeTab === t.id
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── Overview tab ─────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] text-white/40 mb-2 uppercase tracking-wider">Status</p>
                <StatusBadge status={service.status} />
              </div>

              <Separator className="bg-white/8" />

              <div>
                <p className="text-[11px] text-white/40 mb-2 uppercase tracking-wider">Image</p>
                <code className="text-xs text-white/60 font-mono bg-white/5 px-3 py-2 rounded-lg block truncate">
                  {service.image}
                </code>
              </div>

              {(service.public_domain || service.private_domain) && (
                <>
                  <Separator className="bg-white/8" />
                  <div className="space-y-3">
                    <p className="text-[11px] text-white/40 uppercase tracking-wider">Networking</p>

                    {service.public_domain && (
                      <div>
                        <p className="text-[11px] text-white/30 mb-1">Public URL</p>
                        <a href={service.public_domain} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 truncate">
                          {service.public_domain.replace('https://', '')}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </div>
                    )}

                    {service.private_domain && (
                      <CopyField label="Private DNS (ClusterIP)" value={service.private_domain} />
                    )}

                    {def.connectionTemplates.length > 0 && service.private_domain &&
                      def.connectionTemplates.slice(0, 1).map(ct => (
                        <CopyField
                          key={ct.id}
                          label={`${ct.vars[0].key} (template)`}
                          value={ct.vars[0].template
                            .replace(/\{\{host\}\}/g, service.private_domain!)
                            .replace(/\{\{port\}\}/g, String(def.defaultPort))}
                        />
                      ))
                    }
                  </div>
                </>
              )}

              {service.volumes && service.volumes.length > 0 && (
                <>
                  <Separator className="bg-white/8" />
                  <div>
                    <p className="text-[11px] text-white/40 mb-2 uppercase tracking-wider">Volumes</p>
                    <div className="space-y-1.5">
                      {service.volumes.map(v => (
                        <div key={v.name} className="flex items-center gap-2 text-xs text-white/50 bg-white/[0.04] border border-white/8 rounded-lg px-3 py-2">
                          <HardDrive className="w-3.5 h-3.5 flex-shrink-0 text-white/30" />
                          <code className="font-mono flex-1 truncate">{v.mountPath}</code>
                          <span className="text-white/30 flex-shrink-0">{v.sizeGb}GB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator className="bg-white/8" />

              <p className="text-[11px] text-white/30">
                Service mutations such as restart, image updates, variable changes, and connections will be queued as durable operations.
              </p>
            </div>
          )}

          {/* ── Variables tab ────────────────────────────────────────────── */}
          {activeTab === 'variables' && (
            <div className="space-y-4">
              <p className="text-[11px] text-white/40">
                Edit environment variables for <span className="text-white/70 font-mono">{service.service_name}</span>.
                Changes trigger a rolling restart.
              </p>

              {envLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
                </div>
              ) : (
                <EnvEditor pairs={envPairs} onChange={setEnvPairs} />
              )}

              {envError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {envError}
                </p>
              )}

              <Button
                className="w-full bg-white text-black hover:bg-white/90"
                disabled={envSaving || envLoading}
                onClick={saveEnv}
              >
                {envSaving ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Saving…</>
                ) : envSaved ? (
                  <><CheckCircle2 className="w-3.5 h-3.5 mr-2 text-green-600" />Saved</>
                ) : (
                  <><Save className="w-3.5 h-3.5 mr-2" />Save Variables</>
                )}
              </Button>
            </div>
          )}

          {/* ── Settings tab ─────────────────────────────────────────────── */}
          {activeTab === 'settings' && (
            <div className="space-y-5">
              <div>
                <Label className="text-xs text-white/50 mb-2 block">Container image</Label>
                <Input
                  value={imageInput}
                  onChange={e => setImageInput(e.target.value)}
                  className="bg-white/5 border-white/10 text-white font-mono text-xs"
                  placeholder="e.g. postgres:16-alpine"
                />
                <p className="text-[11px] text-white/30 mt-1.5">
                  Changing the image triggers a rolling restart with the new version.
                </p>
              </div>

              {imgError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {imgError}
                </p>
              )}

              <Button
                className="w-full bg-white text-black hover:bg-white/90"
                disabled={imgSaving || !imageInput || imageInput === service.image}
                onClick={saveImage}
              >
                {imgSaving ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Updating…</>
                ) : imgSaved ? (
                  <><CheckCircle2 className="w-3.5 h-3.5 mr-2 text-green-600" />Updated</>
                ) : (
                  <><Save className="w-3.5 h-3.5 mr-2" />Update Image</>
                )}
              </Button>

              <Separator className="bg-white/8" />

              <div>
                <p className="text-[11px] text-white/40 mb-1">Restart service</p>
                <p className="text-[11px] text-white/30 mb-3">
                  Triggers a rolling restart without changing the image or config.
                </p>
                <Button
                  variant="outline"
                  className="w-full border-white/10 bg-transparent text-white/60 hover:bg-white/8 hover:text-white"
                  disabled={restarting}
                  onClick={handleRestart}
                >
                  {restarting
                    ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Restarting…</>
                    : <><RefreshCw className="w-3.5 h-3.5 mr-2" />Restart</>
                  }
                </Button>
                {restartError && (
                  <p className="text-xs text-red-400 mt-2">{restartError}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Scaling tab ──────────────────────────────────────────────── */}
          {activeTab === 'scaling' && (
            <ScalingControls
              instanceId={instanceId}
              serviceName={service.service_name}
              onScaled={onRefresh}
            />
          )}

          {/* ── Metrics tab ──────────────────────────────────────────────── */}
          {activeTab === 'metrics' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-white/40">Live resource usage from the metrics server.</p>
                <button
                  onClick={fetchMetrics}
                  disabled={metricsLoading}
                  className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${metricsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {metricsLoading && !metrics ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
                </div>
              ) : metrics ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/[0.04] border border-white/8 rounded-xl p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-white/40 mb-2">
                      <Cpu className="w-3.5 h-3.5" /> CPU
                    </div>
                    <p className="text-2xl font-semibold text-white tabular-nums">
                      {metrics.cpuMillicores < 1000
                        ? `${metrics.cpuMillicores}m`
                        : `${(metrics.cpuMillicores / 1000).toFixed(2)}`}
                    </p>
                    <p className="text-[10px] text-white/25">millicores</p>
                  </div>
                  <div className="bg-white/[0.04] border border-white/8 rounded-xl p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-white/40 mb-2">
                      <MemoryStick className="w-3.5 h-3.5" /> Memory
                    </div>
                    <p className="text-2xl font-semibold text-white tabular-nums">
                      {metrics.memoryMiB >= 1024
                        ? `${(metrics.memoryMiB / 1024).toFixed(1)}G`
                        : `${Math.round(metrics.memoryMiB)}M`}
                    </p>
                    <p className="text-[10px] text-white/25">
                      {metrics.memoryMiB >= 1024 ? 'GiB' : 'MiB'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-white/25 space-y-2">
                  <BarChart3 className="w-8 h-8 mx-auto opacity-30" />
                  <p className="text-xs">{metricsMessage || 'No metrics available'}</p>
                  <p className="text-[10px]">Requires a running pod and metrics-server installed in the cluster.</p>
                </div>
              )}

              {metricsReplicas > 0 && (
                <div className="flex items-center gap-2 text-[11px] text-white/30 pt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                  {metricsReplicas} replica{metricsReplicas !== 1 ? 's' : ''} running
                </div>
              )}
            </div>
          )}

          {/* ── Logs tab ─────────────────────────────────────────────────── */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  {logPodName && (
                    <p className="text-[10px] text-white/30 font-mono truncate">pod: {logPodName}</p>
                  )}
                </div>
                <button
                  onClick={fetchLogs}
                  disabled={logsLoading}
                  className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${logsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {logsError ? (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {logsError}
                </p>
              ) : (
                <pre className="bg-black font-mono text-xs text-green-400/80 overflow-auto rounded-lg p-3 h-72 whitespace-pre-wrap break-all">
                  {logsLoading && !logs ? (
                    <span className="text-white/30">Loading…</span>
                  ) : logs ? (
                    logs
                  ) : (
                    <span className="text-white/30">No logs yet.</span>
                  )}
                  <div ref={logsEndRef} />
                </pre>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
