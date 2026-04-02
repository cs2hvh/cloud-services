import { Ban, CheckCircle2, Clock3, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DomainAttachAction, type DomainAppOption } from '@/components/dashboard/domains/domain-attach-action';
import type { PurchaseRequest } from './types';

interface PurchaseRequestsProps {
  requests: PurchaseRequest[];
  loading: boolean;
  showAttachActions: boolean;
  attachOptions: DomainAppOption[];
  defaultAttachAppId?: string;
  purchaseRequestAppIdFilter?: string;
  onRefresh: () => void;
  onDomainAttached?: (appId: string) => void;
}

function formatRelativeTime(dateString: string) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusBadge({ status }: { status: PurchaseRequest['status'] }) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0 gap-1">
          <CheckCircle2 className="w-2.5 h-2.5" />
          Completed
        </Badge>
      );
    case 'processing':
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0 gap-1">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          Processing
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0 gap-1">
          <XCircle className="w-2.5 h-2.5" />
          Failed
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge className="bg-white/5 text-white/35 border-white/10 text-[10px] px-1.5 py-0 gap-1">
          <Ban className="w-2.5 h-2.5" />
          Cancelled
        </Badge>
      );
    case 'requested':
    default:
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0 gap-1">
          <Clock3 className="w-2.5 h-2.5" />
          Requested
        </Badge>
      );
  }
}

export function PurchaseRequests({
  requests,
  loading,
  showAttachActions,
  attachOptions,
  defaultAttachAppId,
  purchaseRequestAppIdFilter,
  onRefresh,
  onDomainAttached,
}: PurchaseRequestsProps) {
  return (
    <div className="rounded border border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.01] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <p className="text-sm font-medium text-white">Purchase Requests</p>
          {requests.length > 0 && (
            <span className="text-[10px] text-white/30 tabular-nums bg-white/[0.05] border border-white/[0.08] rounded px-1.5 py-px">
              {requests.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-white/30 hover:text-white/70 hover:bg-white/[0.06] rounded"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-white/[0.03] first:border-0">
              <div className="h-4 w-36 animate-pulse rounded bg-white/[0.06]" style={{ animationDelay: `${i * 60}ms` }} />
              <div className="h-5 w-20 animate-pulse rounded bg-white/[0.06]" />
              <div className="flex-1" />
              <div className="h-3.5 w-10 animate-pulse rounded bg-white/[0.06]" />
              <div className="hidden sm:block h-3.5 w-10 animate-pulse rounded bg-white/[0.06]" />
              <div className="hidden md:block h-3.5 w-14 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-white/30">
            {purchaseRequestAppIdFilter
              ? 'No purchase requests for this app yet.'
              : 'No purchase requests yet. Search for a domain above to get started.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 border-b border-white/[0.04] bg-white/[0.01]">
                <th className="px-4 py-2.5 text-left">Domain</th>
                <th className="px-4 py-2.5 text-left w-32">Status</th>
                <th className="px-4 py-2.5 text-right w-24 hidden sm:table-cell">Register</th>
                <th className="px-4 py-2.5 text-right w-24 hidden sm:table-cell">Renew/yr</th>
                <th className="px-4 py-2.5 text-left w-24 hidden md:table-cell">When</th>
                {showAttachActions && <th className="px-4 py-2.5 text-right w-40" />}
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr
                  key={request.id}
                  className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium font-mono text-white">{request.domain}</span>
                    {request.last_error && (
                      <p className="text-[10px] text-red-400/70 mt-0.5">{request.last_error}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={request.status} />
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className="text-xs tabular-nums text-white/45">
                      {request.purchase_price !== null ? `$${request.purchase_price}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className="text-xs tabular-nums text-white/45">
                      {request.renewal_price !== null ? `$${request.renewal_price}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-white/30" title={new Date(request.created_at).toLocaleString()}>
                      {formatRelativeTime(request.created_at)}
                    </span>
                  </td>
                  {showAttachActions && (
                    <td className="px-4 py-3 text-right">
                      {request.status === 'completed' && attachOptions.length > 0 ? (
                        <DomainAttachAction
                          domain={request.domain}
                          appOptions={attachOptions}
                          defaultAppId={defaultAttachAppId}
                          buttonLabel="Attach to App"
                          onAttached={(attachedAppId) => onDomainAttached?.(attachedAppId)}
                        />
                      ) : request.status === 'completed' && attachOptions.length === 0 ? (
                        <span className="text-xs text-white/25">Deploy an app first</span>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
