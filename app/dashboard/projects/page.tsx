'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { Plus, Database, Zap, Globe, Settings, CheckCircle2, XCircle, Loader2, Clock, Layers, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getServiceDefinition } from '@/lib/services/registry';

type ServiceSummary = { service_name: string; service_type: string; engine: string; status: string; public_domain: string | null };
type Instance = {
  id: string;
  project_name: string;
  namespace: string;
  status: string;
  created_at: string;
  hasTemplateUpdate?: boolean;
  template_instance_services: ServiceSummary[];
};

function serviceIcon(engine: string) {
  const icon = getServiceDefinition(engine).icon;
  if (icon === 'Database') return <Database className="w-3 h-3" />;
  if (icon === 'Zap') return <Zap className="w-3 h-3" />;
  if (icon === 'Layers') return <Layers className="w-3 h-3" />;
  if (icon === 'Settings') return <Settings className="w-3 h-3" />;
  return <Globe className="w-3 h-3" />;
}

const INSTANCE_STATUS: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
  ready:     { cls: 'text-green-400 bg-green-500/15 border-green-500/30',    icon: <CheckCircle2 className="w-3 h-3" />,             label: 'Ready'    },
  failed:    { cls: 'text-red-400 bg-red-500/15 border-red-500/30',          icon: <XCircle className="w-3 h-3" />,                  label: 'Failed'   },
  deploying: { cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30',       icon: <Loader2 className="w-3 h-3 animate-spin" />,     label: 'Deploying'},
  creating:  { cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30',       icon: <Loader2 className="w-3 h-3 animate-spin" />,     label: 'Creating' },
  degraded:  { cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30',    icon: <XCircle className="w-3 h-3" />,                  label: 'Degraded' },
  deleting:  { cls: 'text-red-300 bg-red-500/10 border-red-500/20',          icon: <Loader2 className="w-3 h-3 animate-spin" />,     label: 'Deleting' },
  pending:   { cls: 'text-white/40 bg-white/5 border-white/20',              icon: <Clock className="w-3 h-3" />,                    label: 'Pending'  },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ProjectsPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/instances')
      .then(r => r.json())
      .then(d => setInstances(d.instances ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 bg-black min-h-screen p-4 sm:p-6 lg:p-8 text-white">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Projects</h1>
          <p className="text-white/40 text-sm mt-0.5">Deployed multi-service stacks</p>
        </div>
        <Button asChild className="bg-white text-black hover:bg-white/90">
          <Link href="/dashboard/templates">
            <Plus className="w-4 h-4 mr-1.5" /> New Project
          </Link>
        </Button>
      </motion.div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
        </div>
      )}

      {!loading && instances.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 gap-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Layers className="w-6 h-6 text-white/30" />
          </div>
          <div className="text-center">
            <p className="text-white/60 font-medium mb-1">No projects yet</p>
            <p className="text-white/30 text-sm">Deploy a template to create your first project.</p>
          </div>
          <Button asChild className="bg-white text-black hover:bg-white/90 mt-2">
            <Link href="/dashboard/templates">Browse Templates</Link>
          </Button>
        </motion.div>
      )}

      {/* Project grid */}
      {!loading && instances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {instances.map((inst, i) => {
            const st = INSTANCE_STATUS[inst.status] ?? INSTANCE_STATUS.pending;
            const services = inst.template_instance_services ?? [];
            const webSvc = services.find(s => s.service_type === 'web' && s.public_domain);

            return (
              <motion.div
                key={inst.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link href={`/dashboard/projects/${inst.id}`} className="block">
                  <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 hover:bg-white/[0.07] hover:border-white/20 transition-all duration-150 group">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate group-hover:text-white transition-colors">
                          {inst.project_name}
                        </h3>
                        <p className="text-[11px] text-white/30 font-mono mt-0.5">{inst.namespace}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {inst.hasTemplateUpdate && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border text-amber-300 bg-amber-500/10 border-amber-500/20">
                            <RefreshCw className="w-2.5 h-2.5" /> Update
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>
                          {st.icon} {st.label}
                        </span>
                      </div>
                    </div>

                    {/* Service pills */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {services.map(svc => (
                        <div
                          key={svc.service_name}
                          className="flex items-center gap-1 bg-white/5 border border-white/8 rounded-md px-2 py-1 text-[11px] text-white/50"
                        >
                          {serviceIcon(svc.engine)}
                          <span>{svc.service_name}</span>
                        </div>
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/25">{timeAgo(inst.created_at)}</span>
                      {webSvc?.public_domain && (
                        <span className="text-[11px] text-white/30 truncate max-w-[140px]">
                          {webSvc.public_domain.replace('https://', '')}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
