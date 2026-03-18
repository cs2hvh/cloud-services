'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Loader2, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { DomainAttachAction, type DomainAppOption } from '@/components/dashboard/domains/domain-attach-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

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

interface DnsRecordItem {
  id: number | null;
  host: string;
  type: string;
  answer: string;
  ttl: number;
  priority: number | null;
  fqdn: string | null;
}

interface DnsFormState {
  recordId: number | null;
  type: 'A' | 'AAAA' | 'ANAME' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV';
  host: string;
  answer: string;
  ttl: number;
  priority: string;
}

interface RegistrarSettings {
  domain: string;
  managed: boolean;
  zone: string | null;
  host: string | null;
  autorenew_enabled: boolean | null;
  locked: boolean | null;
  privacy_enabled: boolean | null;
  expires_at: string | null;
  nameservers: string[];
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
  const [verifyingConnectionId, setVerifyingConnectionId] = useState<string | null>(null);
  const [activatingConnectionId, setActivatingConnectionId] = useState<string | null>(null);
  const [settingPrimaryConnectionId, setSettingPrimaryConnectionId] = useState<string | null>(null);
  const [removingConnectionId, setRemovingConnectionId] = useState<string | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsError, setDnsError] = useState<string | null>(null);
  const [dnsManaged, setDnsManaged] = useState<boolean | null>(null);
  const [dnsZone, setDnsZone] = useState<string | null>(null);
  const [dnsRecords, setDnsRecords] = useState<DnsRecordItem[]>([]);
  const [dnsForm, setDnsForm] = useState<DnsFormState>({
    recordId: null,
    type: 'A',
    host: '@',
    answer: '',
    ttl: 300,
    priority: '',
  });
  const [dnsSaving, setDnsSaving] = useState(false);
  const [dnsDeletingRecordId, setDnsDeletingRecordId] = useState<number | null>(null);
  const [registrarLoading, setRegistrarLoading] = useState(false);
  const [registrarError, setRegistrarError] = useState<string | null>(null);
  const [registrarSettings, setRegistrarSettings] = useState<RegistrarSettings | null>(null);
  const [nameserversDraft, setNameserversDraft] = useState('');
  const [savingAutorenew, setSavingAutorenew] = useState(false);
  const [savingNameservers, setSavingNameservers] = useState(false);

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

  const loadDnsRecords = useCallback(async () => {
    if (!domainName) return;

    setDnsLoading(true);
    setDnsError(null);

    try {
      const res = await fetch(`/api/domains/dns?domain=${encodeURIComponent(domainName)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to load DNS records');
      }

      setDnsManaged(Boolean(data?.data?.managed));
      setDnsZone((data?.data?.zone || null) as string | null);
      setDnsRecords((data?.data?.records || []) as DnsRecordItem[]);
    } catch (err) {
      console.error('Failed to load DNS records:', err);
      setDnsError(err instanceof Error ? err.message : 'Failed to load DNS records');
      setDnsManaged(null);
      setDnsZone(null);
      setDnsRecords([]);
    } finally {
      setDnsLoading(false);
    }
  }, [domainName]);

  const loadRegistrarSettings = useCallback(async () => {
    if (!domainName) return;

    setRegistrarLoading(true);
    setRegistrarError(null);

    try {
      const res = await fetch(`/api/domains/registrar?domain=${encodeURIComponent(domainName)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to load registrar settings');
      }

      const settings = (data?.data || null) as RegistrarSettings | null;
      setRegistrarSettings(settings);
      setNameserversDraft((settings?.nameservers || []).join('\n'));

      if (settings?.expires_at) {
        setExpiresAt(settings.expires_at);
      }
      if (typeof settings?.autorenew_enabled === 'boolean') {
        setAutoRenew(settings.autorenew_enabled);
      }
    } catch (err) {
      console.error('Failed to load registrar settings:', err);
      setRegistrarError(err instanceof Error ? err.message : 'Failed to load registrar settings');
      setRegistrarSettings(null);
      setNameserversDraft('');
    } finally {
      setRegistrarLoading(false);
    }
  }, [domainName]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadDomainContext(), loadDnsRecords(), loadRegistrarSettings()]);
  }, [loadDnsRecords, loadDomainContext, loadRegistrarSettings]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const resetDnsForm = useCallback(() => {
    setDnsForm({
      recordId: null,
      type: 'A',
      host: '@',
      answer: '',
      ttl: 300,
      priority: '',
    });
  }, []);

  const pollOperation = async (operationId: string) => {
    const maxAttempts = 45;
    const delayMs = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const res = await fetch(`/api/domains/operations/${operationId}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to get operation status');
      }

      const status = data?.operation?.status;
      if (status === 'succeeded') {
        return;
      }
      if (status === 'failed') {
        throw new Error(data?.operation?.error_message || 'Operation failed');
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Operation timed out. Please check status again.');
  };

  const handleVerifyConnection = async (domainId: string) => {
    setVerifyingConnectionId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}/verify`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data?.verified) {
        toast.success('Domain verified.');
        await refreshAll();
        return;
      }

      toast.error(data?.message || data?.error || 'Verification failed.');
    } catch (err) {
      console.error('Failed to verify domain:', err);
      toast.error('Failed to verify domain.');
    } finally {
      setVerifyingConnectionId(null);
    }
  };

  const handleActivateConnection = async (domainId: string) => {
    setActivatingConnectionId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}/activate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.message || data?.error || 'Activation failed');
        return;
      }

      if (data?.operation_id) {
        toast.info('Activation started. Waiting for completion...');
        await pollOperation(String(data.operation_id));
      }

      toast.success('Domain activation completed.');
      await refreshAll();
    } catch (err) {
      console.error('Failed to activate domain:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to activate domain');
    } finally {
      setActivatingConnectionId(null);
    }
  };

  const handleSetPrimaryConnection = async (domainId: string) => {
    setSettingPrimaryConnectionId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}/set-primary`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.message || data?.error || 'Failed to set primary domain');
        return;
      }
      toast.success('Primary domain set.');
      await refreshAll();
    } catch (err) {
      console.error('Failed to set primary domain:', err);
      toast.error('Failed to set primary domain');
    } finally {
      setSettingPrimaryConnectionId(null);
    }
  };

  const handleRemoveConnection = useCallback(async (domainId: string) => {
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
      await refreshAll();
    } catch (err) {
      console.error('Failed to remove domain connection:', err);
      toast.error('Failed to remove connection');
    } finally {
      setRemovingConnectionId(null);
    }
  }, [refreshAll]);

  const handleToggleAutorenew = useCallback(async () => {
    if (!registrarSettings?.managed || typeof registrarSettings.autorenew_enabled !== 'boolean') {
      return;
    }

    setSavingAutorenew(true);
    try {
      const res = await fetch('/api/domains/registrar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainName,
          autorenew_enabled: !registrarSettings.autorenew_enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to update auto-renew');
        return;
      }

      toast.success(`Auto-renew ${data?.data?.autorenew_enabled ? 'enabled' : 'disabled'}.`);
      await refreshAll();
    } catch (err) {
      console.error('Failed to update auto-renew:', err);
      toast.error('Failed to update auto-renew');
    } finally {
      setSavingAutorenew(false);
    }
  }, [domainName, refreshAll, registrarSettings]);

  const handleSaveNameservers = useCallback(async () => {
    if (!registrarSettings?.managed) {
      return;
    }

    const nameservers = nameserversDraft
      .split('\n')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (nameservers.length < 2) {
      toast.error('Add at least two nameservers.');
      return;
    }

    setSavingNameservers(true);
    try {
      const res = await fetch('/api/domains/registrar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainName,
          nameservers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to update nameservers');
        return;
      }

      toast.success('Nameservers updated.');
      await refreshAll();
    } catch (err) {
      console.error('Failed to update nameservers:', err);
      toast.error('Failed to update nameservers');
    } finally {
      setSavingNameservers(false);
    }
  }, [domainName, nameserversDraft, refreshAll, registrarSettings]);

  const handleEditDnsRecord = useCallback((record: DnsRecordItem) => {
    setDnsForm({
      recordId: record.id,
      type: (record.type?.toUpperCase() as DnsFormState['type']) || 'A',
      host: record.host || '@',
      answer: record.answer || '',
      ttl: Number(record.ttl || 300),
      priority: record.priority !== null ? String(record.priority) : '',
    });
  }, []);

  const handleSaveDnsRecord = useCallback(async () => {
    if (!dnsManaged) {
      toast.error('DNS changes are available only for platform-managed zones.');
      return;
    }

    const answer = dnsForm.answer.trim();
    const host = (dnsForm.host.trim() || '@').toLowerCase();
    const ttl = Number.isFinite(dnsForm.ttl) ? Math.max(60, Math.min(86400, Math.floor(dnsForm.ttl))) : 300;
    const needsPriority = dnsForm.type === 'MX' || dnsForm.type === 'SRV';
    const priorityNumber = dnsForm.priority.trim() ? Number(dnsForm.priority.trim()) : NaN;

    if (!answer) {
      toast.error('Record value is required.');
      return;
    }
    if (host === '@' && dnsForm.type === 'CNAME') {
      toast.error('Root domain cannot use CNAME. Use ANAME or A.');
      return;
    }
    if (needsPriority && (!Number.isInteger(priorityNumber) || priorityNumber < 0 || priorityNumber > 65535)) {
      toast.error(`${dnsForm.type} record requires a valid priority (0-65535).`);
      return;
    }

    setDnsSaving(true);
    try {
      const method = dnsForm.recordId ? 'PATCH' : 'POST';
      const res = await fetch('/api/domains/dns', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainName,
          record_id: dnsForm.recordId ?? undefined,
          type: dnsForm.type,
          host,
          answer,
          ttl,
          priority: needsPriority ? priorityNumber : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to save DNS record');
        return;
      }

      toast.success(dnsForm.recordId ? 'DNS record updated.' : 'DNS record added.');
      resetDnsForm();
      await loadDnsRecords();
    } catch (err) {
      console.error('Failed to save DNS record:', err);
      toast.error('Failed to save DNS record');
    } finally {
      setDnsSaving(false);
    }
  }, [dnsForm, dnsManaged, domainName, loadDnsRecords, resetDnsForm]);

  const handleDeleteDnsRecord = useCallback(async (recordId: number) => {
    if (!dnsManaged) return;

    const confirmed = window.confirm('Delete this DNS record?');
    if (!confirmed) return;

    setDnsDeletingRecordId(recordId);
    try {
      const res = await fetch('/api/domains/dns', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainName,
          record_id: recordId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to delete DNS record');
        return;
      }

      toast.success('DNS record deleted.');
      if (dnsForm.recordId === recordId) {
        resetDnsForm();
      }
      await loadDnsRecords();
    } catch (err) {
      console.error('Failed to delete DNS record:', err);
      toast.error('Failed to delete DNS record');
    } finally {
      setDnsDeletingRecordId(null);
    }
  }, [dnsForm.recordId, dnsManaged, domainName, loadDnsRecords, resetDnsForm]);

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
            onClick={() => void refreshAll()}
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
                      void refreshAll();
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
                          {(connection.status === 'pending' || connection.status === 'failed') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/20 text-white hover:bg-white/10"
                              disabled={verifyingConnectionId === connection.id}
                              onClick={() => void handleVerifyConnection(connection.id)}
                            >
                              {verifyingConnectionId === connection.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                'Verify'
                              )}
                            </Button>
                          )}
                          {connection.status === 'verified' && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              disabled={activatingConnectionId === connection.id || connection.appStatus !== 'running'}
                              onClick={() => void handleActivateConnection(connection.id)}
                              title={
                                connection.appStatus !== 'running'
                                  ? 'App must be running before activation.'
                                  : undefined
                              }
                            >
                              {activatingConnectionId === connection.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Check className="h-3.5 w-3.5 mr-1" />
                                  Activate
                                </>
                              )}
                            </Button>
                          )}
                          {connection.status === 'active' && !connection.isPrimary && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/20 text-white hover:bg-white/10"
                              disabled={settingPrimaryConnectionId === connection.id}
                              onClick={() => void handleSetPrimaryConnection(connection.id)}
                            >
                              {settingPrimaryConnectionId === connection.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Star className="h-3.5 w-3.5 mr-1" />
                                  Set Primary
                                </>
                              )}
                            </Button>
                          )}
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
                Live DNS records for managed zones, with fallback to routing intent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dnsError && (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
                  {dnsError}
                </div>
              )}

              {dnsLoading ? (
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading DNS records...
                </div>
              ) : dnsManaged ? (
                <div className="space-y-3">
                  <p className="text-xs text-white/60">Managed zone: {dnsZone || domainName}</p>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                    <p className="text-sm font-medium text-white">
                      {dnsForm.recordId ? 'Edit DNS Record' : 'Add DNS Record'}
                    </p>
                    <div className="grid gap-3 md:grid-cols-5">
                      <div className="space-y-1">
                        <Label className="text-xs text-white/60">Type</Label>
                        <select
                          value={dnsForm.type}
                          onChange={(event) => setDnsForm((prev) => ({ ...prev, type: event.target.value as DnsFormState['type'] }))}
                          className="h-9 w-full rounded-md border border-white/10 bg-black/30 px-2 text-sm text-white"
                        >
                          <option value="A">A</option>
                          <option value="AAAA">AAAA</option>
                          <option value="ANAME">ANAME</option>
                          <option value="CNAME">CNAME</option>
                          <option value="TXT">TXT</option>
                          <option value="MX">MX</option>
                          <option value="NS">NS</option>
                          <option value="SRV">SRV</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-white/60">Host</Label>
                        <Input
                          value={dnsForm.host}
                          onChange={(event) => setDnsForm((prev) => ({ ...prev, host: event.target.value }))}
                          placeholder="@"
                          className="bg-black/30 border-white/10"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs text-white/60">Value</Label>
                        <Input
                          value={dnsForm.answer}
                          onChange={(event) => setDnsForm((prev) => ({ ...prev, answer: event.target.value }))}
                          placeholder="Target, IP, text, or host"
                          className="bg-black/30 border-white/10"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-white/60">TTL</Label>
                        <Input
                          type="number"
                          value={dnsForm.ttl}
                          onChange={(event) => setDnsForm((prev) => ({ ...prev, ttl: Number(event.target.value || 300) }))}
                          className="bg-black/30 border-white/10"
                        />
                      </div>
                    </div>
                    {(dnsForm.type === 'MX' || dnsForm.type === 'SRV') && (
                      <div className="space-y-1 max-w-xs">
                        <Label className="text-xs text-white/60">Priority</Label>
                        <Input
                          type="number"
                          value={dnsForm.priority}
                          onChange={(event) => setDnsForm((prev) => ({ ...prev, priority: event.target.value }))}
                          placeholder="10"
                          className="bg-black/30 border-white/10"
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      {dnsForm.recordId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/20 text-white hover:bg-white/10"
                          onClick={resetDnsForm}
                        >
                          Cancel Edit
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="bg-white text-black hover:bg-white/90"
                        disabled={dnsSaving}
                        onClick={() => void handleSaveDnsRecord()}
                      >
                        {dnsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                        {dnsForm.recordId ? 'Update Record' : 'Add Record'}
                      </Button>
                    </div>
                  </div>
                  {dnsRecords.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-white/55">
                      No DNS records found for this managed zone.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-white/10">
                      <table className="w-full text-sm">
                        <thead className="bg-white/5 text-white/70">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Type</th>
                            <th className="px-3 py-2 text-left font-medium">Host</th>
                            <th className="px-3 py-2 text-left font-medium">Answer</th>
                            <th className="px-3 py-2 text-left font-medium">TTL</th>
                            <th className="px-3 py-2 text-left font-medium">Priority</th>
                            <th className="px-3 py-2 text-left font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dnsRecords.map((record) => (
                            <tr
                              key={`${record.id ?? record.host}:${record.type}:${record.answer}`}
                              className="border-t border-white/10 text-white/80"
                            >
                              <td className="px-3 py-2">{record.type}</td>
                              <td className="px-3 py-2">{record.host}</td>
                              <td className="px-3 py-2 break-all">{record.answer}</td>
                              <td className="px-3 py-2">{record.ttl}</td>
                              <td className="px-3 py-2">{record.priority ?? '-'}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 border-white/20 text-white hover:bg-white/10"
                                    onClick={() => handleEditDnsRecord(record)}
                                  >
                                    Edit
                                  </Button>
                                  {record.id !== null && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 border-red-500/30 text-red-200 hover:bg-red-500/10"
                                      disabled={dnsDeletingRecordId === record.id}
                                      onClick={() => void handleDeleteDnsRecord(record.id as number)}
                                    >
                                      {dnsDeletingRecordId === record.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        'Delete'
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : connections.length === 0 ? (
                <p className="text-sm text-white/55">Add at least one connection to generate routing records.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-white/60">
                    This domain is not in a platform-managed DNS zone for this account. Routing intent:
                  </p>
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
            <CardContent className="space-y-4 text-sm text-white/70">
              <p>
                Domain-level controls are independent from app connections. You can manage this domain even if it is not attached to any app.
              </p>

              {registrarError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
                  {registrarError}
                </div>
              )}

              {registrarLoading ? (
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading registrar settings...
                </div>
              ) : registrarSettings?.managed ? (
                <div className="space-y-4 rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-cyan-500/30 bg-cyan-500/20 text-cyan-100">Managed Zone</Badge>
                    <span className="text-xs text-white/60">{registrarSettings.zone}</span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 p-3">
                    <div>
                      <p className="text-sm text-white">Auto-renew</p>
                      <p className="text-xs text-white/55">
                        Keep domain renewal automatic at registrar level.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                      disabled={savingAutorenew || typeof registrarSettings.autorenew_enabled !== 'boolean'}
                      onClick={() => void handleToggleAutorenew()}
                    >
                      {savingAutorenew ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      {registrarSettings.autorenew_enabled ? 'Disable' : 'Enable'} Auto-renew
                    </Button>
                  </div>

                  <div className="space-y-2 rounded-md border border-white/10 p-3">
                    <Label className="text-xs text-white/70">Nameservers (one per line)</Label>
                    <Textarea
                      value={nameserversDraft}
                      onChange={(event) => setNameserversDraft(event.target.value)}
                      rows={4}
                      className="bg-black/30 border-white/10 text-white"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-white/50">Updating nameservers affects all DNS at the registrar.</p>
                      <Button
                        size="sm"
                        className="bg-white text-black hover:bg-white/90"
                        disabled={savingNameservers}
                        onClick={() => void handleSaveNameservers()}
                      >
                        {savingNameservers ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                        Save Nameservers
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <p className="text-sm text-white">External domain</p>
                  <p className="text-xs text-white/55 mt-1">
                    This domain is not in your managed registrar account. Update nameservers and registrar settings at your current provider.
                  </p>
                </div>
              )}

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
