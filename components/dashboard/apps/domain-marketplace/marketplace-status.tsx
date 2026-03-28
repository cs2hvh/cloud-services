import { Loader2 } from 'lucide-react';
import type { MarketplaceSummary } from './types';

interface MarketplaceStatusProps {
  summary: MarketplaceSummary | null;
  loading: boolean;
  showAttachActions: boolean;
}

export function MarketplaceStatus({ summary, loading }: MarketplaceStatusProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/35 py-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading marketplace…
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span className="inline-flex items-center gap-1.5 text-white/40">
        Powered by Managed Reseller
      </span>
      <span className="h-3 w-px bg-white/[0.08]" />
      <span className={`inline-flex items-center gap-1.5 font-medium ${
        summary.configured ? 'text-emerald-400' : 'text-amber-300'
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${summary.configured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        {summary.configured ? 'Active' : 'Config Pending'}
      </span>
      {summary.notes && (
        <>
          <span className="h-3 w-px bg-white/[0.08]" />
          <span className="text-white/30">{summary.notes}</span>
        </>
      )}
      {!summary.configured && (
        <>
          <span className="h-3 w-px bg-white/[0.08]" />
          <span className="text-amber-300/60">Domain search is unavailable until configuration is complete.</span>
        </>
      )}
    </div>
  );
}
