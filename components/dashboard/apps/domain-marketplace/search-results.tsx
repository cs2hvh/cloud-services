import { Globe, Loader2, ShoppingCart, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

import { Button } from '@/components/ui/button';

import type { SearchResultItem } from './types';

function formatPrice(value: number | null, currency: string) {
  if (value === null) return 'N/A';
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  return `${prefix}${value}`;
}

interface SearchResultsProps {
  results: SearchResultItem[];
  searching: boolean;
  selectedTldCount: number;
  requestingDomain: string | null;
  onRequestPurchase: (domain: string) => void;
}

function SearchSkeleton({ count }: { count: number }) {
  const rows = Math.min(Math.max(count, 3), 8);

  return (
    <div className="glass-panel overflow-hidden">
      <div className="h-px w-full bg-gradient-to-r from-cyan-400/35 via-cyan-300/10 to-transparent" />
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div>
          <div className="h-4 w-28 animate-pulse bg-white/[0.06]" />
          <div className="mt-2 h-3 w-44 animate-pulse bg-white/[0.05]" />
        </div>
        <div className="h-8 w-28 animate-pulse border border-white/[0.06] bg-white/[0.04]" />
      </div>

      <div>
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-t border-white/[0.04] px-5 py-3.5 first:border-0 sm:px-6"
          >
            <div
              className="h-4 w-40 animate-pulse bg-white/[0.06]"
              style={{ animationDelay: `${index * 60}ms` }}
            />
            <div
              className="ml-2 h-3.5 w-16 animate-pulse bg-white/[0.06]"
              style={{ animationDelay: `${index * 60 + 30}ms` }}
            />
            <div className="flex-1" />
            <div className="h-3.5 w-10 animate-pulse bg-white/[0.06]" />
            <div className="hidden h-3.5 w-10 animate-pulse bg-white/[0.06] sm:block" />
            <div className="h-8 w-24 animate-pulse border border-white/[0.06] bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}

const rowVariants = {
  hidden: { opacity: 0, y: 5 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18 } },
};

export function SearchResults({
  results,
  searching,
  selectedTldCount,
  requestingDomain,
  onRequestPurchase,
}: SearchResultsProps) {
  if (searching) {
    return <SearchSkeleton count={selectedTldCount} />;
  }

  if (results.length === 0) {
    return (
      <div className="glass-panel overflow-hidden">
        <div className="h-px w-full bg-gradient-to-r from-cyan-400/30 via-cyan-300/5 to-transparent" />
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <Globe className="mb-3 h-7 w-7 text-cyan-300/50" />
          <p className="text-sm font-medium text-white/72">Search for a domain</p>
          <p className="mt-1 max-w-sm text-sm leading-6 text-white/38">
            Start with a keyword or full domain to compare availability, registration price, and renewal cost.
          </p>
        </div>
      </div>
    );
  }

  const orderedResults = [...results].sort((a, b) => {
    if (a.available === b.available) return 0;
    return a.available ? -1 : 1;
  });
  const availableCount = orderedResults.filter((result) => result.available).length;

  return (
    <div className="glass-panel overflow-hidden">
      <div className="h-px w-full bg-gradient-to-r from-cyan-400/35 via-cyan-300/10 to-transparent" />
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/34">
            Availability
          </p>
          <p className="mt-1 text-sm font-medium text-white">
            Compare registration and renewal pricing before you submit a request.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="tabular-nums text-white/35">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
          {availableCount > 0 && (
            <>
              <span className="h-3 w-px bg-white/[0.08]" />
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)] animate-pulse" />
                {availableCount} available
              </span>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.04] bg-white/[0.02] text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25">
              <th className="px-5 py-3 text-left sm:px-6">Domain</th>
              <th className="w-24 px-5 py-3 text-left sm:px-6">Status</th>
              <th className="w-28 px-5 py-3 text-right sm:px-6">Register</th>
              <th className="hidden w-28 px-5 py-3 text-right sm:table-cell sm:px-6">Renew/yr</th>
              <th className="w-36 px-5 py-3 text-right sm:px-6" />
            </tr>
          </thead>
          <motion.tbody
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          >
            {orderedResults.map((result) => {
              const requesting = requestingDomain === result.domainName;

              return (
                <motion.tr
                  key={result.domainName}
                  variants={rowVariants}
                  className={`border-t border-white/[0.03] transition-colors ${
                    result.available ? 'hover:bg-cyan-400/[0.035]' : 'opacity-40'
                  }`}
                >
                  <td className="px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-white">
                        {result.domainName}
                      </span>
                      {result.premium && (
                        <span className="inline-flex items-center gap-1 border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          <Sparkles className="h-2.5 w-2.5" />
                          Premium
                        </span>
                      )}
                    </div>
                    {result.reason && !result.available && (
                      <p className="mt-0.5 text-[10px] text-white/25">{result.reason}</p>
                    )}
                  </td>

                  <td className="px-5 py-4 sm:px-6">
                    {result.available ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]" />
                        Available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-white/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
                        Taken
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-4 text-right sm:px-6">
                    <span
                      className={`tabular-nums text-sm font-semibold ${
                        result.available ? 'text-white' : 'text-white/40'
                      }`}
                    >
                      {formatPrice(result.purchasePrice, result.currency)}
                    </span>
                  </td>

                  <td className="hidden px-5 py-4 text-right sm:table-cell sm:px-6">
                    <span className="tabular-nums text-xs text-white/35">
                      {formatPrice(result.renewalPrice, result.currency)}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-right sm:px-6">
                    {result.available && (
                      <Button
                        size="sm"
                        onClick={() => onRequestPurchase(result.domainName)}
                        disabled={requesting}
                        className="h-8 border border-cyan-400/20 bg-cyan-500/90 px-3 text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-cyan-400 disabled:border-white/[0.08] disabled:bg-white/[0.06] disabled:text-white/30"
                      >
                        {requesting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <ShoppingCart className="mr-1.5 h-3 w-3" />
                            Request
                          </>
                        )}
                      </Button>
                    )}
                  </td>
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>

      <div className="grid gap-3 border-t border-white/[0.06] px-5 py-4 sm:px-6 lg:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/32">
            Registration
          </p>
          <p className="mt-1 text-sm text-white/48">
            Review first-year pricing inline before sending a purchase request.
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/32">
            Renewal
          </p>
          <p className="mt-1 text-sm text-white/48">
            Renewal pricing stays visible so long-term cost is easy to compare.
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/32">
            Next Step
          </p>
          <p className="mt-1 text-sm text-white/48">
            Continue DNS, routing, and app attachment from the Domains page after purchase.
          </p>
        </div>
      </div>
    </div>
  );
}
