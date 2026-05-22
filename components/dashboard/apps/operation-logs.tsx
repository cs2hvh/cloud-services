'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw } from 'lucide-react';
import { getAppOperationLabel } from '@/lib/app-operations/core/presentation';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

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
  return { color: 'rgba(255,255,255,0.45)', label: formatBuildStatus(status) };
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
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
      <div className="border-b border-white/[0.06] px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/65 font-semibold`}>
            Operation logs
          </h3>
          <p className={`${MONO} mt-1 text-[10.5px] text-white/40`}>
            Runtime operations are tracked separately from release build logs.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!selectedOperation || loading}
          className={`${MONO} h-9 inline-flex items-center gap-1.5 px-3 border border-white/[0.08] bg-[#0d0e11] text-[10.5px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50`}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      <div className="px-5 py-5 space-y-4">
        {operations.length > 0 ? (
          <>
            <Select
              value={selectedOperationId ?? operations[0].id}
              onValueChange={onSelectOperation}
            >
              <SelectTrigger className={`${MONO} h-10 w-full border border-white/[0.08] bg-[#0d0e11] text-[12px] text-white rounded-[5px]`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d0e11] border-white/[0.08] text-white">
                {operations.map((operation) => (
                  <SelectItem key={operation.id} value={operation.id}>
                    {getOperationLabel(operation)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedOperation && status && (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${MONO} inline-flex items-center px-2.5 py-1 border border-white/[0.08] bg-[#0d0e11] text-[10px] uppercase tracking-[0.08em] text-white/65 rounded-[20px]`}>
                  {getOperationLabel(selectedOperation)}
                </span>
                <span
                  className={`${MONO} inline-flex items-center gap-1.5 px-2.5 py-1 border text-[10px] uppercase tracking-[0.12em] rounded-[20px]`}
                  style={{
                    borderColor: `${status.color}33`,
                    color: status.color,
                    background: `${status.color}0d`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: status.color, boxShadow: `0 0 5px ${status.color}` }}
                  />
                  {status.label}
                </span>
                {selectedOperation.operation_details?.verification?.status === 'degraded' && (
                  <span className={`${MONO} inline-flex items-center px-2.5 py-1 border border-orange-500/25 bg-orange-500/[0.06] text-[10px] uppercase tracking-[0.12em] text-orange-300 rounded-[20px]`}>
                    Degraded
                  </span>
                )}
              </div>
            )}

            <pre className={`${MONO} max-h-[28rem] overflow-auto border border-white/[0.06] bg-[#0d0e11] rounded-[5px] p-4 text-[11.5px] leading-6 text-white/75`}>
              {loading ? 'Loading operation logs…' : logs || 'No operation logs available.'}
            </pre>
          </>
        ) : (
          <div className="border border-white/[0.06] bg-[#0d0e11] rounded-[5px] px-5 py-8 text-center">
            <p className={`${MONO} text-[11.5px] text-white/45`}>
              No operation logs yet. Rollback, resize, and other runtime actions will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
