'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAppOperationLabel } from '@/lib/app-operations/core/presentation';

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

  return (
    <Card className="glass-panel rounded-none border-white/[0.08]">
      <CardHeader className="border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Operation Logs</h3>
            <p className="text-xs text-white/45">
              Runtime operations are tracked separately from release build logs.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={!selectedOperation || loading}
            className="rounded-none border-white/15 bg-transparent text-white hover:bg-white/10"
          >
            {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {operations.length > 0 ? (
          <>
            <Select
              value={selectedOperationId ?? operations[0].id}
              onValueChange={onSelectOperation}
            >
              <SelectTrigger className="rounded-none border-white/10 bg-white/[0.03] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none border-white/10 bg-[#050505] text-white">
                {operations.map((operation) => (
                  <SelectItem key={operation.id} value={operation.id}>
                    {getOperationLabel(operation)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedOperation && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className="rounded-none border-white/10 bg-white/[0.05] text-white/70">
                  {getOperationLabel(selectedOperation)}
                </Badge>
                <Badge className={`rounded-none ${
                  selectedOperation.status === 'SUCCESS'
                    ? 'border-green-500/20 bg-green-500/10 text-green-300'
                    : selectedOperation.status === 'FAILURE'
                      ? 'border-red-500/20 bg-red-500/10 text-red-300'
                      : 'border-yellow-500/20 bg-yellow-500/10 text-yellow-300'
                }`}>
                  {formatBuildStatus(selectedOperation.status)}
                </Badge>
                {selectedOperation.operation_details?.verification?.status === 'degraded' && (
                  <Badge className="rounded-none border-orange-500/20 bg-orange-500/10 text-orange-300">
                    Degraded
                  </Badge>
                )}
              </div>
            )}

            <pre className="max-h-[28rem] overflow-auto rounded-none border border-white/[0.08] bg-black/40 p-4 font-mono text-xs leading-6 text-white/75">
              {loading ? 'Loading operation logs…' : logs || 'No operation logs available.'}
            </pre>
          </>
        ) : (
          <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-6 text-sm text-white/50">
            No operation logs yet. Rollback, resize, and other runtime actions will appear here.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
