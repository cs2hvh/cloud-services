import { Globe, Loader2, ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SearchResultItem } from './types';

interface SearchResultsProps {
  results: SearchResultItem[];
  searching: boolean;
  selectedTldCount: number;
  requestingDomain: string | null;
  onRequestPurchase: (domain: string) => void;
}

function ResultRow({
  result,
  requesting,
  onRequestPurchase,
}: {
  result: SearchResultItem;
  requesting: boolean;
  onRequestPurchase: (domain: string) => void;
}) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border p-4 transition-colors ${
        result.available
          ? 'border-green-500/20 bg-green-500/5 hover:bg-green-500/10'
          : 'border-white/8 bg-black/20 opacity-60'
      }`}
    >
      <div className="space-y-1.5">
        <div className="flex items-center flex-wrap gap-2">
          <p className="text-sm font-semibold text-white">{result.domainName}</p>
          {result.available ? (
            <Badge className="bg-green-500/20 text-green-300 border-green-500/30">Available</Badge>
          ) : (
            <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Taken</Badge>
          )}
          {result.premium && (
            <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">Premium</Badge>
          )}
        </div>

        <div className="text-xs text-white/50 flex flex-wrap gap-3">
          <span>
            Register:{' '}
            <span className="text-white/70 font-medium">
              {result.purchasePrice !== null ? `$${result.purchasePrice}` : 'N/A'}
            </span>
          </span>
          <span>
            Renew:{' '}
            <span className="text-white/70">
              {result.renewalPrice !== null ? `$${result.renewalPrice}/yr` : 'N/A'}
            </span>
          </span>
          {result.reason && <span className="text-white/35">{result.reason}</span>}
        </div>
      </div>

      <Button
        size="sm"
        onClick={() => onRequestPurchase(result.domainName)}
        disabled={!result.available || requesting}
        className="shrink-0"
      >
        {requesting ? (
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        ) : (
          <ShoppingCart className="w-4 h-4 mr-1.5" />
        )}
        Request Purchase
      </Button>
    </div>
  );
}

export function SearchResults({
  results,
  searching,
  selectedTldCount,
  requestingDomain,
  onRequestPurchase,
}: SearchResultsProps) {
  const orderedResults = [...results].sort((a, b) => {
    if (a.available === b.available) return 0;
    return a.available ? -1 : 1;
  });

  const availableCount = orderedResults.filter((r) => r.available).length;

  if (searching) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/60 py-4 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        {`Searching across ${selectedTldCount} TLDs`}
      </div>
    );
  }

  if (orderedResults.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/40 border border-dashed border-white/15 rounded-lg p-5 justify-center">
        <Globe className="w-4 h-4" />
        Run a search to see domain suggestions and pricing.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-white/50 pb-1">
        <span className="text-green-400 font-medium">{availableCount} available</span>
        <span>·</span>
        <span>{orderedResults.length - availableCount} taken</span>
        <span>·</span>
        <span>{orderedResults.length} total</span>
      </div>

      <div className="grid gap-2">
        {orderedResults.map((result) => (
          <ResultRow
            key={result.domainName}
            result={result}
            requesting={requestingDomain === result.domainName}
            onRequestPurchase={onRequestPurchase}
          />
        ))}
      </div>
    </div>
  );
}
