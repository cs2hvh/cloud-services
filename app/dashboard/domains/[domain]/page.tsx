'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DomainOverviewTab } from '@/components/dashboard/domains/domain-overview-tab';
import { DomainConnectionsTab } from '@/components/dashboard/domains/domain-connections-tab';
import { DomainDnsTab } from '@/components/dashboard/domains/domain-dns-tab';
import { DomainSettingsTab } from '@/components/dashboard/domains/domain-settings-tab';
import type { DomainAppOption } from '@/components/dashboard/domains/domain-attach-action';
import {
  type AppListItem,
  type DnsFormState,
  type DnsRecordItem,
  type DomainConnectionItem,
  type DomainInventoryItem,
  type DomainPurchase,
  type RegistrarSettings,
  friendlyError,
  hostLabelFor,
  looksInternal,
  normalizeDomain,
  sanitizeOperationError,
} from '@/components/dashboard/domains/domain-detail-types';
import { useAutoSslRefresh } from '@/hooks/use-auto-ssl-refresh';

const DEFAULT_DNS_FORM: DnsFormState = {
  recordId: null,
  type: 'A',
  host: '@',
  answer: '',
  ttl: 300,
  priority: '',
};

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
  const [removeConfirmConnectionId, setRemoveConfirmConnectionId] = useState<string | null>(null);
  const [checkingSslId, setCheckingSslId] = useState<string | null>(null);
  const [deleteConfirmRecordId, setDeleteConfirmRecordId] = useState<number | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsError, setDnsError] = useState<string | null>(null);
  const [dnsManaged, setDnsManaged] = useState<boolean | null>(null);
  const [dnsZone, setDnsZone] = useState<string | null>(null);
  const [dnsRecords, setDnsRecords] = useState<DnsRecordItem[]>([]);
  const [dnsForm, setDnsForm] = useState<DnsFormState>(DEFAULT_DNS_FORM);
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
        throw new Error(friendlyError(data, 'Unable to load domain details. Refresh to try again.'));
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
      setError(err instanceof Error ? err.message : 'Unable to load domain details. Refresh to try again.');
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
        throw new Error(friendlyError(data, 'Unable to load DNS records. Refresh to try again.'));
      }

      setDnsManaged(Boolean(data?.data?.managed));
      setDnsZone((data?.data?.zone || null) as string | null);
      setDnsRecords((data?.data?.records || []) as DnsRecordItem[]);
    } catch (err) {
      console.error('Failed to load DNS records:', err);
      setDnsError(err instanceof Error ? err.message : 'Unable to load DNS records. Refresh to try again.');
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
        throw new Error(friendlyError(data, 'Unable to load domain settings. Refresh to try again.'));
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
      setRegistrarError(err instanceof Error ? err.message : 'Unable to load domain settings. Refresh to try again.');
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

  // Auto-refresh while any connection is still issuing an SSL cert.
  const issuingConnectionIds = useMemo(
    () => connections.filter((c) => c.sslStatus === 'issuing').map((c) => c.id),
    [connections],
  );
  useAutoSslRefresh(issuingConnectionIds, loadDomainContext);

  const resetDnsForm = useCallback(() => setDnsForm(DEFAULT_DNS_FORM), []);

  const pollOperation = async (operationId: string) => {
    const maxAttempts = 75; // 75 × 2s = 150s — covers the full activation window
    const delayMs = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const res = await fetch(`/api/domains/operations/${operationId}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error('Unable to check setup status. Please refresh and try again.');
      }

      const status = data?.operation?.status;
      if (status === 'succeeded') {
        return;
      }
      if (status === 'failed') {
        const rawMsg = data?.operation?.error_message;
        throw new Error(sanitizeOperationError(rawMsg, 'Domain setup failed. Please try again or contact support.'));
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Setup is taking longer than expected. Refresh to check the current status.');
  };

  const handleCheckSslConnection = async (domainId: string) => {
    setCheckingSslId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}/check-ssl`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Could not check SSL status.'));
        return;
      }

      // Optimistically update the connection state so the badge reflects dns info immediately.
      if (data.dns_ready !== undefined || data.ssl_status) {
        setConnections((prev) =>
          prev.map((c) =>
            c.id === domainId
              ? {
                  ...c,
                  sslStatus: data.ssl_status ?? c.sslStatus,
                  dnsReady: data.dns_ready,
                  dnsMessage: data.dns_message ?? undefined,
                }
              : c,
          ),
        );
      }

      if (data.ssl_status === 'active') {
        toast.success('Secure connection is now active — connection is fully encrypted.');
      } else if (data.ssl_status === 'issuing') {
        if (data.dns_ready === false && data.dns_message) {
          toast.warning(`DNS not ready: ${data.dns_message}`);
        } else {
          toast.info('Certificate is still being issued. Check again in a minute.');
        }
      } else if (data.ssl_status === 'failed') {
        toast.error('Secure connection failed. Check DNS and re-activate the domain.');
      }
      await loadDomainContext();
    } catch {
      toast.error('SSL check failed. Please try again.');
    } finally {
      setCheckingSslId(null);
    }
  };

  const handleVerifyConnection = async (domainId: string) => {
    setVerifyingConnectionId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}/verify`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data?.verified) {
        const connectionDomain = connections.find((c) => c.id === domainId)?.domain;
        toast.success(`${connectionDomain ? `${connectionDomain} verified` : 'Domain verified'} — you can now activate it.`);
        await refreshAll();
        return;
      }

      toast.error(
        friendlyError(
          data,
          'Verification failed — check that your TXT record exactly matches the value shown and try again.',
        ),
      );
    } catch (err) {
      console.error('Failed to verify domain:', err);
      toast.error('Verification check failed. Check your connection and try again.');
    } finally {
      setVerifyingConnectionId(null);
    }
  };

  const handleActivateConnection = async (domainId: string) => {
    setActivatingConnectionId(domainId);
    const connectionDomain = connections.find((c) => c.id === domainId)?.domain;
    try {
      const res = await fetch(`/api/domains/${domainId}/activate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(friendlyError(data, 'Activation failed. Please try again.'));
        return;
      }

      if (data?.operation_id) {
        toast.info(`Setting up ${connectionDomain || 'domain'}\u2026 this may take up to 2 minutes.`);
        await pollOperation(String(data.operation_id));
      }

      toast.success(`${connectionDomain || 'Domain'} is now live\u2014secure connection setup will be ready shortly.`);
      await refreshAll();
    } catch (err) {
      console.error('Failed to activate domain:', err);
      toast.error(err instanceof Error ? err.message : 'Activation failed. Please try again.');
    } finally {
      setActivatingConnectionId(null);
    }
  };

  const handleSetPrimaryConnection = async (domainId: string) => {
    setSettingPrimaryConnectionId(domainId);
    const connectionDomain = connections.find((c) => c.id === domainId)?.domain;
    try {
      const res = await fetch(`/api/domains/${domainId}/set-primary`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(friendlyError(data, 'Failed to update primary domain. Please try again.'));
        return;
      }
      toast.success(`${connectionDomain || 'Domain'} is now your primary domain.`);
      await refreshAll();
    } catch (err) {
      console.error('Failed to set primary domain:', err);
      toast.error('Failed to update primary domain. Please try again.');
    } finally {
      setSettingPrimaryConnectionId(null);
    }
  };

  const handleRemoveConnection = useCallback(async (domainId: string) => {
    const connectionDomain = connections.find((c) => c.id === domainId)?.domain;
    setRemovingConnectionId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Failed to remove connection. Please try again.'));
        return;
      }
      toast.success(`${connectionDomain ? `${connectionDomain} disconnected` : 'Connection removed'} from this app.`);
      await refreshAll();
    } catch (err) {
      console.error('Failed to remove domain connection:', err);
      toast.error('Failed to remove connection. Please try again.');
    } finally {
      setRemovingConnectionId(null);
      setRemoveConfirmConnectionId(null);
    }
  }, [connections, refreshAll]);

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
        toast.error(friendlyError(data, 'Failed to update auto-renew. Please try again.'));
        return;
      }

      toast.success(`Auto-renew ${data?.data?.autorenew_enabled ? 'enabled' : 'turned off'}.`);
      await refreshAll();
    } catch (err) {
      console.error('Failed to update auto-renew:', err);
      toast.error('Failed to update auto-renew. Please try again.');
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
      toast.error('Please add at least two nameservers.');
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
        toast.error(friendlyError(data, 'Failed to update nameservers. Please try again.'));
        return;
      }

      toast.success('Nameservers updated. Changes may take up to 48 hours to fully propagate.');
      await refreshAll();
    } catch (err) {
      console.error('Failed to update nameservers:', err);
      toast.error('Failed to update nameservers. Please try again.');
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
      toast.error('DNS records can only be edited for domains managed through your account.');
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
      toast.error('The root domain cannot use a CNAME record. Use A or ANAME instead.');
      return;
    }
    if (needsPriority && (!Number.isInteger(priorityNumber) || priorityNumber < 0 || priorityNumber > 65535)) {
      toast.error(`${dnsForm.type} records require a priority value between 0 and 65535.`);
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
        toast.error(friendlyError(data, 'Failed to save DNS record. Please try again.'));
        return;
      }

      toast.success(dnsForm.recordId ? 'DNS record updated.' : 'DNS record added.');
      resetDnsForm();
      await loadDnsRecords();
    } catch (err) {
      console.error('Failed to save DNS record:', err);
      toast.error('Failed to save DNS record. Please try again.');
    } finally {
      setDnsSaving(false);
    }
  }, [dnsForm, dnsManaged, domainName, loadDnsRecords, resetDnsForm]);

  const handleDeleteDnsRecord = useCallback(async (recordId: number) => {
    if (!dnsManaged) return;
    setDeleteConfirmRecordId(null); // clear dialog before async work

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
        toast.error(friendlyError(data, 'Failed to delete DNS record. Please try again.'));
        return;
      }

      toast.success('DNS record deleted.');
      if (dnsForm.recordId === recordId) {
        resetDnsForm();
      }
      await loadDnsRecords();
    } catch (err) {
      console.error('Failed to delete DNS record:', err);
      toast.error('Failed to delete DNS record. Please try again.');
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
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {looksInternal(error) ? 'Unable to load this domain. Refresh the page to try again.' : error}
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
          <DomainOverviewTab
            purchaseRequest={purchaseRequest}
            connections={connections}
            connectedAppNames={connectedAppNames}
          />
        </TabsContent>

        <TabsContent value="connections" className="space-y-4">
          <DomainConnectionsTab
            domainName={domainName}
            connections={connections}
            loading={loading}
            appOptions={appOptions}
            subdomainInput={subdomainInput}
            attachDomain={attachDomain}
            removeConfirmConnectionId={removeConfirmConnectionId}
            verifyingConnectionId={verifyingConnectionId}
            activatingConnectionId={activatingConnectionId}
            settingPrimaryConnectionId={settingPrimaryConnectionId}
            removingConnectionId={removingConnectionId}
            checkingSslId={checkingSslId}
            onSubdomainChange={setSubdomainInput}
            onAttached={() => { setSubdomainInput(''); void refreshAll(); }}
            onVerify={(id) => void handleVerifyConnection(id)}
            onActivate={(id) => void handleActivateConnection(id)}
            onSetPrimary={(id) => void handleSetPrimaryConnection(id)}
            onRemoveRequest={setRemoveConfirmConnectionId}
            onRemoveConfirm={(id) => void handleRemoveConnection(id)}
            onRemoveCancel={() => setRemoveConfirmConnectionId(null)}
            onCheckSsl={(id) => void handleCheckSslConnection(id)}
          />
        </TabsContent>

        <TabsContent value="dns" className="space-y-4">
          <DomainDnsTab
            connections={connections}
            dnsLoading={dnsLoading}
            dnsError={dnsError}
            dnsManaged={dnsManaged}
            dnsZone={dnsZone}
            dnsRecords={dnsRecords}
            dnsForm={dnsForm}
            dnsSaving={dnsSaving}
            dnsDeletingRecordId={dnsDeletingRecordId}
            deleteConfirmRecordId={deleteConfirmRecordId}
            domainName={domainName}
            onFormChange={(patch) => setDnsForm((prev) => ({ ...prev, ...patch }))}
            onEditRecord={handleEditDnsRecord}
            onSaveRecord={() => void handleSaveDnsRecord()}
            onCancelEdit={resetDnsForm}
            onDeleteRequest={setDeleteConfirmRecordId}
            onDeleteConfirm={(id) => void handleDeleteDnsRecord(id)}
            onDeleteCancel={() => setDeleteConfirmRecordId(null)}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <DomainSettingsTab
            registrarLoading={registrarLoading}
            registrarError={registrarError}
            registrarSettings={registrarSettings}
            nameserversDraft={nameserversDraft}
            savingAutorenew={savingAutorenew}
            savingNameservers={savingNameservers}
            onNameserversDraftChange={setNameserversDraft}
            onToggleAutorenew={() => void handleToggleAutorenew()}
            onSaveNameservers={() => void handleSaveNameservers()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
