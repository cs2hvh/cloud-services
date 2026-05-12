'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ChevronDown, ChevronUp, Loader2, Search, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { SearchResults } from './domain-marketplace/search-results';
import { TldSelector } from './domain-marketplace/tld-selector';
import type { MarketplaceSummary, SearchResultItem } from './domain-marketplace/types';

type RegistrantContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

const EMPTY_CONTACT: RegistrantContact = {
  firstName: '', lastName: '', email: '', phone: '',
  companyName: '', address1: '', city: '', state: '', zip: '', country: '',
};

function contactHasData(c: RegistrantContact): boolean {
  return Object.values(c).some((v) => v.trim() !== '');
}

function toApiContact(c: RegistrantContact) {
  const trimmed = Object.fromEntries(
    Object.entries(c).map(([k, v]) => [k, v.trim()])
  ) as RegistrantContact;
  if (!contactHasData(trimmed)) return undefined;
  return Object.fromEntries(
    Object.entries(trimmed).filter(([, v]) => v !== '')
  );
}

export interface DomainMarketplaceTabProps {
  sourceAppId?: string;
  appOptions?: unknown[];
  defaultAttachAppId?: string;
  onDomainAttached?: (appId: string) => void;
  onPurchaseRequested?: () => void;
  showAttachActions?: boolean;
  modeLabel?: string;
  purchaseRequestAppIdFilter?: string;
  initialQuery?: string;
}

function normalizeDomainQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\s+/g, '');
}

function buildQuerySuggestions(value: string) {
  const normalized = normalizeDomainQuery(value);
  const seed = normalized.split('.')[0].replace(/[^a-z0-9-]/g, '');

  if (!seed || seed.length < 2) return [];

  return Array.from(
    new Set([
      seed,
      `${seed}app`,
      `${seed}cloud`,
      `${seed}hq`,
      `get${seed}`,
      `use${seed}`,
    ]),
  ).slice(0, 5);
}

export function DomainMarketplaceTab({
  sourceAppId,
  initialQuery,
  onPurchaseRequested,
}: DomainMarketplaceTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<MarketplaceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [query, setQuery] = useState(initialQuery || '');
  const [selectedTlds, setSelectedTlds] = useState<string[]>(['com', 'ai', 'io', 'app', 'dev', 'net', 'co']);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestingDomain, setRequestingDomain] = useState<string | null>(null);
  const [confirmingItem, setConfirmingItem] = useState<SearchResultItem | null>(null);
  const [contact, setContact] = useState<RegistrantContact>(EMPTY_CONTACT);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showTldPanel, setShowTldPanel] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data?.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  const normalizedQuery = useMemo(() => normalizeDomainQuery(query), [query]);
  const querySuggestions = useMemo(() => buildQuerySuggestions(query), [query]);

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch('/api/domains/market/summary');
      const data = await res.json();
      if (res.ok) setSummary(data?.data || null);
    } catch {
      // silently continue — button will stay disabled until configured
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  const lastAutoSearched = useRef<string | null>(null);
  useEffect(() => {
    const autoQuery = initialQuery?.trim();
    if (
      autoQuery &&
      summary?.configured &&
      query.trim() === autoQuery &&
      lastAutoSearched.current !== autoQuery
    ) {
      lastAutoSearched.current = autoQuery;
      void handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, summary, query]);

  const handleSearch = async ({
    syncUrl = false,
    searchValue,
  }: {
    syncUrl?: boolean;
    searchValue?: string;
  } = {}) => {
    const cleanQuery = normalizeDomainQuery(searchValue ?? query);
    if (!cleanQuery) {
      toast.error('Enter a domain keyword or full domain');
      return;
    }
    if (selectedTlds.length === 0) {
      toast.error('Select at least one TLD to search');
      return;
    }

    setSearching(true);
    setResults([]);
    try {
      lastAutoSearched.current = cleanQuery;
      const res = await fetch('/api/domains/market/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery, tlds: selectedTlds }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Domain search failed');
        return;
      }
      const items = (data?.data?.results || []) as SearchResultItem[];
      setResults(items);
      if (syncUrl) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('domain', cleanQuery);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
      if (items.length === 0) toast.info('No results for this query');
    } catch {
      toast.error('Domain search failed');
    } finally {
      setSearching(false);
    }
  };

  // Step 1: open the confirmation dialog
  const handleRequestPurchase = (domain: string) => {
    const item = results.find((r) => r.domainName === domain) ?? { domainName: domain } as SearchResultItem;
    setConfirmingItem(item);
    setContact(EMPTY_CONTACT);
    setShowContactForm(false);
  };

  // Step 2: user confirmed — fire the API
  const handleConfirmPurchase = async () => {
    if (!confirmingItem) return;
    const domain = confirmingItem.domainName;
    setRequestingDomain(domain);
    setConfirmingItem(null);
    try {
      const body: Record<string, unknown> = {
        domain,
        idempotency_key: `${sourceAppId || 'global'}:${domain}:${Date.now()}`,
      };
      if (sourceAppId) body.app_id = sourceAppId;
      const apiContact = toApiContact(contact);
      if (apiContact) body.registrant_contact = apiContact;

      const res = await fetch('/api/domains/market/purchase-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to submit request');
        return;
      }
      const contactEmail = contact.email.trim() || userEmail;
      toast.success(`Domain purchased: ${domain}`, {
        description: contactEmail
          ? `An ICANN contact verification email will be sent to ${contactEmail} — click the link before activating the domain.`
          : 'Check your email for an ICANN verification link and click it before activating the domain.',
        duration: 8000,
      });
      onPurchaseRequested?.();
    } catch {
      toast.error('Failed to submit purchase request');
    } finally {
      setRequestingDomain(null);
    }
  };

  const isSearchDisabled = searching || summaryLoading || !summary?.configured || selectedTlds.length === 0;

  return (
    <div className="space-y-4">
      <div className="glass-panel overflow-hidden">
        <div className="h-px w-full bg-gradient-to-r from-cyan-400/45 via-cyan-300/10 to-transparent" />
        <div className="grid gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
              Domain Search
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">
              Search once, then compare the strongest domain options side by side.
            </h2>

            <div className="mt-4 flex gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void handleSearch({ syncUrl: true }); }
                  }}
                  placeholder="Search domain (e.g. mybrand or mybrand.com)"
                  className="h-12 w-full border border-white/[0.08] bg-black/20 pl-11 pr-4 text-sm text-white placeholder:text-white/25 transition-colors focus:border-white/[0.18] focus:bg-black/30 focus:outline-none"
                />
              </div>
              <Button
                onClick={() => void handleSearch({ syncUrl: true })}
                disabled={isSearchDisabled}
                className="h-12 shrink-0 rounded-none border border-cyan-400/25 bg-cyan-500/90 px-7 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:bg-white/[0.07] disabled:text-white/25"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
              </Button>
            </div>

            {querySuggestions.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">
                  <Sparkles className="h-3 w-3 text-cyan-300/80" />
                  Related Searches
                </span>
                {querySuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setQuery(suggestion);
                      void handleSearch({ syncUrl: true, searchValue: suggestion });
                    }}
                    className={`border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      suggestion === normalizedQuery
                        ? 'border-cyan-400/25 bg-cyan-500/12 text-cyan-200'
                        : 'border-white/[0.07] bg-white/[0.04] text-white/55 hover:border-white/[0.14] hover:text-white/78'
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3 pt-0.5">
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {selectedTlds.map((tld) => (
                  <span
                    key={tld}
                    className="inline-flex items-center border border-white/[0.07] bg-white/[0.04] px-1.5 py-px font-mono text-[11px] font-medium text-white/40"
                  >
                    .{tld}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowTldPanel((v) => !v)}
                className={`flex shrink-0 items-center gap-1.5 text-[11px] transition-colors ${
                  showTldPanel ? 'text-white/60 hover:text-white/80' : 'text-white/35 hover:text-white/60'
                }`}
              >
                <SlidersHorizontal className="h-3 w-3" />
                {showTldPanel ? 'Hide' : 'Customize'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />
                Marketplace
              </div>
              <div className="mt-2 text-sm font-medium text-white">
                {summaryLoading ? 'Checking availability source' : summary?.configured ? 'Marketplace active' : 'Config pending'}
              </div>
              <div className="mt-1 text-sm text-white/45">
                {summary?.notes || 'Search and registration requests run through the managed registrar connection.'}
              </div>
            </div>

            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Extensions
              </div>
              <div className="mt-2 text-sm font-medium text-white">
                {selectedTlds.length} extensions selected
              </div>
              <div className="mt-1 text-sm text-white/45">
                Compare registration and renewal pricing before you request a domain.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TLD customizer */}
      <AnimatePresence>
        {showTldPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="glass-panel overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
                <h3 className="text-sm font-semibold text-white/92">TLD Filters</h3>
                <p className="mt-1 text-sm text-white/45">
                  Choose which extensions to include in this search.
                </p>
              </div>
              <div className="px-5 py-5 sm:px-6">
              <TldSelector selected={selectedTlds} onChange={setSelectedTlds} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <SearchResults
        query={normalizedQuery}
        results={results}
        searching={searching}
        selectedTlds={selectedTlds}
        requestingDomain={requestingDomain}
        onRequestPurchase={handleRequestPurchase}
      />

      {/* Purchase confirmation dialog */}
      <Dialog open={!!confirmingItem} onOpenChange={(open) => { if (!open) setConfirmingItem(null); }}>
        <DialogContent className="max-w-lg border-white/10 bg-zinc-900 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Confirm Purchase</DialogTitle>
            <DialogDescription className="text-white/55">
              <span className="font-mono font-medium text-white/85">{confirmingItem?.domainName}</span>
              {confirmingItem?.purchasePrice != null && (
                <span className="ml-2 text-white/55">
                  · ${confirmingItem.purchasePrice}/yr
                  {confirmingItem.renewalPrice != null && confirmingItem.renewalPrice !== confirmingItem.purchasePrice
                    ? ` (renews $${confirmingItem.renewalPrice}/yr)`
                    : ''}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Collapsible registrant contact */}
          <div className="mt-1 border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setShowContactForm((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-white/70 hover:bg-white/[0.04] transition-colors"
            >
              <span className="font-medium">
                Registrant Contact
                <span className="ml-2 text-[11px] font-normal text-white/40">Optional — WHOIS / ICANN records</span>
              </span>
              {showContactForm
                ? <ChevronUp className="h-4 w-4 shrink-0 text-white/40" />
                : <ChevronDown className="h-4 w-4 shrink-0 text-white/40" />}
            </button>

            {showContactForm && (
              <div className="border-t border-white/[0.07] px-4 pb-4 pt-3">
                <p className="mb-3 text-xs text-white/40">
                  Leave blank to use your account email and platform address defaults.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['firstName', 'First Name', 'col-span-1'],
                    ['lastName', 'Last Name', 'col-span-1'],
                    ['email', 'Email', 'col-span-2'],
                    ['phone', 'Phone (e.g. +1.2025551234)', 'col-span-1'],
                    ['companyName', 'Company (optional)', 'col-span-1'],
                    ['address1', 'Address', 'col-span-2'],
                    ['city', 'City', 'col-span-1'],
                    ['state', 'State / Province', 'col-span-1'],
                    ['zip', 'ZIP / Postal Code', 'col-span-1'],
                    ['country', 'Country Code (e.g. US)', 'col-span-1'],
                  ] as const).map(([field, label, span]) => (
                    <div key={field} className={span}>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
                        {label}
                      </label>
                      <input
                        type={field === 'email' ? 'email' : 'text'}
                        value={contact[field]}
                        onChange={(e) => setContact((prev) => ({ ...prev, [field]: e.target.value }))}
                        className="h-9 w-full border border-white/[0.08] bg-black/20 px-3 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-none border-white/10 text-white hover:bg-white/[0.06]"
              onClick={() => setConfirmingItem(null)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-none bg-cyan-500/90 text-slate-950 hover:bg-cyan-400"
              onClick={() => void handleConfirmPurchase()}
            >
              Confirm Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
