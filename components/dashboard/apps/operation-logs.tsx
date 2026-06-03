'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Terminal, ScrollText } from 'lucide-react';
import { getAppOperationLabel } from '@/lib/app-operations/core/presentation';

// ─── Design tokens (match app-overview-tab / app-bandwidth-card) ────
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-nunito), system-ui, sans-serif',
};
const ACCENT = '#0095FF';

interface OperationSummary {
  id: string;
  build_number: number | null;
  rollback_target_build_number: number | null;
  started_at: string;
  trigger: string;
  status: 'SUCCESS' | 'FAILURE' | 'BUILDING';
  operation_type: string;
  operation_details: {
    type?: string;
    source?: { size?: string };
    target?: { size?: string };
    verification?: {
      status?: string;
      message?: string;
    };
  };
}

function formatBuildStatus(status: string): string {
  switch (status) {
    case 'SUCCESS':  return 'Succeeded';
    case 'FAILURE':  return 'Failed';
    case 'BUILDING': return 'In Progress';
    case 'ABORTED':  return 'Cancelled';
    case 'UNSTABLE': return 'Unstable';
    default:         return status;
  }
}

function statusMeta(status: string) {
  if (status === 'SUCCESS') return { color: '#4ade80', label: formatBuildStatus(status) };
  if (status === 'FAILURE') return { color: '#f87171', label: formatBuildStatus(status) };
  if (status === 'BUILDING') return { color: '#fbbf24', label: formatBuildStatus(status) };
  return { color: 'rgba(255,255,255,0.6)', label: formatBuildStatus(status) };
}

function getOperationLabel(operation: OperationSummary) {
  return getAppOperationLabel({
    buildNumber: operation.build_number,
    trigger: operation.trigger,
    rollbackTargetBuildNumber: operation.rollback_target_build_number,
    operationDetails: operation.operation_details,
  });
}

export function OperationLogsPanel({
  operations,
  selectedOperationId,
  logs,
  loading,
  onSelectOperation,
  onRefresh,
}: {
  operations: OperationSummary[];
  selectedOperationId: string | null;
  logs: string;
  loading: boolean;
  onSelectOperation: (operationId: string) => void;
  onRefresh: () => void;
}) {
  const selectedOperation =
    (selectedOperationId
      ? operations.find((operation) => operation.id === selectedOperationId)
      : operations[0]) ?? null;
  const status = selectedOperation ? statusMeta(selectedOperation.status) : null;

  return (
    <section className="rounded-[8px] border border-white/[0.06] bg-[#111216] overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#0d0e11]" style={{ color: ACCENT }}>
            <ScrollText className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-white truncate">Operation logs</h3>
            <p className={`${MONO} mt-0.5 text-[10px] text-white/40`}>
              Runtime operations are tracked separately from release build logs.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!selectedOperation || loading}
          className={`${MONO} inline-flex items-center gap-1.5 rounded-[5px] border border-white/[0.08] bg-[#111216] px-3 py-1.5 text-[10.5px] uppercase tracking-[0.1em] text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-50`}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </header>

      <div className="space-y-4 p-5">
        {operations.length > 0 ? (
          <>
            <Select
              value={selectedOperationId ?? operations[0].id}
              onValueChange={onSelectOperation}
            >
              <SelectTrigger className={`${MONO} h-10 w-full rounded-[5px] border border-white/[0.08] bg-[#0d0e11] text-[12px] text-white`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-[6px] border-white/[0.08] bg-[#0d0e11] text-white">
                {operations.map((operation) => (
                  <SelectItem key={operation.id} value={operation.id}>
                    {getOperationLabel(operation)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedOperation && status && (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${MONO} inline-flex items-center rounded-[4px] border border-white/[0.08] bg-[#0d0e11] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/65`}>
                  {getOperationLabel(selectedOperation)}
                </span>
                <span
                  className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]`}
                  style={{
                    borderColor: `${status.color}4d`,
                    color: status.color,
                    background: `${status.color}1a`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: status.color, boxShadow: `0 0 5px ${status.color}` }}
                  />
                  {status.label}
                </span>
                {selectedOperation.operation_details?.verification?.status === 'degraded' && (
                  <span
                    className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]`}
                    style={{ borderColor: 'rgba(251,191,36,0.30)', color: '#fbbf24', background: 'rgba(251,191,36,0.10)' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#fbbf24', boxShadow: '0 0 5px #fbbf24' }} />
                    Degraded
                  </span>
                )}
              </div>
            )}

            <div className="overflow-hidden rounded-[6px] border border-white/[0.06] bg-[#0a0b0d]">
              <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3.5 py-2">
                <Terminal className="h-3 w-3 text-white/30" />
                <span className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>Console output</span>
              </div>
              <pre className={`${MONO} max-h-[28rem] overflow-auto p-4 text-[11.5px] leading-6 text-white/75`}>
                {loading ? 'Loading operation logs…' : logs || 'No operation logs available.'}
              </pre>
            </div>
          </>
        ) : (
          <div className="rounded-[6px] border border-white/[0.06] bg-[#0d0e11] px-5 py-10 text-center">
            <ScrollText className="mx-auto mb-2 h-7 w-7 text-white/25" />
            <p style={SERIF_STYLE} className="mb-1 text-[13px] font-semibold text-white">No operation logs yet</p>
            <p className={`${MONO} text-[11px] text-white/40`}>
              Rollback, resize, and other runtime actions will appear here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
