'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

function getDomainBadge(item: DomainInventoryItem) {
  const purchaseStatus = item.purchase?.status;
  const hasActive = item.connections.some((c) => c.status === 'active');
  const hasFailed = purchaseStatus === 'failed' || item.connections.some((c) => c.status === 'failed');
  const hasPendingPurchase = purchaseStatus === 'requested' || purchaseStatus === 'processing';
  const hasPendingSetup = item.connections.some((c) => c.status === 'pending' || c.status === 'verified');

  if (hasFailed) return <Badge className="border-red-500/30 bg-red-500/20 text-red-200">Needs Attention</Badge>;
  if (hasPendingPurchase || hasPendingSetup) return <Badge className="border-yellow-500/30 bg-yellow-500/20 text-yellow-100">Pending</Badge>;
  if (hasActive) return <Badge className="border-green-500/30 bg-green-500/20 text-green-200">Active</Badge>;
  if (purchaseStatus === 'completed') return <Badge className="border-cyan-500/30 bg-cyan-500/20 text-cyan-200">Purchased</Badge>;
  return <Badge className="border-white/20 bg-white/10 text-white/80">Unknown</Badge>;
}

function needsAttention(item: DomainInventoryItem): boolean {
  const purchaseStatus = item.purchase?.status;
  // 'requested' and 'processing' are normal in-progress states — only 'failed' needs attention
  if (purchaseStatus === 'failed') {
    return true;
  }

  // Include 'pending' so stuck/hung connections still surface in the Needs Attention tab
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

export default function DomainsDashboardPage() {
  const [items, setItems] = useState<DomainInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/domains/inventory');
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to load domains inventory');
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

  const renderDomainTable = (rows: DomainInventoryItem[], emptyMessage: string) => {
    if (rows.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-white/55">
          {emptyMessage}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {rows.map((item) => (
          <div key={item.domain} className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{item.domain}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
                  <span>Connected apps: {item.connections.length}</span>
                  <span>Source: {item.source}</span>
                  {item.purchase?.status && <span>Purchase: {item.purchase.status}</span>}
                  {item.expires_at && <span>Expires: {new Date(item.expires_at).toLocaleDateString()}</span>}
                  {item.auto_renew !== null && <span>Auto-renew: {item.auto_renew ? 'On' : 'Off'}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getDomainBadge(item)}
                <Link href={`/dashboard/domains/${encodeURIComponent(item.domain)}`}>
                  <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                    View Details
                    <ArrowUpRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Domains</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">My Domains</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/65">
            Manage purchased and connected domains, view status, and control routing.
          </p>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-4 text-sm text-red-100 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      )}

      <Card className="glass-panel border-white/10">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Domain Inventory</CardTitle>
            <CardDescription className="text-white/55">
              All your purchased and externally connected domains.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 text-white hover:bg-white/10"
            onClick={() => void loadDomains()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading domains...
            </div>
          ) : (
            <Tabs defaultValue="all" className="space-y-4">
              <TabsList className="bg-white/5 border border-white/10 flex-wrap">
                <TabsTrigger value="all" className="data-[state=active]:bg-white/10">All ({items.length})</TabsTrigger>
                <TabsTrigger value="attention" className="data-[state=active]:bg-white/10">Needs Attention ({attentionItems.length})</TabsTrigger>
                <TabsTrigger value="expiring" className="data-[state=active]:bg-white/10">Expiring Soon ({expiringSoonItems.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                {renderDomainTable(items, 'No domains yet. Buy one from Buy Domains in the sidebar.')}
              </TabsContent>

              <TabsContent value="attention">
                {renderDomainTable(attentionItems, 'No domains need attention right now.')}
              </TabsContent>

              <TabsContent value="expiring">
                {renderDomainTable(expiringSoonItems, 'No domains expiring in the next 30 days.')}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
