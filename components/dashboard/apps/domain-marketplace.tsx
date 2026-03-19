'use client';

import { useEffect, useMemo, useState } from 'react';
import { DomainAttachAction, type DomainAppOption } from '@/components/dashboard/domains/domain-attach-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Globe, Loader2, Search, ShoppingCart, Clock3 } from 'lucide-react';
import { toast } from 'sonner';

interface MarketplaceSummary {
  channel: 'ahuracloud';
  configured: boolean;
  mode: 'managed_reseller';
  capabilities: {
    search: true;
    purchase_requests: true;
    auto_fulfillment: boolean;
  };
  notes: string;
}

interface SearchResultItem {
  domainName: string;
  available: boolean;
  premium: boolean;
  purchasePrice: number | null;
  renewalPrice: number | null;
  currency: string;
  purchaseType: string | null;
  reason: string | null;
  fulfillment: 'ahuracloud';
}

interface PurchaseRequest {
  id: string;
  domain: string;
  app_id: string | null;
  status: 'requested' | 'processing' | 'completed' | 'failed' | 'cancelled';
  purchase_price: number | null;
  renewal_price: number | null;
  currency: string;
  created_at: string;
  last_error: string | null;
}

interface DomainMarketplaceTabProps {
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
  const [tldsInput, setTldsInput] = useState('com,io,app,dev,net');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestingDomain, setRequestingDomain] = useState<string | null>(null);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const attachOptions = useMemo(
    () => appOptions && appOptions.length > 0
      ? appOptions
      : sourceAppId
        ? [{ id: sourceAppId, name: 'Selected App', status: 'selected' }]
        : [],
    [appOptions, sourceAppId]
  );

  const parsedTlds = useMemo(
    () =>
      tldsInput
        .split(',')
        .map((item) => item.trim().replace(/^\./, '').toLowerCase())
        .filter(Boolean)
        .slice(0, 15),
    [tldsInput]
  );

  const orderedResults = useMemo(
    () =>
      [...results].sort((a, b) => {
        if (a.available === b.available) return 0;
        return a.available ? -1 : 1;
      }),
    [results]
  );

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
    } catch (error) {
      console.error('Error loading marketplace summary:', error);
      toast.error('Failed to load marketplace summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadPurchaseRequests = async () => {
    setRequestsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '15' });
      if (purchaseRequestAppIdFilter) {
        params.set('app_id', purchaseRequestAppIdFilter);
      }

      const res = await fetch(`/api/domains/market/purchase-requests?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to load purchase requests');
        setRequests([]);
        return;
      }

      setRequests((data?.data || []) as PurchaseRequest[]);
    } catch (error) {
      console.error('Error loading purchase requests:', error);
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

  const handleSearch = async () => {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      toast.error('Enter a domain keyword or full domain');
      return;
    }

    setSearching(true);
    try {
      const res = await fetch('/api/domains/market/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: cleanQuery,
          tlds: parsedTlds,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Domain search failed');
        setResults([]);
        return;
      }

      setResults((data?.data?.results || []) as SearchResultItem[]);
      if ((data?.data?.results || []).length === 0) {
        toast.info('No domain suggestions returned for this query');
      }
    } catch (error) {
      console.error('Domain search failed:', error);
      toast.error('Domain search failed');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const applyTldPreset = (tld: string) => {
    const next = new Set(parsedTlds);
    if (next.has(tld)) {
      next.delete(tld);
    } else {
      next.add(tld);
    }
    setTldsInput(Array.from(next).join(','));
  };

  const handleRequestPurchase = async (domain: string) => {
    setRequestingDomain(domain);
    try {
      const requestBody: { app_id?: string; domain: string; idempotency_key: string } = {
        domain,
        idempotency_key: `${sourceAppId || 'global'}:${domain}:${Date.now()}`,
      };
      if (sourceAppId) {
        requestBody.app_id = sourceAppId;
      }

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

      toast.success(`Purchase request submitted for ${domain}.`);
      await loadPurchaseRequests();
    } catch (error) {
      console.error('Failed to request purchase:', error);
      toast.error('Failed to create purchase request');
    } finally {
      setRequestingDomain(null);
    }
  };

  const statusBadge = (status: PurchaseRequest['status']) => {
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
  };

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          AhuraCloud Domain Marketplace
        </CardTitle>
        <CardDescription className="text-white/50">
          {modeLabel}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-lg border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/5 p-3">
          <p className="text-xs uppercase tracking-wide text-cyan-200/80">Fast Flow</p>
          <p className="text-sm text-white mt-1">
            {showAttachActions
              ? 'Search domain, request purchase, then attach it in the Domains tab.'
              : 'Search domain and submit purchase requests. App connection can be done later.'}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          {summaryLoading ? (
            <div className="flex items-center gap-2 text-xs text-white/60">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading marketplace status...
            </div>
          ) : summary ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-500/30">Managed Reseller</Badge>
                <Badge className={summary.configured ? 'bg-green-500/20 text-green-200 border-green-500/30' : 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30'}>
                  {summary.configured ? 'Active' : 'Configuration Pending'}
                </Badge>
              </div>
              <p className="text-xs text-white/55">{summary.notes}</p>
            </div>
          ) : (
            <p className="text-xs text-white/55">Marketplace status unavailable.</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-3">
          <div className="space-y-2">
            <label className="text-xs text-white/60">Keyword or full domain</label>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSearch();
                }
              }}
              placeholder="mybrand or mybrand.com"
              className="bg-black/30 border-white/10"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-white/60">TLD filters</label>
            <Input
              value={tldsInput}
              onChange={(event) => setTldsInput(event.target.value)}
              placeholder="com,io,app"
              className="bg-black/30 border-white/10"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['com', 'io', 'app', 'dev', 'net'].map((tld) => {
                const active = parsedTlds.includes(tld);
                return (
                  <button
                    key={tld}
                    type="button"
                    onClick={() => applyTldPreset(tld)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                      active
                        ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                        : 'border-white/15 bg-black/20 text-white/60 hover:text-white'
                    }`}
                  >
                    .{tld}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-end">
            <Button
              onClick={handleSearch}
              disabled={searching || summaryLoading || !summary?.configured}
              className="w-full md:w-auto"
            >
              {searching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Search
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {orderedResults.length === 0 ? (
            <div className="text-sm text-white/40 border border-dashed border-white/15 rounded-md p-4">
              <Globe className="w-4 h-4 inline-block mr-2" />
              Run a search to see domain suggestions and pricing.
            </div>
          ) : (
            <>
              <p className="text-xs text-white/50">
                {orderedResults.filter((item) => item.available).length} available of {orderedResults.length} results
              </p>
              {orderedResults.map((result) => {
              const requestDisabled = !result.available || requestingDomain === result.domainName;

              return (
                <div
                  key={result.domainName}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center flex-wrap gap-2">
                      <p className="text-sm font-medium text-white">{result.domainName}</p>
                      {result.available ? (
                        <Badge className="bg-green-500/20 text-green-300 border-green-500/30">Available</Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Unavailable</Badge>
                      )}
                      {result.premium && (
                        <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">Premium</Badge>
                      )}
                    </div>

                    <div className="text-xs text-white/50 flex flex-wrap gap-3">
                      <span>Purchase: {result.purchasePrice !== null ? `$${result.purchasePrice}` : 'N/A'}</span>
                      <span>Renewal: {result.renewalPrice !== null ? `$${result.renewalPrice}` : 'N/A'}</span>
                      <span>{result.currency}</span>
                    </div>

                    {result.reason && <p className="text-xs text-white/40">{result.reason}</p>}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleRequestPurchase(result.domainName)}
                      disabled={requestDisabled}
                    >
                      {requestingDomain === result.domainName ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <ShoppingCart className="w-4 h-4 mr-2" />
                      )}
                      Request Purchase
                    </Button>
                  </div>
                </div>
              );
            })}
            </>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <Clock3 className="w-4 h-4" /> Purchase Requests
            </p>
            <Button
              variant="outline"
              className="border-white/20"
              size="sm"
              onClick={() => void loadPurchaseRequests()}
              disabled={requestsLoading}
            >
              {requestsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          {requestsLoading ? (
            <p className="text-xs text-white/55">Loading requests...</p>
          ) : requests.length === 0 ? (
            <p className="text-xs text-white/55">
              {purchaseRequestAppIdFilter ? 'No purchase requests yet for this app.' : 'No purchase requests yet.'}
            </p>
          ) : (
            <div className="space-y-2">
              {requests.map((request) => (
                <div key={request.id} className="rounded-md border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm text-white font-medium">{request.domain}</p>
                    {statusBadge(request.status)}
                  </div>
                  <div className="mt-1 text-xs text-white/50 flex flex-wrap gap-3">
                    <span>Price: {request.purchase_price !== null ? `$${request.purchase_price}` : 'N/A'}</span>
                    <span>Renewal: {request.renewal_price !== null ? `$${request.renewal_price}` : 'N/A'}</span>
                    <span>{new Date(request.created_at).toLocaleString()}</span>
                  </div>
                  {showAttachActions && request.status === 'completed' && attachOptions.length > 0 && (
                    <div className="mt-2">
                      <DomainAttachAction
                        domain={request.domain}
                        appOptions={attachOptions}
                        defaultAppId={defaultAttachAppId}
                        buttonLabel="Add To App Domains"
                        onAttached={(attachedAppId) => {
                          onDomainAttached?.(attachedAppId);
                        }}
                      />
                    </div>
                  )}
                  {showAttachActions && request.status === 'completed' && attachOptions.length === 0 && (
                    <p className="text-xs text-white/55 mt-2">
                      Deploy an app first to connect this domain.
                    </p>
                  )}
                  {request.last_error && <p className="text-xs text-red-300 mt-1">{request.last_error}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
