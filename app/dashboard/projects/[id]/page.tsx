'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, RefreshCw, Trash2, Loader2, CheckCircle2,
  XCircle, Clock, Layers, Activity, X, Link2, ArrowUpCircle, PlusCircle,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ProjectCanvas, type CanvasService } from '@/components/templates/canvas';
import { ServiceDetailSheet } from '@/components/templates/service-detail-sheet';
import { ConnectionModal } from '@/components/templates/connection-modal';
import { AddServiceModal } from '@/components/templates/add-service-modal';

type RawService = {
  service_name: string;
  service_type: string;
  engine: string;
  status: 'pending' | 'deploying' | 'healthy' | 'failed';
  public_domain: string | null;
  private_domain: string | null;
  image: string;
  volumes: { name: string; mountPath: string; sizeGb: number }[] | null;
  config: { dependsOn?: string[] } | null;
};

type Operation = {
  id: string;
  type: string;
  status: string;
  progress_pct: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type InstanceDetail = {
  id: string;
  project_name: string;
  namespace: string;
  status: string;
  created_at: string;
  template_instance_services: RawService[];
  deployment_runs: Operation[];
};

function toCanvasService(raw: RawService): CanvasService {
  return {
    service_name: raw.service_name,
    service_type: raw.service_type,
    engine: raw.engine,
    status: raw.status,
    public_domain: raw.public_domain,
    private_domain: raw.private_domain,
    image: raw.image,
    dependsOn: raw.config?.dependsOn ?? [],
    volumes: raw.volumes ?? [],
  };
}

const STATUS_BADGE: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
  ready:     { cls: 'text-green-400 bg-green-500/15 border-green-500/30',    icon: <CheckCircle2 className="w-3 h-3" />,             label: 'Ready'    },
  failed:    { cls: 'text-red-400 bg-red-500/15 border-red-500/30',          icon: <XCircle className="w-3 h-3" />,                  label: 'Failed'   },
  deploying: { cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30',       icon: <Loader2 className="w-3 h-3 animate-spin" />,     label: 'Deploying'},
  creating:  { cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30',       icon: <Loader2 className="w-3 h-3 animate-spin" />,     label: 'Creating' },
  degraded:  { cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30',    icon: <XCircle className="w-3 h-3" />,                  label: 'Degraded' },
  deleting:  { cls: 'text-red-300 bg-red-500/10 border-red-500/20',          icon: <Loader2 className="w-3 h-3 animate-spin" />,     label: 'Deleting' },
  pending:   { cls: 'text-white/40 bg-white/5 border-white/20',              icon: <Clock className="w-3 h-3" />,                    label: 'Pending'  },
};

const OP_STATUS: Record<string, { dot: string; label: string }> = {
  succeeded: { dot: 'bg-green-400', label: 'Succeeded' },
  failed:    { dot: 'bg-red-400',   label: 'Failed'    },
  running:   { dot: 'bg-blue-400 animate-pulse', label: 'Running' },
  queued:    { dot: 'bg-white/30',  label: 'Queued'    },
  cancelled: { dot: 'bg-white/20',  label: 'Cancelled' },
};

function opTypeLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(iso: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function durationStr(op: Operation) {
  if (!op.started_at || !op.finished_at) return null;
  const ms = new Date(op.finished_at).getTime() - new Date(op.started_at).getTime();
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function ProjectCanvasInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preAddEngine = searchParams.get('add');

  const [instance, setInstance] = useState<InstanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSvc, setSelectedSvc] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: number | null; changelog: string | null } | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);

  const fetchInstance = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch(`/api/instances/${id}`);
      if (!res.ok) { router.push('/dashboard/projects'); return; }
      const data = await res.json();
      setInstance(data.instance);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, router]);

  useEffect(() => { fetchInstance(); }, [fetchInstance]);

  useEffect(() => {
    fetch(`/api/instances/${id}/template-update`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.hasUpdate) setUpdateInfo({ latestVersion: d.latestVersion, changelog: d.changelog }); })
      .catch(() => {});
  }, [id]);

  // Open add-service modal if ?add=engine is in URL
  useEffect(() => {
    if (preAddEngine) setShowAddService(true);
  }, [preAddEngine]);

  // Auto-refresh while deploying
  useEffect(() => {
    if (!instance) return;
    if (instance.status === 'ready' || instance.status === 'failed') return;
    const timer = setInterval(() => fetchInstance(true), 4000);
    return () => clearInterval(timer);
  }, [instance, fetchInstance]);

  async function handleApplyUpdate() {
    setApplyingUpdate(true);
    try {
      const res = await fetch(`/api/instances/${id}/template-update`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to apply update');
      setUpdateInfo(null);
      router.push(`/dashboard/projects/${id}/deploy/${data.runId}`);
    } catch {
      setApplyingUpdate(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/instances/${id}`, { method: 'DELETE' });
      router.push('/dashboard/projects');
    } catch {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!instance) return null;

  const services = (instance.template_instance_services ?? []).map(toCanvasService);
  const existingEngines = services.map(s => s.engine);
  const selectedSvcObj = services.find(s => s.service_name === selectedSvc) ?? null;
  const st = STATUS_BADGE[instance.status] ?? STATUS_BADGE.pending;
  const ops = [...(instance.deployment_runs ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="flex flex-col bg-black min-h-screen text-white" style={{ height: '100dvh' }}>
      {/* Top bar */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/8 bg-black/80 backdrop-blur"
      >
        <button
          onClick={() => router.push('/dashboard/projects')}
          className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/8"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="font-semibold text-sm truncate">{instance.project_name}</h1>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${st.cls}`}>
              {st.icon} {st.label}
            </span>
          </div>
          <p className="text-[11px] text-white/25 font-mono">{instance.namespace}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => fetchInstance()}
            disabled={refreshing}
            className="text-white/40 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/8 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowActivity(v => !v)}
            title="Activity"
            className={`relative transition-colors p-1.5 rounded-lg hover:bg-white/8 ${showActivity ? 'text-white bg-white/8' : 'text-white/30 hover:text-white'}`}
          >
            <Activity className="w-3.5 h-3.5" />
            {ops.some(o => o.status === 'running' || o.status === 'queued') && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setShowConnectModal(true)}
            title="Connect services"
            className="text-white/30 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/8"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => router.push(`/dashboard/templates/new?fromProject=${id}`)}
            title="Save as template"
            className="text-white/30 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/8"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="text-white/30 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-zinc-950 border-white/10 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete project?</AlertDialogTitle>
                <AlertDialogDescription className="text-white/50">
                  This will tear down all services in <span className="text-white font-mono">{instance.namespace}</span> and delete all data. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-transparent border-white/10 text-white/60 hover:bg-white/8 hover:text-white">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700 text-white border-0"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                  Delete Project
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </motion.div>

      {/* Template update banner */}
      {updateInfo && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-amber-500/8 border-b border-amber-500/20">
          <ArrowUpCircle className="w-4 h-4 text-amber-300 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-amber-200">
              Template update available{updateInfo.latestVersion ? ` — version ${updateInfo.latestVersion}` : ''}
            </span>
            {updateInfo.changelog && (
              <span className="text-[11px] text-amber-300/50 ml-2">{updateInfo.changelog}</span>
            )}
          </div>
          <button
            onClick={handleApplyUpdate}
            disabled={applyingUpdate}
            className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {applyingUpdate ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpCircle className="w-3 h-3" />}
            Apply Update
          </button>
          <button onClick={() => setUpdateInfo(null)} className="text-amber-300/40 hover:text-amber-200 transition-colors flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main area: canvas + activity sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas */}
        <div
          className="flex-1 overflow-hidden relative"
          onClick={() => setSelectedSvc(null)}
        >
          {services.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <p className="text-sm text-white/25">No services yet</p>
              <button
                onClick={e => { e.stopPropagation(); setShowAddService(true); }}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl border border-dashed border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                Add your first service
              </button>
            </div>
          ) : (
            <div className="absolute inset-0" onClick={e => e.stopPropagation()}>
              <ProjectCanvas
                services={services}
                selectedService={selectedSvc}
                onSelect={name => setSelectedSvc(prev => prev === name ? null : name)}
              />
            </div>
          )}
        </div>

        {/* Activity sidebar */}
        <AnimatePresence>
          {showActivity && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-shrink-0 border-l border-white/8 bg-black overflow-hidden"
            >
              <div className="w-[300px] h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
                  <span className="text-xs font-semibold text-white/70">Activity</span>
                  <button onClick={() => setShowActivity(false)} className="text-white/30 hover:text-white transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {ops.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-white/25">
                      <Activity className="w-6 h-6 opacity-30" />
                      <p className="text-xs">No operations yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {ops.map(op => {
                        const s = OP_STATUS[op.status] ?? OP_STATUS.queued;
                        const dur = durationStr(op);
                        return (
                          <div key={op.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                              <span className="text-xs font-medium text-white/80 truncate flex-1">
                                {opTypeLabel(op.type)}
                              </span>
                              <span className="text-[10px] text-white/25 flex-shrink-0">{s.label}</span>
                            </div>
                            <div className="flex items-center justify-between pl-3.5">
                              <span className="text-[10px] text-white/30">{timeAgo(op.created_at)}</span>
                              {dur && <span className="text-[10px] text-white/20">{dur}</span>}
                            </div>
                            {op.status === 'running' && (
                              <div className="mt-1.5 pl-3.5">
                                <div className="h-0.5 bg-white/8 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 transition-all duration-500"
                                    style={{ width: `${op.progress_pct}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-t border-white/8 bg-black/80 backdrop-blur overflow-x-auto"
      >
        <span className="text-[11px] text-white/25 flex-shrink-0">
          {services.length} service{services.length !== 1 ? 's' : ''}
        </span>
        <div className="w-px h-3 bg-white/10 flex-shrink-0" />
        {services.map(svc => (
          <button
            key={svc.service_name}
            onClick={() => setSelectedSvc(prev => prev === svc.service_name ? null : svc.service_name)}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border transition-all flex-shrink-0 ${
              selectedSvc === svc.service_name
                ? 'bg-white/10 border-white/25 text-white'
                : 'bg-white/[0.03] border-white/8 text-white/40 hover:bg-white/[0.06] hover:text-white/60'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              svc.status === 'healthy'   ? 'bg-green-400' :
              svc.status === 'failed'    ? 'bg-red-400'   :
              svc.status === 'deploying' ? 'bg-blue-400 animate-pulse' :
              'bg-white/20'
            }`} />
            {svc.service_name}
          </button>
        ))}
        {services.length > 0 && <div className="w-px h-3 bg-white/10 flex-shrink-0" />}
        <button
          onClick={() => setShowAddService(true)}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border border-dashed border-white/15 text-white/30 hover:text-white/60 hover:border-white/25 transition-all flex-shrink-0"
        >
          <PlusCircle className="w-3 h-3" />
          Add service
        </button>
      </motion.div>

      {/* Service detail slide-in */}
      <ServiceDetailSheet
        open={!!selectedSvc && !!selectedSvcObj}
        service={selectedSvcObj}
        instanceId={id}
        onClose={() => setSelectedSvc(null)}
        onRefresh={() => fetchInstance(true)}
      />

      {/* Connection modal */}
      <ConnectionModal
        open={showConnectModal}
        instanceId={id}
        services={services}
        onClose={() => setShowConnectModal(false)}
        onConnected={() => fetchInstance(true)}
      />

      {/* Add service modal */}
      <AddServiceModal
        open={showAddService}
        instanceId={id}
        existingEngines={existingEngines}
        preselectedEngine={preAddEngine}
        onClose={() => setShowAddService(false)}
        onAdded={() => fetchInstance(true)}
      />
    </div>
  );
}

export default function ProjectCanvasPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
      </div>
    }>
      <ProjectCanvasInner />
    </Suspense>
  );
}
