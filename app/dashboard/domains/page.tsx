'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Copy,
  Globe,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface DomainPurchase {
  id: string;
  app_id: string | null;
  status: 'requested' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  last_error: string | null;
}

interface DomainConnection {
  id: string;
  app_id: string;
  app_name: string;
  app_status: string;
  domain: string;
  status: 'pending' | 'verified' | 'active' | 'failed' | 'removed';
  ssl_status: 'pending' | 'issuing' | 'active' | 'failed';
  is_primary: boolean;
  last_error: string | null;
  created_at: string;
}

interface DomainInventoryItem {
  domain: string;
  purchase: DomainPurchase | null;
  connections: DomainConnection[];
  source: 'purchased' | 'external' | 'mixed';
  expires_at: string | null;
  auto_renew: boolean | null;
}

type DomainStatus = 'active' | 'pending' | 'attention' | 'purchased' | 'unknown';

function getDomainStatus(item: DomainInventoryItem): { status: DomainStatus; label: string } {
  const purchaseStatus = item.purchase?.status;
  const hasActive = item.connections.some((c) => c.status === 'active');
  const hasFailed = purchaseStatus === 'failed' || item.connections.some((c) => c.status === 'failed');
  const hasPendingPurchase = purchaseStatus === 'requested' || purchaseStatus === 'processing';
  const hasPendingSetup = item.connections.some((c) => c.status === 'pending' || c.status === 'verified');

  if (hasFailed) return { status: 'attention', label: 'Needs Attention' };
  if (hasPendingPurchase || hasPendingSetup) return { status: 'pending', label: 'Pending' };
  if (hasActive) return { status: 'active', label: 'Active' };
  if (purchaseStatus === 'completed') return { status: 'purchased', label: 'Purchased' };
  return { status: 'unknown', label: 'Unknown' };
}

function StatusDot({ status }: { status: DomainStatus }) {
  const colors: Record<DomainStatus, string> = {
    active: 'bg-emerald-400',
    pending: 'bg-amber-400',
    attention: 'bg-red-400',
    purchased: 'bg-cyan-400',
    unknown: 'bg-white/40',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />;
}

function StatusLabel({ status, label }: { status: DomainStatus; label: string }) {
  const colors: Record<DomainStatus, string> = {
    active: 'text-emerald-300',
    pending: 'text-amber-300',
    attention: 'text-red-300',
    purchased: 'text-cyan-300',
    unknown: 'text-white/50',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${colors[status]}`}>
      <StatusDot status={status} />
      {label}
    </span>
  );
}

function needsAttention(item: DomainInventoryItem): boolean {
  if (item.purchase?.status === 'failed') return true;
  return item.connections.some((c) => c.status === 'failed' || c.status === 'pending');
}

function isExpiringSoon(expiresAt: string | null, days: number): boolean {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return false;
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(now.getDate() + days);
  return expiry >= now && expiry <= horizon;
}

function copyDomain(domain: string) {
  navigator.clipboard.writeText(domain);
  toast.success('Domain copied');
}

/* ── Skeleton rows for loading state ── */
function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-white/[0.04]">
          <td className="px-4 py-3"><div className="h-4 w-40 animate-pulse rounded bg-white/[0.06]" /></td>
          <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-white/[0.06]" /></td>
          <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
          <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 w-8 animate-pulse rounded bg-white/[0.06]" /></td>
          <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 w-24 animate-pulse rounded bg-white/[0.06]" /></td>
          <td className="px-4 py-3 hidden xl:table-cell"><div className="h-4 w-12 animate-pulse rounded bg-white/[0.06]" /></td>
          <td className="px-4 py-3"><div className="h-4 w-6 animate-pulse rounded bg-white/[0.06]" /></td>
        </tr>
      ))}
    </>
  );
}

/* ── Domain table row ── */
function DomainRow({ item }: { item: DomainInventoryItem }) {
  const { status, label } = getDomainStatus(item);
  const activeConns = item.connections.filter((c) => c.status === 'active').length;

  return (
    <tr className="group border-t border-white/[0.04] transition-colors hover:bg-white/[0.02]">
      {/* Domain */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/dashboard/domains/${encodeURIComponent(item.domain)}`}
            className="text-sm font-medium font-mono text-white hover:text-cyan-300 transition-colors truncate"
          >
            {item.domain}
          </Link>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); copyDomain(item.domain); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-white/30 hover:text-white/60"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusLabel status={status} label={label} />
      </td>

      {/* Source */}
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="text-xs text-white/50 capitalize">{item.source}</span>
      </td>

      {/* Connections */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="text-xs tabular-nums text-white/60">
          {item.connections.length > 0 ? (
            <>
              {activeConns}/{item.connections.length}
            </>
          ) : (
            <span className="text-white/30">—</span>
          )}
        </span>
      </td>

      {/* Expires */}
      <td className="px-4 py-3 hidden lg:table-cell">
        {item.expires_at ? (
          <span className={`text-xs tabular-nums ${isExpiringSoon(item.expires_at, 30) ? 'text-amber-300' : 'text-white/50'}`}>
            {new Date(item.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        ) : (
          <span className="text-xs text-white/25">—</span>
        )}
      </td>

      {/* Auto-renew */}
      <td className="px-4 py-3 hidden xl:table-cell">
        {item.auto_renew !== null ? (
          <span className={`text-xs ${item.auto_renew ? 'text-emerald-400' : 'text-white/35'}`}>
            {item.auto_renew ? 'On' : 'Off'}
          </span>
        ) : (
          <span className="text-xs text-white/25">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <Link href={`/dashboard/domains/${encodeURIComponent(item.domain)}`}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-white/40 hover:text-white hover:bg-white/[0.06]"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </td>
    </tr>
  );
}

/* ── Empty state ── */
function EmptyState({ message, isFiltered }: { message: string; isFiltered?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] mb-4">
        <Globe className="h-5 w-5 text-white/30" />
      </div>
      <p className="text-sm font-medium text-white/60 mb-1">{message}</p>
      {!isFiltered && (
        <p className="text-xs text-white/35 max-w-sm">
          Register a new domain or connect one you already own.
        </p>
      )}
      {!isFiltered && (
        <Link href="/dashboard/domains/marketplace" className="mt-4">
          <Button size="sm" className="bg-white/[0.08] text-white/80 hover:bg-white/[0.12] border border-white/[0.08]">
            Search Domains
          </Button>
        </Link>
      )}
    </div>
  );
}

/* ── Main page ── */
export default function DomainsDashboardPage() {
  const [items, setItems] = useState<DomainInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadDomains = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/domains/inventory');
      const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.message || data?.error || 'Failed to load domains');
        }

      const domains = (data?.data?.domains || []) as DomainInventoryItem[];
      setItems(domains);
    } catch (err) {
      console.error('Failed to load domains dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to load domains dashboard');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  const attentionItems = useMemo(() => items.filter(needsAttention), [items]);
  const expiringSoonItems = useMemo(() => items.filter((item) => isExpiringSoon(item.expires_at, 30)), [items]);
  const activeCount = useMemo(() => items.filter((item) => item.connections.some((c) => c.status === 'active')).length, [items]);

  // Filter items by search
  const filterBySearch = useCallback((list: DomainInventoryItem[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((item) => item.domain.toLowerCase().includes(q));
  }, [searchQuery]);

  const renderTable = (rows: DomainInventoryItem[], emptyMessage: string) => {
    const filtered = filterBySearch(rows);

    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-white/35">
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 hidden md:table-cell">Source</th>
              <th className="px-4 py-3 hidden lg:table-cell">Connections</th>
              <th className="px-4 py-3 hidden lg:table-cell">Expires</th>
              <th className="px-4 py-3 hidden xl:table-cell">Auto-renew</th>
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    message={searchQuery ? 'No domains match your search' : emptyMessage}
                    isFiltered={!!searchQuery}
                  />
                </td>
              </tr>
            ) : (
              filtered.map((item) => <DomainRow key={item.domain} item={item} />)
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Domains</h1>
          <p className="mt-1 text-sm text-white/50">
            Manage purchased and connected domains across your account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/50 hover:text-white hover:bg-white/[0.06]"
            onClick={() => void loadDomains()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Link href="/dashboard/domains/marketplace">
            <Button size="sm" className="bg-white text-black hover:bg-white/90 font-medium">
              Register Domain
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && items.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-white/40">Total</span>
            <span className="font-semibold tabular-nums text-white">{items.length}</span>
          </div>
          <div className="h-4 w-px bg-white/[0.08]" />
          <div className="flex items-center gap-2">
            <StatusDot status="active" />
            <span className="text-white/40">Active</span>
            <span className="font-semibold tabular-nums text-white">{activeCount}</span>
          </div>
          {attentionItems.length > 0 && (
            <>
              <div className="h-4 w-px bg-white/[0.08]" />
              <div className="flex items-center gap-2">
                <StatusDot status="attention" />
                <span className="text-white/40">Needs Attention</span>
                <span className="font-semibold tabular-nums text-red-300">{attentionItems.length}</span>
              </div>
            </>
          )}
          {expiringSoonItems.length > 0 && (
            <>
              <div className="h-4 w-px bg-white/[0.08]" />
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-amber-400" />
                <span className="text-white/40">Expiring</span>
                <span className="font-semibold tabular-nums text-amber-300">{expiringSoonItems.length}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Search + Table */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] overflow-hidden">
        {/* Toolbar: search + tabs */}
        <div className="border-b border-white/[0.06] px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter domains..."
              className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 text-sm text-white placeholder:text-white/30 focus:border-white/[0.15] focus:outline-none focus:ring-0"
            />
          </div>

          {/* Tab counts */}
          <div className="text-xs text-white/35">
            {items.length} domain{items.length !== 1 ? 's' : ''}
          </div>
        </div>

        <Tabs defaultValue="all">
          <div className="border-b border-white/[0.06]">
            <TabsList className="bg-transparent border-0 h-auto p-0 px-4 gap-0 rounded-none">
              <TabsTrigger
                value="all"
                className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-white/45 data-[state=active]:border-white data-[state=active]:text-white data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-white/70 transition-colors"
              >
                All{!loading && ` (${items.length})`}
              </TabsTrigger>
              <TabsTrigger
                value="attention"
                className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-white/45 data-[state=active]:border-red-400 data-[state=active]:text-red-300 data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-white/70 transition-colors"
              >
                Needs Attention{!loading && attentionItems.length > 0 && ` (${attentionItems.length})`}
              </TabsTrigger>
              <TabsTrigger
                value="expiring"
                className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-white/45 data-[state=active]:border-amber-400 data-[state=active]:text-amber-300 data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-white/70 transition-colors"
              >
                Expiring{!loading && expiringSoonItems.length > 0 && ` (${expiringSoonItems.length})`}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="mt-0">
            {renderTable(items, 'No domains yet')}
          </TabsContent>

          <TabsContent value="attention" className="mt-0">
            {renderTable(attentionItems, 'No domains need attention')}
          </TabsContent>

          <TabsContent value="expiring" className="mt-0">
            {renderTable(expiringSoonItems, 'No domains expiring in the next 30 days')}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
