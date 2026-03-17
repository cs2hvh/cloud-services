'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { DomainAttachAction, type DomainAppOption } from '@/components/dashboard/domains/domain-attach-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AppListItem {
  id: string;
  name: string;
  status: string;
}

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

interface DomainConnectionItem {
  id: string;
  appId: string;
  appName: string;
  appStatus: string;
  domain: string;
  hostLabel: string;
  status: DomainConnection['status'];
  sslStatus: DomainConnection['ssl_status'];
  isPrimary: boolean;
  lastError: string | null;
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase();
}

function hostLabelFor(domain: string, root: string): string {
  if (domain === root) return '@';
  const suffix = `.${root}`;
  if (domain.endsWith(suffix)) {
    return domain.slice(0, -suffix.length);
  }
  return domain;
}

function statusBadge(status: DomainConnection['status']) {
  switch (status) {
    case 'active':
      return <Badge className="border-green-500/30 bg-green-500/20 text-green-200">Active</Badge>;
    case 'verified':
      return <Badge className="border-cyan-500/30 bg-cyan-500/20 text-cyan-200">Verified</Badge>;
    case 'pending':
      return <Badge className="border-yellow-500/30 bg-yellow-500/20 text-yellow-100">Pending</Badge>;
    case 'failed':
      return <Badge className="border-red-500/30 bg-red-500/20 text-red-200">Failed</Badge>;
    default:
      return <Badge className="border-white/20 bg-white/10 text-white/80">Unknown</Badge>;
  }
}

export default function DomainDetailPage() {
  const params = useParams();
  const domainName = useMemo(() => normalizeDomain(decodeURIComponent(String(params.domain || ''))), [params.domain]);

  const [apps, setApps] = useState<AppListItem[]>([]);
  const [purchaseRequest, setPurchaseRequest] = useState<DomainPurchase | null>(null);
  const [connections, setConnections] = useState<DomainConnectionItem[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subdomainInput, setSubdomainInput] = useState('');
  const [removingConnectionId, setRemovingConnectionId] = useState<string | null>(null);

  const appOptions: DomainAppOption[] = useMemo(
    () => apps.map((app) => ({ id: app.id, name: app.name, status: app.status })),
    [apps]
  );

  const attachDomain = useMemo(() => {
    const clean = subdomainInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!clean) return domainName;
    return `${clean}.${domainName}`;
  }, [domainName, subdomainInput]);

  const loadDomainContext = useCallback(async () => {
    if (!domainName) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/domains/inventory?domain=${encodeURIComponent(domainName)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to load domain details');
      }

      const loadedApps = (data?.data?.apps || []) as AppListItem[];
      const domainItems = (data?.data?.domains || []) as DomainInventoryItem[];

      const rootItem = domainItems.find((item) => item.domain === domainName) || null;
      const relatedItems = domainItems.filter(
        (item) => item.domain === domainName || item.domain.endsWith(`.${domainName}`)
      );

      const connectionMap = new Map<string, DomainConnectionItem>();

      relatedItems.forEach((item) => {
        item.connections.forEach((connection) => {
          connectionMap.set(connection.id, {
            id: connection.id,
            appId: connection.app_id,
            appName: connection.app_name,
            appStatus: connection.app_status,
            domain: connection.domain,
            hostLabel: hostLabelFor(connection.domain, domainName),
            status: connection.status,
            sslStatus: connection.ssl_status,
            isPrimary: connection.is_primary,
            lastError: connection.last_error,
          });
        });
      });

      const relatedConnections = Array.from(connectionMap.values()).sort((a, b) => a.domain.localeCompare(b.domain));

      setApps(loadedApps);
      setPurchaseRequest(rootItem?.purchase || null);
      setConnections(relatedConnections);
      setExpiresAt(rootItem?.expires_at || null);
      setAutoRenew(rootItem?.auto_renew ?? null);
    } catch (err) {
      console.error('Failed to load domain details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load domain details');
      setApps([]);
      setPurchaseRequest(null);
      setConnections([]);
      setExpiresAt(null);
      setAutoRenew(null);
    } finally {
      setLoading(false);
    }
  }, [domainName]);

  useEffect(() => {
    void loadDomainContext();
  }, [loadDomainContext]);

  const handleRemoveConnection = async (domainId: string) => {
    setRemovingConnectionId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to remove connection');
        return;
      }
      toast.success('Connection removed');
      await loadDomainContext();
    } catch (err) {
      console.error('Failed to remove domain connection:', err);
      toast.error('Failed to remove connection');
    } finally {
      setRemovingConnectionId(null);
    }
  };

  const connectedAppNames = useMemo(() => {
    const unique = new Set(connections.map((item) => item.appName));
    return Array.from(unique);
  }, [connections]);

  const overallStatus = useMemo(() => {
    if (connections.some((c) => c.status === 'failed')) return 'Needs Attention';
    if (purchaseRequest?.status === 'requested' || purchaseRequest?.status === 'processing') return 'Purchase Pending';
    if (connections.some((c) => c.status === 'pending' || c.status === 'verified')) return 'Setup Pending';
    if (connections.some((c) => c.status === 'active')) return 'Active';
    if (purchaseRequest?.status === 'completed') return 'Purchased';
    return 'Unknown';
  }, [connections, purchaseRequest]);

  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <div className="mb-6">
        <Link href="/dashboard/domains" className="inline-flex items-center text-sm text-white/70 hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Domains
        </Link>
      </div>

      <Card className="mb-6 border-white/10 bg-white/[0.03]">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">{domainName}</CardTitle>
            <CardDescription className="text-white/60 mt-1">Domain control and routing details</CardDescription>
          </div>
          <Button
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
            onClick={() => void loadDomainContext()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge className="border-cyan-500/30 bg-cyan-500/20 text-cyan-100">Status: {overallStatus}</Badge>
          <Badge className="border-white/20 bg-white/10 text-white/90">Connected apps: {connectedAppNames.length}</Badge>
          <Badge className="border-white/20 bg-white/10 text-white/90">Connections: {connections.length}</Badge>
          {expiresAt && (
            <Badge className="border-white/20 bg-white/10 text-white/90">
              Expires: {new Date(expiresAt).toLocaleDateString()}
            </Badge>
          )}
          {autoRenew !== null && (
            <Badge className="border-white/20 bg-white/10 text-white/90">Auto-renew: {autoRenew ? 'On' : 'Off'}</Badge>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-4 text-sm text-red-100 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-white/5 border border-white/10 flex-wrap">
          <TabsTrigger value="overview" className="data-[state=active]:bg-white/10">Overview</TabsTrigger>
          <TabsTrigger value="connections" className="data-[state=active]:bg-white/10">Connections</TabsTrigger>
          <TabsTrigger value="dns" className="data-[state=active]:bg-white/10">DNS</TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-white/10">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-base">Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-white/75">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/55">Purchase status:</span>
                <span>{purchaseRequest?.status || 'No purchase record (external domain or not purchased here)'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/55">Connected apps:</span>
                <span>{connectedAppNames.length > 0 ? connectedAppNames.join(', ') : 'None yet'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/55">SSL:</span>
                <span>{connections.some((c) => c.sslStatus === 'active') ? 'Active on at least one connection' : 'Pending / not issued yet'}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connections" className="space-y-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-base">Connected Apps</CardTitle>
              <CardDescription className="text-white/60">
                Attach {domainName} or its subdomains to any app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-4 md:grid-cols-[180px_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="subdomain-input" className="text-xs text-white/70">Subdomain (optional)</Label>
                  <Input
                    id="subdomain-input"
                    placeholder="@ for root, or api"
                    value={subdomainInput}
                    onChange={(event) => setSubdomainInput(event.target.value)}
                    className="bg-black/30 border-white/10"
                  />
                  <p className="text-xs text-white/50">Target: {attachDomain}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-white/70">Attach to app</Label>
                  <DomainAttachAction
                    domain={attachDomain}
                    appOptions={appOptions}
                    buttonLabel="Add Connection"
                    onAttached={() => {
                      setSubdomainInput('');
                      void loadDomainContext();
                    }}
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading connections...
                </div>
              ) : connections.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-white/55">
                  No connections yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {connections.map((connection) => (
                    <div key={connection.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{connection.domain}</p>
                          <p className="text-xs text-white/60 mt-1">
                            {connection.hostLabel === '@' ? `${domainName} (root)` : `${connection.domain} (${connection.hostLabel})`}
                          </p>
                          <p className="text-xs text-white/60 mt-1">
                            App: {connection.appName} ({connection.appStatus})
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {statusBadge(connection.status)}
                            <Badge className="border-white/20 bg-white/10 text-white/80">SSL: {connection.sslStatus}</Badge>
                            {connection.isPrimary && (
                              <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-200">Primary</Badge>
                            )}
                          </div>
                          {connection.lastError && (
                            <p className="text-xs text-red-300 mt-2">{connection.lastError}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Link href={`/dashboard/services/apps/${connection.appId}`}>
                            <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                              App
                              <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/30 text-red-200 hover:bg-red-500/10"
                            disabled={removingConnectionId === connection.id}
                            onClick={() => void handleRemoveConnection(connection.id)}
                          >
                            {removingConnectionId === connection.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dns" className="space-y-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-base">DNS</CardTitle>
              <CardDescription className="text-white/60">
                Platform DNS intent based on current connections.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {connections.length === 0 ? (
                <p className="text-sm text-white/55">Add at least one connection to generate routing records.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-white/70">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Name</th>
                        <th className="px-3 py-2 text-left font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connections.map((connection) => (
                        <tr key={`${connection.id}-dns`} className="border-t border-white/10 text-white/80">
                          <td className="px-3 py-2">{connection.hostLabel === '@' ? 'A' : 'CNAME'}</td>
                          <td className="px-3 py-2">{connection.hostLabel === '@' ? '@' : connection.hostLabel}</td>
                          <td className="px-3 py-2">
                            {connection.hostLabel === '@'
                              ? 'Platform ingress (managed)'
                              : 'Platform app endpoint (managed)'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-base">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-white/70">
              <p>Domain lifecycle operations are managed per connection and marketplace purchase status.</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/dashboard/domains/marketplace">
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                    <Plus className="h-4 w-4 mr-2" />
                    Buy Another Domain
                  </Button>
                </Link>
                <Link href="/dashboard/domains">
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                    Back to Domains Dashboard
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
