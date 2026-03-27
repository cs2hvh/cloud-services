import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MarketplaceSummary } from './types';

interface MarketplaceStatusProps {
  summary: MarketplaceSummary | null;
  loading: boolean;
  showAttachActions: boolean;
}

export function MarketplaceStatus({ summary, loading, showAttachActions }: MarketplaceStatusProps) {
  return (
    <div className="space-y-3">
      {/* Status banner */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading marketplace status
          </div>
        ) : summary ? (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-500/30">
                Managed Reseller
              </Badge>
              <Badge
                className={
                  summary.configured
                    ? 'bg-green-500/20 text-green-200 border-green-500/30'
                    : 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30'
                }
              >
                {summary.configured ? 'Active' : 'Config Pending'}
              </Badge>
            </div>
            <p className="text-xs text-white/50">{summary.notes}</p>
          </div>
        ) : (
          <p className="text-xs text-white/50">Marketplace status unavailable.</p>
        )}
      </div>

      {/* Flow hint */}
      <div className="rounded-lg border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/5 p-3">
        <p className="text-xs uppercase tracking-wide text-cyan-200/70 mb-0.5">How it works</p>
        <p className="text-sm text-white/80">
          {showAttachActions
            ? '1. Pick TLDs  2. Search  3. Request Purchase  4. Attach to App'
            : '1. Pick TLDs  2. Search  3. Request Purchase  (attach later)'}
        </p>
      </div>
    </div>
  );
}
