'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, ArrowRight, Link2, Loader2, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react';
import { getServiceDefinition } from '@/lib/services/registry';
import type { CanvasService } from './canvas';

// ── Types ─────────────────────────────────────────────────────────────────────

type Connection = {
  id: string;
  connection_type: string;
  status: string;
  created_env_keys: string[];
  from_service: { id: string; name: string; engine: string } | null;
  to_service: { id: string; name: string; engine: string } | null;
};

type Props = {
  open: boolean;
  instanceId: string;
  services: CanvasService[];
  onClose: () => void;
  onConnected: () => void;
};

// ── Service selector ──────────────────────────────────────────────────────────

function ServicePill({ svc }: { svc: CanvasService }) {
  const def = getServiceDefinition(svc.engine);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${def.color.bg} ${def.color.border} ${def.color.text}`}>
      {svc.service_name}
    </span>
  );
}

function ServiceSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: CanvasService[];
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(s => s.service_name === value);

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] text-white/40 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white/[0.04] border border-white/10 rounded-lg text-sm hover:border-white/20 transition-colors"
        >
          {selected ? (
            <ServicePill svc={selected} />
          ) : (
            <span className="text-white/30 text-xs">{placeholder}</span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1 }}
              className="absolute top-full mt-1 left-0 right-0 z-50 bg-[#13131a] border border-white/10 rounded-lg overflow-hidden shadow-xl"
            >
              {options.map(svc => {
                const def = getServiceDefinition(svc.engine);
                return (
                  <button
                    key={svc.service_name}
                    onClick={() => { onChange(svc.service_name); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-white/[0.06] transition-colors text-left ${
                      svc.service_name === value ? 'bg-white/[0.04]' : ''
                    }`}
                  >
                    <span className={`text-[11px] font-medium ${def.color.text}`}>{def.label}</span>
                    <span className="text-white/60">{svc.service_name}</span>
                    {svc.service_name === value && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 ml-auto" />
                    )}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Active connections list ───────────────────────────────────────────────────

function ActiveConnections({
  instanceId,
  connections,
  onDisconnect,
}: {
  instanceId: string;
  connections: Connection[];
  onDisconnect: (connId: string) => void;
}) {
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function handleDisconnect(conn: Connection) {
    setDisconnecting(conn.id);
    try {
      await fetch(`/api/instances/${instanceId}/connections/${conn.id}`, { method: 'DELETE' });
      onDisconnect(conn.id);
    } finally {
      setDisconnecting(null);
    }
  }

  if (connections.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-white/40 uppercase tracking-wide">Active connections</p>
      <div className="space-y-1">
        {connections.map(conn => (
          <div
            key={conn.id}
            className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border border-white/8 rounded-lg"
          >
            <span className="text-[11px] text-white/70 flex-1 truncate">
              <span className="font-medium text-white/90">{conn.from_service?.name}</span>
              <span className="text-white/30 mx-1.5">→</span>
              <span className="font-medium text-white/90">{conn.to_service?.name}</span>
              <span className="text-white/30 ml-1.5">({conn.connection_type})</span>
            </span>
            <span className="text-[10px] text-white/25">
              {conn.created_env_keys.length} var{conn.created_env_keys.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => handleDisconnect(conn)}
              disabled={disconnecting === conn.id}
              className="w-5 h-5 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {disconnecting === conn.id
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <X className="w-3 h-3" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function ConnectionModal({ open, instanceId, services, onClose, onConnected }: Props) {
  const [fromService, setFromService] = useState('');
  const [toService, setToService] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConns, setLoadingConns] = useState(false);

  const fetchConnections = useCallback(async () => {
    setLoadingConns(true);
    try {
      const res = await fetch(`/api/instances/${instanceId}/connections`);
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections ?? []);
      }
    } finally {
      setLoadingConns(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (open) fetchConnections();
  }, [open, fetchConnections]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setFromService('');
      setToService('');
      setTemplateId('');
      setError('');
    }
  }, [open]);

  // Auto-select first template when to-service changes
  useEffect(() => {
    if (!toService) { setTemplateId(''); return; }
    const svc = services.find(s => s.service_name === toService);
    if (!svc) return;
    const def = getServiceDefinition(svc.engine);
    setTemplateId(def.connectionTemplates[0]?.id ?? '');
  }, [toService, services]);

  // Services that can be "to" (have connection templates)
  const toOptions = services.filter(s => {
    const def = getServiceDefinition(s.engine);
    return def.connectionTemplates.length > 0;
  });

  // Services that can be "from" (any service except the to-service)
  const fromOptions = services.filter(s => s.service_name !== toService);

  // Selected to-service templates
  const toSvc = services.find(s => s.service_name === toService);
  const toTemplates = toSvc ? getServiceDefinition(toSvc.engine).connectionTemplates : [];

  // Preview: show which env keys will be added
  const selectedTemplate = toTemplates.find(t => t.id === templateId);
  const previewKeys = selectedTemplate?.vars.map(v => v.key) ?? [];

  const canConnect = fromService && toService && templateId && fromService !== toService;

  async function handleConnect() {
    if (!canConnect) return;

    const fromSvcObj = services.find(s => s.service_name === fromService);
    const toSvcObj = services.find(s => s.service_name === toService);
    if (!fromSvcObj || !toSvcObj) return;

    // Use service names as IDs — the API needs actual UUIDs.
    // We fetch them from a details endpoint or pass them directly.
    // Since CanvasService doesn't have id, we need to look it up.
    setConnecting(true);
    setError('');

    try {
      // Fetch service IDs by name
      const [fromRes, toRes] = await Promise.all([
        fetch(`/api/instances/${instanceId}/services/${fromService}`),
        fetch(`/api/instances/${instanceId}/services/${toService}`),
      ]);

      if (!fromRes.ok || !toRes.ok) {
        throw new Error('Could not resolve service details');
      }

      const fromData = await fromRes.json();
      const toData = await toRes.json();

      const res = await fetch(`/api/instances/${instanceId}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromServiceId: fromData.service.id,
          toServiceId: toData.service.id,
          templateId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Connection failed');

      await fetchConnections();
      setFromService('');
      setToService('');
      setTemplateId('');
      onConnected();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-md bg-[#0e0e16] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
                    <Link2 className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Connect Services</h2>
                    <p className="text-[11px] text-white/35 mt-0.5">Inject connection env vars between services</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-white/30 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/8"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* Active connections */}
                {loadingConns ? (
                  <div className="flex justify-center py-2">
                    <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
                  </div>
                ) : (
                  <ActiveConnections
                    instanceId={instanceId}
                    connections={connections}
                    onDisconnect={id => setConnections(prev => prev.filter(c => c.id !== id))}
                  />
                )}

                {/* Divider if connections exist */}
                {connections.length > 0 && (
                  <div className="border-t border-white/8" />
                )}

                {/* New connection form */}
                <div className="space-y-4">
                  <p className="text-xs font-medium text-white/60">New connection</p>

                  {/* Service pair */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <ServiceSelect
                        label="From service"
                        value={fromService}
                        options={fromOptions}
                        onChange={setFromService}
                        placeholder="Select consumer…"
                      />
                    </div>
                    <div className="pb-2.5 flex-shrink-0">
                      <ArrowRight className="w-4 h-4 text-white/20" />
                    </div>
                    <div className="flex-1">
                      <ServiceSelect
                        label="To service"
                        value={toService}
                        options={toOptions}
                        onChange={setToService}
                        placeholder="Select provider…"
                      />
                    </div>
                  </div>

                  {/* Template picker */}
                  {toTemplates.length > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-white/40 uppercase tracking-wide">Template</label>
                      <div className="flex flex-wrap gap-1.5">
                        {toTemplates.map(tmpl => (
                          <button
                            key={tmpl.id}
                            onClick={() => setTemplateId(tmpl.id)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                              templateId === tmpl.id
                                ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                                : 'bg-white/[0.03] border-white/8 text-white/40 hover:border-white/20 hover:text-white/60'
                            }`}
                          >
                            {tmpl.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview of env vars that will be injected */}
                  {previewKeys.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-white/40 uppercase tracking-wide">
                        Variables added to{' '}
                        <span className="text-white/60 normal-case">{fromService || '…'}</span>
                      </p>
                      <div className="bg-white/[0.02] border border-white/8 rounded-lg divide-y divide-white/5">
                        {previewKeys.map(key => (
                          <div
                            key={key}
                            className="flex items-center gap-2 px-3 py-2"
                          >
                            <span className="text-xs font-mono text-white/70">{key}</span>
                            <span className="text-[10px] text-white/25 ml-auto">from {toService}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{error}</p>
                    </div>
                  )}

                  {/* Connect button */}
                  <button
                    onClick={handleConnect}
                    disabled={!canConnect || connecting}
                    className="w-full py-2.5 rounded-xl text-sm font-medium transition-all bg-white text-black hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {connecting ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />Connecting…</>
                    ) : (
                      <><Link2 className="w-3.5 h-3.5" />Connect</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
