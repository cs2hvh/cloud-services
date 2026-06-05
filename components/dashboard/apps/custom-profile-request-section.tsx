'use client';

import { useState, useEffect } from 'react';
import { Cpu, Loader2, CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProfileRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  reason: string;
  requested_cpu: string | null;
  requested_memory: string | null;
  requested_replicas: number | null;
  approved_spec: Record<string, unknown> | null;
  approved_hourly_rate: number | null;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';

function StatusPill({ status }: { status: ProfileRequest['status'] }) {
  if (status === 'pending') return (
    <span className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] uppercase tracking-[0.1em] border border-amber-500/30 bg-amber-500/10 text-amber-300`}>
      <Clock className="w-3 h-3" /> Pending review
    </span>
  );
  if (status === 'approved') return (
    <span className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] uppercase tracking-[0.1em] border border-green-500/30 bg-green-500/10 text-green-300`}>
      <CheckCircle2 className="w-3 h-3" /> Approved
    </span>
  );
  if (status === 'applied') return (
    <span className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] uppercase tracking-[0.1em] border border-green-500/30 bg-green-500/10 text-green-300`}>
      <CheckCircle2 className="w-3 h-3" /> Applied
    </span>
  );
  return (
    <span className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] uppercase tracking-[0.1em] border border-red-500/30 bg-red-500/10 text-red-300`}>
      <XCircle className="w-3 h-3" /> Not approved
    </span>
  );
}

interface Props {
  appId: string;
  currentSize: string | null | undefined;
}

export function CustomProfileRequestSection({ appId, currentSize }: Props) {
  const [request, setRequest] = useState<ProfileRequest | null | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [form, setForm] = useState({
    reason: '',
    requested_cpu: '',
    requested_memory: '',
    requested_replicas: '',
  });

  useEffect(() => {
    fetch(`/api/services/platform-apps/custom-profile-request?app_id=${appId}`)
      .then(r => r.json())
      .then(d => setRequest(d.request ?? null))
      .catch(() => setRequest(null));
  }, [appId]);

  const handleSubmit = async () => {
    if (form.reason.trim().length < 10) {
      setSubmitError('Please describe your needs in at least 10 characters.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/services/platform-apps/custom-profile-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          reason: form.reason.trim(),
          requested_cpu: form.requested_cpu.trim() || undefined,
          requested_memory: form.requested_memory.trim() || undefined,
          requested_replicas: form.requested_replicas ? parseInt(form.requested_replicas) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.message || data.error || 'Failed to submit request.');
        return;
      }
      setSubmitSuccess(true);
      setShowForm(false);
      // Refresh request status
      setRequest({ id: data.request_id, status: 'pending', reason: form.reason, requested_cpu: form.requested_cpu || null, requested_memory: form.requested_memory || null, requested_replicas: form.requested_replicas ? parseInt(form.requested_replicas) : null, approved_spec: null, approved_hourly_rate: null, admin_notes: null, created_at: new Date().toISOString(), reviewed_at: null });
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Don't render until we know the request status
  if (request === undefined) return null;

  const isCustom = currentSize === 'custom';
  const canSubmitRequest = !isCustom && (!request || request.status === 'rejected');

  return (
    <div className="border-t border-white/10 pt-4 mt-2">
      <div className="flex items-center gap-2 mb-3">
        <Cpu className="w-4 h-4 text-blue-400" />
        <p className="text-sm font-medium text-white">
          {isCustom ? 'Custom Resource Profile' : 'Need More Resources?'}
        </p>
        {request && <StatusPill status={request.status} />}
      </div>

      {/* Current custom profile info */}
      {isCustom && !request && (
        <p className={`${MONO} text-[11px] text-white/50 mb-3`}>
          Your app runs on a custom resource profile managed by your account team.
          Contact support to modify your profile.
        </p>
      )}

      {/* Existing request status */}
      {request && (
        <ExistingRequestStatus request={request} />
      )}

      {/* Request form — shown for xxlarge apps with no pending request */}
      {canSubmitRequest && (
        <>
          <p className={`${MONO} text-[11px] text-white/50 mb-3`}>
            If XXLarge is not enough for your workload, you can request a custom resource profile.
            Our team will review your requirements and reach out.
          </p>

          {submitSuccess && (
            <div className="mb-3 flex items-center gap-2 border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300 rounded-[4px]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Request submitted. Our team will review it and contact you.
            </div>
          )}

          {!submitSuccess && (
            <button
              onClick={() => setShowForm(f => !f)}
              className={`${MONO} flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-blue-400 hover:text-blue-300 transition-colors`}
            >
              {showForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showForm ? 'Cancel' : 'Request custom resources'}
            </button>
          )}

          {showForm && (
            <div className="mt-3 space-y-3 border border-white/10 rounded-[6px] bg-white/[0.02] p-4">
              <div className="flex flex-col gap-1">
                <label className={`${MONO} text-[10px] uppercase tracking-[0.1em] text-white/50`}>
                  Describe your requirements *
                </label>
                <textarea
                  className={`${MONO} w-full bg-[#0d0e11] border border-white/[0.08] rounded-[4px] px-3 py-2 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 resize-none`}
                  rows={3}
                  placeholder="e.g. Running a large ML inference workload that needs 8+ CPU cores and 32GB RAM with 4 replicas for zero-downtime..."
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'requested_cpu', label: 'CPU needed', placeholder: 'e.g. 8' },
                  { key: 'requested_memory', label: 'Memory needed', placeholder: 'e.g. 32Gi' },
                  { key: 'requested_replicas', label: 'Replicas', placeholder: 'e.g. 4' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className={`${MONO} text-[10px] uppercase tracking-[0.1em] text-white/50`}>{label}</label>
                    <input
                      className={`${MONO} bg-[#0d0e11] border border-white/[0.08] rounded-[4px] px-3 py-2 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/40`}
                      placeholder={placeholder}
                      value={form[key as keyof typeof form]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              {submitError && (
                <p className={`${MONO} text-[11px] text-red-400`}>{submitError}</p>
              )}

              <Button
                onClick={handleSubmit}
                disabled={submitting || form.reason.trim().length < 10}
                className="rounded-none bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs"
              >
                {submitting && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                Submit Request
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExistingRequestStatus({ request }: { request: ProfileRequest }) {
  const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';

  return (
    <div className="border border-white/[0.06] rounded-[6px] bg-white/[0.02] p-3 space-y-2">
      <div className="flex flex-wrap gap-3 text-[11px]">
        {request.requested_cpu && (
          <span className={`${MONO} text-white/50`}>CPU: <span className="text-white/80">{request.requested_cpu}</span></span>
        )}
        {request.requested_memory && (
          <span className={`${MONO} text-white/50`}>Memory: <span className="text-white/80">{request.requested_memory}</span></span>
        )}
        {request.requested_replicas && (
          <span className={`${MONO} text-white/50`}>Replicas: <span className="text-white/80">{request.requested_replicas}</span></span>
        )}
        <span className={`${MONO} text-white/30`}>
          Submitted {new Date(request.created_at).toLocaleDateString()}
        </span>
      </div>

      {request.status === 'pending' && (
        <p className={`${MONO} text-[11px] text-white/40`}>
          Under review. Our team will contact you to discuss requirements and pricing.
        </p>
      )}

      {request.status === 'approved' && (
        <div className={`${MONO} text-[11px] text-green-300/70 space-y-1`}>
          <p>Your custom profile is approved. Redeploy to activate it.</p>
          {request.approved_spec && (
            <p className="text-white/50">
              {String(request.approved_spec.cpuRequest)} CPU, {String(request.approved_spec.memoryRequest)} memory,
              {' '}{String(request.approved_spec.replicas)} replicas
              {request.approved_hourly_rate !== null ? ` at $${request.approved_hourly_rate}/hr` : ''}
            </p>
          )}
        </div>
      )}

      {request.status === 'applied' && (
        <p className={`${MONO} text-[11px] text-green-300/70`}>
          Your custom profile is active.
        </p>
      )}

      {request.status === 'rejected' && (
        <>
          <p className={`${MONO} text-[11px] text-white/40`}>
            This request was not approved at this time.
          </p>
          {request.admin_notes && (
            <p className={`${MONO} text-[11px] text-white/60 italic`}>
              Note: {request.admin_notes}
            </p>
          )}
        </>
      )}
    </div>
  );
}
