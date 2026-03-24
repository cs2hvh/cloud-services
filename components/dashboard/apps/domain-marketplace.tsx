'use client';

import { useEffect, useMemo, useState } from 'react';
import { type DomainAppOption } from '@/components/dashboard/domains/domain-attach-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, Globe, Loader2, Search, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { MarketplaceStatus } from './domain-marketplace/marketplace-status';
import { SearchResults } from './domain-marketplace/search-results';
import { PurchaseRequests } from './domain-marketplace/purchase-requests';
import { TldSelector } from './domain-marketplace/tld-selector';
import type { MarketplaceSummary, PurchaseRequest, SearchResultItem } from './domain-marketplace/types';

export interface DomainMarketplaceTabProps {
  sourceAppId?: string;
  appOptions?: DomainAppOption[];
  defaultAttachAppId?: string;
  onDomainAttached?: (appId: string) => void;
  showAttachActions?: boolean;
  modeLabel?: string;
  purchaseRequestAppIdFilter?: string;
}

export function DomainMarketplaceTab({
  sourceAppId,
  appOptions,
  defaultAttachAppId,
  onDomainAttached,
  showAttachActions = true,
  modeLabel = 'Search and purchase domains',
  purchaseRequestAppIdFilter,
}: DomainMarketplaceTabProps) {
  const [summary, setSummary] = useState<MarketplaceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedTlds, setSelectedTlds] = useState<string[]>(['com', 'ai', 'io', 'app', 'dev', 'net', 'co']);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestingDomain, setRequestingDomain] = useState<string | null>(null);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [tldSelectorOpen, setTldSelectorOpen] = useState(true);

  const attachOptions = useMemo(
    () =>
      appOptions && appOptions.length > 0
        ? appOptions
        : sourceAppId
          ? [{ id: sourceAppId, name: 'Selected App', status: 'selected' }]
          : [],
    [appOptions, sourceAppId]
  );

  // ── Data fetching ──────────────────────────────────────────────────────

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch('/api/domains/market/summary');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to load marketplace summary');
        return;
      }
      setSummary(data?.data || null);
    } catch {
      toast.error('Failed to load marketplace summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadPurchaseRequests = async () => {
    setRequestsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (purchaseRequestAppIdFilter) params.set('app_id', purchaseRequestAppIdFilter);
      const res = await fetch(`/api/domains/market/purchase-requests?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to load purchase requests');
        setRequests([]);
        return;
      }
      setRequests((data?.data || []) as PurchaseRequest[]);
    } catch {
      toast.error('Failed to load purchase requests');
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
    void loadPurchaseRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseRequestAppIdFilter]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSearch = async () => {
    const cleanQuery = query.trim();
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
      if (items.length === 0) toast.info('No domain suggestions returned for this query');
    } catch {
      toast.error('Domain search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleRequestPurchase = async (domain: string) => {
    setRequestingDomain(domain);
    try {
      const requestBody: { app_id?: string; domain: string; idempotency_key: string } = {
        domain,
        idempotency_key: `${sourceAppId || 'global'}:${domain}:${Date.now()}`,
      };
      if (sourceAppId) requestBody.app_id = sourceAppId;

      const res = await fetch('/api/domains/market/purchase-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to create purchase request');
        return;
      }
      toast.success(`Purchase request submitted for ${domain}`);
      await loadPurchaseRequests();
    } catch {
      toast.error('Failed to create purchase request');
    } finally {
      setRequestingDomain(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          AhuraCloud Domain Marketplace
        </CardTitle>
        <CardDescription className="text-white/50">{modeLabel}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">

        <MarketplaceStatus
          summary={summary}
          loading={summaryLoading}
          showAttachActions={showAttachActions}
        />

        {/* Search bar */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSearch(); } }}
              placeholder="Brand keyword or full domain (e.g. mybrand or mybrand.com)"
              className="bg-black/30 border-white/10"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={searching || summaryLoading || !summary?.configured || selectedTlds.length === 0}
          >
            {searching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Search
          </Button>
        </div>

        {/* TLD selector (collapsible) */}
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setTldSelectorOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-black/25 hover:bg-black/35 transition-colors"
          >
            <span className="text-sm font-medium text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-300" />
              TLD Filter
              <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-500/30 text-[10px] px-1.5 py-0 ml-1">
                {selectedTlds.length} selected
              </Badge>
            </span>
            {tldSelectorOpen
              ? <ChevronUp className="w-4 h-4 text-white/40" />
              : <ChevronDown className="w-4 h-4 text-white/40" />}
          </button>
          {tldSelectorOpen && (
            <div className="p-4 bg-black/10">
              <TldSelector selected={selectedTlds} onChange={setSelectedTlds} />
            </div>
          )}
        </div>

        <SearchResults
          results={results}
          searching={searching}
          selectedTldCount={selectedTlds.length}
          requestingDomain={requestingDomain}
          onRequestPurchase={handleRequestPurchase}
        />

        <PurchaseRequests
          requests={requests}
          loading={requestsLoading}
          showAttachActions={showAttachActions}
          attachOptions={attachOptions}
          defaultAttachAppId={defaultAttachAppId}
          purchaseRequestAppIdFilter={purchaseRequestAppIdFilter}
          onRefresh={() => void loadPurchaseRequests()}
          onDomainAttached={onDomainAttached}
        />

      </CardContent>
    </Card>
  );
}
