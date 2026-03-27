'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';

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
  looksInternal,
  normalizeDomain,
} from '@/components/dashboard/domains/domain-detail-types';
import { useAutoSslRefresh } from '@/hooks/use-auto-ssl-refresh';
import { useDomainData } from '@/hooks/use-domain-data';
import { useDomainConnections } from '@/hooks/use-domain-connections';
import { useDomainDns } from '@/hooks/use-domain-dns';
import { useDomainRegistrarSettings } from '@/hooks/use-domain-registrar-settings';

export default function DomainDetailPage() {
  const params = useParams();
  const domainName = useMemo(
    () => normalizeDomain(decodeURIComponent(String(params.domain || ''))),
    [params.domain]
  );

  // Local state for subdomain input
  const [subdomainInput, setSubdomainInput] = useState('');
  const [initializing, setInitializing] = useState(true);

  // Stable ref so hooks that run operations can always call the latest full-refresh
  // without capturing a stale closure.
  const refreshAllRef = useRef<() => Promise<void>>(async () => {});

  // Initialize hooks without circular dependencies
  const domainData = useDomainData(domainName);
  const dnsData = useDomainDns(domainName);
  const { setConnections, setExpiresAt, setAutoRenew, loadDomainContext } = domainData;
  const { loadDnsRecords } = dnsData;

  // Callback to sync expiry/auto-renew badges from registrar settings load.
  const syncDomainMeta = useCallback(
    (expiresAt: string | null, autoRenew: boolean | null) => {
      if (expiresAt !== null) setExpiresAt(expiresAt);
      if (autoRenew !== null) setAutoRenew(autoRenew);
    },
    [setAutoRenew, setExpiresAt]
  );

  const registrarData = useDomainRegistrarSettings(
    domainName,
    useCallback(() => refreshAllRef.current(), []),
    syncDomainMeta
  );
  const { loadRegistrarSettings } = registrarData;
  // Connections get the full refresh (all three loaders) via stable ref wrapper.
  const connectionsData = useDomainConnections(
    domainName,
    domainData.connections,
    setConnections,
    useCallback(() => refreshAllRef.current(), [])
  );

  // Compute attach domain with subdomain prefix if provided
  const attachDomain = useMemo(() => {
    const clean = subdomainInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!clean) return domainName;
    return `${clean}.${domainName}`;
  }, [domainName, subdomainInput]);

  // Load all domain panels together so first paint does not show mixed stale/empty values.
  useEffect(() => {
    let isActive = true;
    setInitializing(true);
    void Promise.allSettled([loadDomainContext(), loadDnsRecords(), loadRegistrarSettings()])
      .finally(() => {
        if (isActive) setInitializing(false);
      });
    return () => {
      isActive = false;
    };
  }, [domainName, loadDnsRecords, loadDomainContext, loadRegistrarSettings]);

  const isPageLoading = domainData.loading || dnsData.dnsLoading || registrarData.registrarLoading;

  // Create app options from loaded apps
  const appOptions: DomainAppOption[] = useMemo(
    () =>
      domainData.apps.map((app) => ({
        id: app.id,
        name: app.name,
        status: app.status,
      })),
    [domainData.apps]
  );

  // Extract unique app names from connections
  const connectedAppNames = useMemo(() => {
    const unique = new Set(domainData.connections.map((item) => item.appName));
    return Array.from(unique);
  }, [domainData.connections]);

  // Calculate overall domain status
  const overallStatus = useMemo(() => {
    if (domainData.connections.some((c) => c.status === 'failed')) return 'Needs Attention';
    if (
      domainData.purchaseRequest?.status === 'requested' ||
      domainData.purchaseRequest?.status === 'processing'
    )
      return 'Purchase Pending';
    if (domainData.connections.some((c) => c.status === 'pending' || c.status === 'verified'))
      return 'Setup Pending';
    if (domainData.connections.some((c) => c.status === 'active')) return 'Active';
    if (domainData.purchaseRequest?.status === 'completed') return 'Purchased';
    return 'Unknown';
  }, [domainData.connections, domainData.purchaseRequest]);

  // Auto-refresh while SSL certificates are being issued
  const issuingConnectionIds = useMemo(
    () => domainData.connections.filter((c) => c.sslStatus === 'issuing').map((c) => c.id),
    [domainData.connections]
  );
  useAutoSslRefresh(issuingConnectionIds, domainData.loadDomainContext);

  // Callback for refresh button — destructure stable function refs so handleRefresh
  // only recreates when domainName changes, not on every render.
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      loadDomainContext(),
      loadDnsRecords(),
      loadRegistrarSettings(),
    ]);
  }, [loadDomainContext, loadDnsRecords, loadRegistrarSettings]);

  // Keep the ref in sync so connections hook always calls the latest version.
  useEffect(() => {
    refreshAllRef.current = handleRefresh;
  }, [handleRefresh]);

  return (
    <div className="flex-1 min-h-screen px-4 py-5 text-white sm:px-6 sm:py-6 lg:px-8 lg:py-8 xl:px-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-5">
          <Link
            href="/dashboard/domains"
            className="inline-flex items-center text-sm text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Domains
          </Link>
        </div>

        <Card className="mb-5 border-white/10 bg-white/[0.03]">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-xl sm:text-2xl font-semibold truncate">
                {domainName}
              </CardTitle>
              <CardDescription className="text-white/50 mt-1">
                Domain management and routing
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-white/15 text-white/70 hover:bg-white/10 hover:text-white self-start"
              onClick={handleRefresh}
              disabled={isPageLoading}
            >
              {isPageLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            <Badge className="border-cyan-500/30 bg-cyan-500/15 text-cyan-100">
              {overallStatus}
            </Badge>
            <Badge className="border-white/15 bg-white/5 text-white/70">
              {domainData.connections.length} connection
              {domainData.connections.length !== 1 ? 's' : ''}
            </Badge>
            <Badge className="border-white/15 bg-white/5 text-white/70">
              {connectedAppNames.length} app{connectedAppNames.length !== 1 ? 's' : ''}
            </Badge>
            {domainData.expiresAt && (
              <Badge className="border-white/15 bg-white/5 text-white/70">
                Expires {new Date(domainData.expiresAt).toLocaleDateString()}
              </Badge>
            )}
            {domainData.autoRenew !== null && (
              <Badge
                className={
                  domainData.autoRenew
                    ? 'border-green-500/20 bg-green-500/10 text-green-300'
                    : 'border-white/15 bg-white/5 text-white/50'
                }
              >
                Auto-renew {domainData.autoRenew ? 'on' : 'off'}
              </Badge>
            )}
          </CardContent>
        </Card>

        {domainData.error && (
          <Card className="mb-4 border-red-500/30 bg-red-500/10">
            <CardContent className="py-3 text-sm text-red-100 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {looksInternal(domainData.error)
                ? 'Unable to load this domain. Refresh the page to try again.'
                : domainData.error}
            </CardContent>
          </Card>
        )}

        {initializing ? (
          <Card className="border-white/10 bg-white/[0.03]">
            <CardContent className="py-12">
              <div className="flex items-center justify-center gap-2 text-sm text-white/65">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading domain details...
              </div>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="bg-white/5 border border-white/10 flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="overview" className="data-[state=active]:bg-white/10 text-xs sm:text-sm">
                Overview
              </TabsTrigger>
              <TabsTrigger value="connections" className="data-[state=active]:bg-white/10 text-xs sm:text-sm">
                Connections
              </TabsTrigger>
              <TabsTrigger value="dns" className="data-[state=active]:bg-white/10 text-xs sm:text-sm">
                DNS
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-white/10 text-xs sm:text-sm">
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <DomainOverviewTab
                purchaseRequest={domainData.purchaseRequest}
                connections={domainData.connections}
                connectedAppNames={connectedAppNames}
              />
            </TabsContent>

            <TabsContent value="connections" className="space-y-4">
              <DomainConnectionsTab
                domainName={domainName}
                connections={domainData.connections}
                loading={domainData.loading}
                appOptions={appOptions}
                subdomainInput={subdomainInput}
                attachDomain={attachDomain}
                removeConfirmConnectionId={connectionsData.removeConfirmConnectionId}
                verifyingConnectionId={connectionsData.verifyingConnectionId}
                activatingConnectionId={connectionsData.activatingConnectionId}
                settingPrimaryConnectionId={connectionsData.settingPrimaryConnectionId}
                removingConnectionId={connectionsData.removingConnectionId}
                checkingSslId={connectionsData.checkingSslId}
                onSubdomainChange={setSubdomainInput}
                onAttached={() => { setSubdomainInput(''); void handleRefresh(); }}
                onVerify={connectionsData.onVerify}
                onActivate={connectionsData.onActivate}
                onSetPrimary={connectionsData.onSetPrimary}
                onRemoveRequest={connectionsData.onRemoveRequest}
                onRemoveConfirm={connectionsData.onRemoveConfirm}
                onRemoveCancel={connectionsData.onRemoveCancel}
                onCheckSsl={connectionsData.onCheckSsl}
              />
            </TabsContent>

            <TabsContent value="dns" className="space-y-4">
              <DomainDnsTab
                connections={domainData.connections}
                dnsLoading={dnsData.dnsLoading}
                dnsError={dnsData.dnsError}
                dnsManaged={dnsData.dnsManaged}
                dnsZone={dnsData.dnsZone}
                dnsRecords={dnsData.dnsRecords}
                dnsForm={dnsData.dnsForm}
                dnsSaving={dnsData.dnsSaving}
                dnsDeletingRecordId={dnsData.dnsDeletingRecordId}
                deleteConfirmRecordId={dnsData.deleteConfirmRecordId}
                domainName={domainName}
                onFormChange={dnsData.onFormChange}
                onEditRecord={dnsData.onEditRecord}
                onSaveRecord={dnsData.onSaveRecord}
                onCancelEdit={dnsData.onCancelEdit}
                onDeleteRequest={dnsData.onDeleteRequest}
                onDeleteConfirm={dnsData.onDeleteConfirm}
                onDeleteCancel={dnsData.onDeleteCancel}
              />
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <DomainSettingsTab
                registrarLoading={registrarData.registrarLoading}
                registrarError={registrarData.registrarError}
                registrarSettings={registrarData.registrarSettings}
                savingAutorenew={registrarData.savingAutorenew}
                onToggleAutorenew={registrarData.onToggleAutorenew}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
