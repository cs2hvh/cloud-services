import { Clock3, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

function StatusBadge({ status }: { status: PurchaseRequest['status'] }) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-green-500/20 text-green-300 border-green-500/30">Completed</Badge>;
    case 'processing':
      return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">Processing</Badge>;
    case 'failed':
      return <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Failed</Badge>;
    case 'cancelled':
      return <Badge className="bg-zinc-500/20 text-zinc-300 border-zinc-500/30">Cancelled</Badge>;
    default:
      return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">Requested</Badge>;
  }
}

function RequestRow({
  request,
  showAttachActions,
  attachOptions,
  defaultAttachAppId,
  onDomainAttached,
}: {
  request: PurchaseRequest;
  showAttachActions: boolean;
  attachOptions: DomainAppOption[];
  defaultAttachAppId?: string;
  onDomainAttached?: (appId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-white font-semibold">{request.domain}</p>
        <StatusBadge status={request.status} />
      </div>

      <div className="text-xs text-white/45 flex flex-wrap gap-3">
        <span>
          Register: {request.purchase_price !== null ? `$${request.purchase_price}` : 'N/A'}
        </span>
        <span>
          Renew: {request.renewal_price !== null ? `$${request.renewal_price}/yr` : 'N/A'}
        </span>
        <span>{new Date(request.created_at).toLocaleString()}</span>
      </div>

      {request.last_error && (
        <p className="text-xs text-red-300 bg-red-500/10 rounded px-2 py-1">
          {request.last_error}
        </p>
      )}

      {showAttachActions && request.status === 'completed' && attachOptions.length > 0 && (
        <DomainAttachAction
          domain={request.domain}
          appOptions={attachOptions}
          defaultAppId={defaultAttachAppId}
          buttonLabel="Attach to App"
          onAttached={(attachedAppId) => onDomainAttached?.(attachedAppId)}
        />
      )}

      {showAttachActions && request.status === 'completed' && attachOptions.length === 0 && (
        <p className="text-xs text-white/40">Deploy an app first to attach this domain.</p>
      )}
    </div>
  );
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
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-white flex items-center gap-2">
          <Clock3 className="w-4 h-4 text-white/60" />
          Purchase Requests
          {requests.length > 0 && (
            <Badge className="bg-white/10 text-white/60 border-white/10 text-[10px] px-1.5 py-0">
              {requests.length}
            </Badge>
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-white/20 h-7 text-xs"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-white/50">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading
        </div>
      ) : requests.length === 0 ? (
        <p className="text-xs text-white/40">
          {purchaseRequestAppIdFilter
            ? 'No purchase requests for this app yet.'
            : 'No purchase requests yet. Search a domain and submit one above.'}
        </p>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              showAttachActions={showAttachActions}
              attachOptions={attachOptions}
              defaultAttachAppId={defaultAttachAppId}
              onDomainAttached={onDomainAttached}
            />
          ))}
        </div>
      )}
    </div>
  );
}
