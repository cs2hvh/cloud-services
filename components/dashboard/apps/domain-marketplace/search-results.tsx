import { useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShoppingCart,
  Sparkles,
  Tag,
} from 'lucide-react';
import { motion } from 'motion/react';

import { Button } from '@/components/ui/button';
import { TLD_CATEGORIES } from './tld-data';
import type { SearchResultItem } from './types';

function formatPrice(value: number | null, currency: string) {
  if (value === null) return 'N/A';
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  return `${prefix}${value}`;
}

function getTld(domainName: string) {
  const [, ...parts] = domainName.split('.');
  return parts.join('.');
}

function getTldCategoryLabel(tld: string) {
  const match = TLD_CATEGORIES.find((category) => category.tlds.includes(tld));
  return match?.label ?? 'Other';
}

type SortMode = 'relevance' | 'price' | 'renewal' | 'alpha';

interface SearchResultsProps {
  query: string;
  results: SearchResultItem[];
  searching: boolean;
  selectedTlds: string[];
  requestingDomain: string | null;
  onRequestPurchase: (domain: string) => void;
}

function SearchSkeleton({ count }: { count: number }) {
  const rows = Math.min(Math.max(count, 4), 8);

  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
      <div className="h-px w-full bg-gradient-to-r from-[#0095FF]/35 via-[#0095FF]/10 to-transparent" />
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div>
          <div className="h-4 w-28 animate-pulse bg-white/[0.06]" />
          <div className="mt-2 h-3 w-52 animate-pulse bg-white/[0.05]" />
        </div>
        <div className="h-8 w-28 animate-pulse border border-white/[0.06] bg-white/[0.04]" />
      </div>

      <div className="space-y-0">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="grid items-center gap-4 border-t border-white/[0.04] px-5 py-4 first:border-0 md:grid-cols-[minmax(0,1fr)_120px_150px]"
          >
            <div>
              <div
                className="h-4 w-44 animate-pulse bg-white/[0.06]"
                style={{ animationDelay: `${index * 60}ms` }}
              />
              <div
                className="mt-2 h-3 w-36 animate-pulse bg-white/[0.05]"
                style={{ animationDelay: `${index * 60 + 20}ms` }}
              />
            </div>
            <div className="h-3.5 w-16 animate-pulse bg-white/[0.06]" />
            <div className="ml-auto h-8 w-28 animate-pulse border border-white/[0.06] bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  caption,
  count,
  action,
}: {
  title: string;
  caption: string;
  count: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-1 text-sm text-white/42">{caption}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs tabular-nums text-white/35">
          {count} option{count !== 1 ? 's' : ''}
        </span>
        {action}
      </div>
    </div>
  );
}

function ResultRow({
  item,
  featured,
  requesting,
  onRequestPurchase,
}: {
  item: SearchResultItem;
  featured?: boolean;
  requesting: boolean;
  onRequestPurchase: (domain: string) => void;
}) {
  const tld = getTld(item.domainName);
  const tldCategory = getTldCategoryLabel(tld);

  return (
    <motion.div
      layout
      className={`grid gap-4 border-t border-white/[0.04] px-5 py-4 first:border-0 md:grid-cols-[minmax(0,1.2fr)_180px_150px] md:items-center sm:px-6 ${
        item.available ? 'hover:bg-[#0095FF]/[0.03]' : 'opacity-45'
      } transition-colors`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {item.available ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
          ) : (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white/18" />
          )}
          <span className="truncate font-mono text-sm font-medium text-white">{item.domainName}</span>
          {featured && (
            <span className="inline-flex items-center gap-1 border border-[#0095FF]/20 bg-[#0095FF]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#82adfb]">
              <Sparkles className="h-2.5 w-2.5" />
              Best match
            </span>
          )}
          {item.premium && (
            <span className="inline-flex items-center gap-1 border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
              <Tag className="h-2.5 w-2.5" />
              Premium
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/38">
          <span className="border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-white/58">
            .{tld}
          </span>
          <span>{tldCategory}</span>
          {item.purchaseType && <span className="capitalize">{item.purchaseType}</span>}
          {!item.available && item.reason && <span>{item.reason}</span>}
        </div>
      </div>

      <div className="md:text-right">
        <div className={`text-lg font-semibold tabular-nums ${item.available ? 'text-white' : 'text-white/40'}`}>
          {formatPrice(item.purchasePrice, item.currency)}
        </div>
        <div className="mt-1 text-xs text-white/38">
          Renews at {formatPrice(item.renewalPrice, item.currency)}
        </div>
      </div>

      <div className="flex md:justify-end">
        {item.available ? (
          <Button
            size="sm"
            onClick={() => onRequestPurchase(item.domainName)}
            disabled={requesting}
            className="h-9 min-w-[124px] rounded-none border border-[#0095FF]/20 bg-[#0095FF] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#0095FF] disabled:border-white/[0.08] disabled:bg-white/[0.06] disabled:text-white/30"
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
        ) : (
          <span className="inline-flex h-9 min-w-[124px] items-center justify-center border border-white/[0.08] px-3 text-xs font-medium text-white/32">
            Unavailable
          </span>
        )}
      </div>
    </motion.div>
  );
}

export function SearchResults({
  query,
  results,
  searching,
  selectedTlds,
  requestingDomain,
  onRequestPurchase,
}: SearchResultsProps) {
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [showUnavailable, setShowUnavailable] = useState(false);

  const sortedResults = useMemo(() => {
    const selectedOrder = new Map(selectedTlds.map((tld, index) => [tld, index]));
    const fullQuery = query.includes('.') ? query : '';

    return [...results].sort((first, second) => {
      const firstTld = getTld(first.domainName);
      const secondTld = getTld(second.domainName);

      if (sortMode === 'price') {
        return (first.purchasePrice ?? Number.MAX_SAFE_INTEGER) - (second.purchasePrice ?? Number.MAX_SAFE_INTEGER);
      }

      if (sortMode === 'renewal') {
        return (first.renewalPrice ?? Number.MAX_SAFE_INTEGER) - (second.renewalPrice ?? Number.MAX_SAFE_INTEGER);
      }

      if (sortMode === 'alpha') {
        return first.domainName.localeCompare(second.domainName);
      }

      const firstExactScore =
        fullQuery && first.domainName === fullQuery ? -100 : selectedOrder.get(firstTld) ?? 50;
      const secondExactScore =
        fullQuery && second.domainName === fullQuery ? -100 : selectedOrder.get(secondTld) ?? 50;

      if (first.available !== second.available) return first.available ? -1 : 1;
      if (first.premium !== second.premium) return first.premium ? 1 : -1;
      if (firstExactScore !== secondExactScore) return firstExactScore - secondExactScore;
      return (first.purchasePrice ?? Number.MAX_SAFE_INTEGER) - (second.purchasePrice ?? Number.MAX_SAFE_INTEGER);
    });
  }, [query, results, selectedTlds, sortMode]);

  const featuredResults = sortedResults.filter((item) => item.available && !item.premium);
  const premiumResults = sortedResults.filter((item) => item.available && item.premium);
  const unavailableResults = sortedResults.filter((item) => !item.available);

  if (searching) {
    return <SearchSkeleton count={selectedTlds.length} />;
  }

  if (results.length === 0) {
    return <EmptySearchState />;
  }

  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
      <div className="h-px w-full bg-gradient-to-r from-[#0095FF]/35 via-[#0095FF]/10 to-transparent" />
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/34">
            Search Results
          </p>
          <p className="mt-1 text-sm font-medium text-white">
            Best matches, premium options, and unavailable names are grouped separately.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-white/35">Sort</span>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-9 border border-white/[0.08] bg-black/20 px-3 text-xs text-white focus:border-white/[0.16] focus:outline-none"
          >
            <option value="relevance">Relevance</option>
            <option value="price">Lowest price</option>
            <option value="renewal">Lowest renewal</option>
            <option value="alpha">A-Z</option>
          </select>
        </div>
      </div>

      {featuredResults.length > 0 && (
        <div>
          <SectionHeader
            title="Best matches"
            caption="Strongest available options from your selected extensions."
            count={featuredResults.length}
          />
          <div>
            {featuredResults.map((item, index) => (
              <ResultRow
                key={item.domainName}
                item={item}
                featured={index === 0}
                requesting={requestingDomain === item.domainName}
                onRequestPurchase={onRequestPurchase}
              />
            ))}
          </div>
        </div>
      )}

      {premiumResults.length > 0 && (
        <div className="border-t border-white/[0.06]">
          <SectionHeader
            title="Premium names"
            caption="Higher-value domains that still match this search."
            count={premiumResults.length}
          />
          <div>
            {premiumResults.map((item) => (
              <ResultRow
                key={item.domainName}
                item={item}
                requesting={requestingDomain === item.domainName}
                onRequestPurchase={onRequestPurchase}
              />
            ))}
          </div>
        </div>
      )}

      {unavailableResults.length > 0 && (
        <div className="border-t border-white/[0.06]">
          <SectionHeader
            title="Taken names"
            caption="Close matches that are currently unavailable."
            count={unavailableResults.length}
            action={
              <button
                type="button"
                onClick={() => setShowUnavailable((value) => !value)}
                className="inline-flex items-center gap-1.5 text-xs text-white/42 transition-colors hover:text-white/72"
              >
                {showUnavailable ? 'Hide' : 'Show'}
                {showUnavailable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            }
          />
          {showUnavailable && (
            <div>
              {unavailableResults.map((item) => (
                <ResultRow
                  key={item.domainName}
                  item={item}
                  requesting={false}
                  onRequestPurchase={onRequestPurchase}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Empty state — premium editorial card with custom illustration
   ────────────────────────────────────────────────────────────── */

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';

function EmptySearchState() {
    const popularTlds = ['.com', '.ai', '.io', '.dev', '.app', '.co', '.xyz', '.cloud'];
    return (
        <div
            className="relative overflow-hidden rounded-[12px] border border-white/[0.10] bg-[#0F1114]"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 60px -32px rgba(0,0,0,0.7)' }}
        >
            {/* Decoration layers */}
            <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-[#0095FF]/[0.08] blur-3xl" />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
                style={{
                    backgroundImage:
                        'radial-gradient(circle at 1px 1px, rgba(255,255,255,1) 1px, transparent 0)',
                    backgroundSize: '20px 20px',
                }}
            />
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#0095FF]/40 to-transparent" />

            <div className="relative grid grid-cols-1 gap-10 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16 lg:px-14 lg:py-20">
                {/* Left — title + chips */}
                <div>
                    <p className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/55`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                        Start a search
                    </p>
                    <h3 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.015em] text-white sm:text-[34px]">
                        Type a keyword,
                        <br />
                        see every match.
                    </h3>
                    <p className="mt-4 max-w-[440px] text-[13.5px] leading-[1.65] text-white/55">
                        Drop in a keyword (<span className="text-white/80">brandname</span>) or a
                        full domain (<span className="text-white/80">brand.dev</span>) — we look up
                        availability across 500+ TLDs, with pricing, premium status, and renewal
                        cost surfaced upfront.
                    </p>

                    <div className="mt-7">
                        <p className={`${MONO} mb-3 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/40`}>
                            Popular extensions
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {popularTlds.map((tld) => (
                                <span
                                    key={tld}
                                    className={`${MONO} inline-flex items-center rounded-[4px] border border-white/[0.10] bg-white/[0.03] px-2.5 py-1 text-[11px] tabular-nums text-white/70`}
                                >
                                    {tld}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right — illustration */}
                <div className="relative mx-auto w-full max-w-[420px] lg:mx-0">
                    {/* Mock search input + popping result cards */}
                    <div
                        className="relative rounded-[10px] border border-white/[0.10] bg-[#0B0D10] p-5"
                        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 16px 40px -20px rgba(0,0,0,0.6)' }}
                    >
                        {/* Mock search bar */}
                        <div className="flex items-center gap-2.5 rounded-[6px] border border-white/[0.10] bg-white/[0.02] px-3 py-2.5">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#0095FF" strokeWidth={1.8} className="h-4 w-4">
                                <circle cx="10.5" cy="10.5" r="6.5" />
                                <path d="M15.5 15.5L20 20" strokeLinecap="round" />
                            </svg>
                            <span className={`${MONO} text-[12.5px] text-white/85`}>brand</span>
                            <span
                                className="ml-0.5 inline-block h-3 w-[1.5px] animate-pulse bg-[#0095FF]"
                                aria-hidden
                            />
                            <span className={`${MONO} ml-auto text-[10px] uppercase tracking-[0.14em] text-white/30`}>
                                ↵
                            </span>
                        </div>

                        {/* Mock result rows */}
                        <div className="mt-3 flex flex-col gap-1.5">
                            {[
                                { name: 'brand.com', tag: 'Premium', price: '$2,490', highlight: false, available: true },
                                { name: 'brand.ai', tag: 'Available', price: '$89/yr', highlight: true, available: true },
                                { name: 'brand.io', tag: 'Available', price: '$42/yr', highlight: false, available: true },
                                { name: 'brand.dev', tag: 'Available', price: '$15/yr', highlight: false, available: true },
                                { name: 'brand.app', tag: 'Taken', price: '—', highlight: false, available: false },
                            ].map((r) => (
                                <div
                                    key={r.name}
                                    className={`flex items-center justify-between gap-3 rounded-[6px] px-3 py-2.5 ${
                                        r.highlight
                                            ? 'border border-[#0095FF]/30 bg-[#0095FF]/[0.08]'
                                            : 'border border-white/[0.06] bg-white/[0.02]'
                                    }`}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        {r.available ? (
                                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                                        ) : (
                                            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                                        )}
                                        <span className={`${MONO} truncate text-[12px] ${r.available ? 'text-white/90' : 'text-white/35 line-through'}`}>
                                            {r.name}
                                        </span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2.5">
                                        <span className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] ${
                                            r.highlight ? 'text-[#0095FF]' : r.available ? 'text-white/45' : 'text-white/30'
                                        }`}>
                                            {r.tag}
                                        </span>
                                        <span className={`${MONO} text-[11.5px] tabular-nums ${r.available ? 'text-white/85' : 'text-white/30'}`}>
                                            {r.price}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Floating result chip */}
                    <div
                        className={`${MONO} absolute -right-2 -top-2 inline-flex items-center gap-1.5 rounded-full bg-[#0095FF] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white shadow-[0_8px_20px_-6px_rgba(0,149,255,0.5)]`}
                    >
                        <span className="h-1 w-1 rounded-full bg-white" />
                        Live preview
                    </div>
                </div>
            </div>
        </div>
    );
}
