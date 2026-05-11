'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DomainOverviewTab } from '@/components/dashboard/domains/domain-overview-tab';
import { DomainConnectionsTab } from '@/components/dashboard/domains/domain-connections-tab';
import { DomainDnsTab } from '@/components/dashboard/domains/domain-dns-tab';
import { DomainSettingsTab } from '@/components/dashboard/domains/domain-settings-tab';
import type { DomainAppOption } from '@/components/dashboard/domains/domain-attach-action';
import {
  looksInternal,
  normalizeDomain,
  type RelatedDomain,
} from '@/components/dashboard/domains/domain-detail-types';
import { useAutoSslRefresh } from '@/hooks/use-auto-ssl-refresh';
import { useDomainData } from '@/hooks/use-domain-data';
import { useDomainConnections } from '@/hooks/use-domain-connections';
import { useDomainDns } from '@/hooks/use-domain-dns';
import { useDomainRegistrarSettings } from '@/hooks/use-domain-registrar-settings';

/* ── Related-domain helpers ── */
function computeRelated(domain: string, allDomains: string[]): RelatedDomain[] {
  const set = new Set(allDomains);
  const parts = domain.split('.');
  const result: RelatedDomain[] = [];

  // Parent zone (one label up, must exist in inventory)
  if (parts.length > 2) {
    const parent = parts.slice(1).join('.');
    if (set.has(parent)) {
      result.push({ domain: parent, role: 'parent' });
      // Sibling subdomains — same immediate parent, same depth
      for (const d of allDomains) {
        if (d !== domain && d.endsWith('.' + parent) && d.split('.').length === parts.length) {
          result.push({ domain: d, role: 'sibling' });
        }
      }
    }
  }

  // Direct subdomains — exactly one level deeper
  for (const d of allDomains) {
    if (d !== domain && d.endsWith('.' + domain) && d.split('.').length === parts.length + 1) {
      result.push({ domain: d, role: 'subdomain' });
    }
  }

  return result.sort((a, b) => {
    const order: Record<RelatedDomain['role'], number> = { parent: 0, sibling: 1, subdomain: 2 };
    return order[a.role] - order[b.role] || a.domain.localeCompare(b.domain);
  });
}

type OverallStatus =
  | 'Active'
  | 'Partially Active'
  | 'Purchase Pending'
  | 'Setup Pending'
  | 'Needs Attention'
  | 'Purchased'
  | 'Unknown';

function StatusPill({ status }: { status: OverallStatus }) {
  const cfg: Record<OverallStatus, { dot: string; text: string }> = {
    Active:            { dot: 'bg-emerald-400', text: 'text-emerald-300' },
    'Partially Active':{ dot: 'bg-cyan-400',     text: 'text-cyan-300' },
    'Purchase Pending':{ dot: 'bg-amber-400',   text: 'text-amber-300' },
    'Setup Pending':   { dot: 'bg-amber-400',   text: 'text-amber-300' },
    'Needs Attention': { dot: 'bg-red-400',      text: 'text-red-300' },
    Purchased:         { dot: 'bg-cyan-400',     text: 'text-cyan-300' },
    Unknown:           { dot: 'bg-white/30',     text: 'text-white/50' },
  };
  const { dot, text } = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

/* ── Page skeleton while initializing ── */
function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-56 animate-pulse rounded bg-white/[0.05]" />
      <div className="flex gap-2">
        {[80, 60, 100, 72].map((w, i) => (
          <div key={i} className={`h-5 w-${w} animate-pulse rounded-full bg-white/[0.05]`} />
        ))}
      </div>
      <div className="h-px w-full bg-white/[0.05]" />
      <div className="grid grid-cols-4 gap-4 pt-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}

export default function DomainDetailPage() {
  const params = useParams();
  const domainName = useMemo(
    () => normalizeDomain(decodeURIComponent(String(params.domain || ''))),
    [params.domain]
  );

  const parentDomain = useMemo(() => {
    const parts = domainName.split('.');
    return parts.length > 2 ? parts.slice(1).join('.') : null;
  }, [domainName]);

  const [subdomainInput, setSubdomainInput] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [relatedDomains, setRelatedDomains] = useState<RelatedDomain[]>([]);
  const refreshAllRef = useRef<() => Promise<void>>(async () => {});

  const domainData = useDomainData(domainName);
  const dnsData = useDomainDns(domainName);
  const { setConnections, setExpiresAt, setAutoRenew, loadDomainContext } = domainData;
  const { loadDnsRecords } = dnsData;

  const syncDomainMeta = useCallback(
    (expiresAt: string | null, autoRenew: boolean | null) => {
      if (expiresAt !== null) setExpiresAt(expiresAt);
      if (autoRenew !== null) setAutoRenew(autoRenew);
    },
    [setAutoRenew, setExpiresAt]
  );

  const registrarData = useDomainRegistrarSettings(domainName, syncDomainMeta);
  const { loadRegistrarSettings } = registrarData;

  const loadRelated = useCallback(async () => {
    try {
      const res = await fetch('/api/domains/inventory');
      const data = await res.json() as { data?: { domains?: { domain: string }[] } };
      const all = (data?.data?.domains ?? []).map((d) => d.domain);
      setRelatedDomains(computeRelated(domainName, all));
    } catch {
      // non-critical — silently skip
    }
  }, [domainName]);

  const connectionsData = useDomainConnections(
    domainName,
    domainData.connections,
    setConnections,
    useCallback(() => refreshAllRef.current(), [])
  );

  const attachDomain = useMemo(() => {
    const clean = subdomainInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!clean) return domainName;
    return `${clean}.${domainName}`;
  }, [domainName, subdomainInput]);

  useEffect(() => {
    let isActive = true;
    setInitializing(true);
    void Promise.allSettled([loadDomainContext(), loadDnsRecords(), loadRegistrarSettings(), loadRelated()])
      .finally(() => {
        if (isActive) setInitializing(false);
      });
    return () => { isActive = false; };
  }, [domainName, loadDnsRecords, loadDomainContext, loadRegistrarSettings, loadRelated]);

  const isPageLoading = domainData.loading || dnsData.dnsLoading || registrarData.registrarLoading;

  const appOptions: DomainAppOption[] = useMemo(
    () => domainData.apps.map((app) => ({ id: app.id, name: app.name, status: app.status })),
    [domainData.apps]
  );

  const connectedAppNames = useMemo(() => {
    const unique = new Set(domainData.connections.map((item) => item.appName));
    return Array.from(unique);
  }, [domainData.connections]);

  const overallStatus = useMemo((): OverallStatus => {
    if (domainData.connections.some((c) => c.status === 'failed')) return 'Needs Attention';
    if (
      domainData.purchaseRequest?.status === 'requested' ||
      domainData.purchaseRequest?.status === 'processing'
    ) return 'Purchase Pending';
    const hasActive = domainData.connections.some((c) => c.status === 'active');
    const hasPendingSetup = domainData.connections.some((c) => c.status === 'pending' || c.status === 'verified');
    if (hasActive && hasPendingSetup) return 'Partially Active';
    if (hasPendingSetup) return 'Setup Pending';
    if (domainData.connections.some((c) => c.status === 'active')) return 'Active';
    if (domainData.purchaseRequest?.status === 'completed') return 'Purchased';
    return 'Unknown';
  }, [domainData.connections, domainData.purchaseRequest]);

  const issuingConnectionIds = useMemo(
    () => domainData.connections.filter((c) => c.sslStatus === 'issuing').map((c) => c.id),
    [domainData.connections]
  );
  useAutoSslRefresh(issuingConnectionIds, domainData.loadDomainContext);

  const handleRefresh = useCallback(async () => {
    await Promise.all([loadDomainContext(), loadDnsRecords(), loadRegistrarSettings()]);
  }, [loadDomainContext, loadDnsRecords, loadRegistrarSettings]);

  useEffect(() => {
    refreshAllRef.current = handleRefresh;
  }, [handleRefresh]);

  return (
    <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-white/40">
          <Link href="/dashboard/domains" className="hover:text-white/70 transition-colors">
            Domains
          </Link>
          {parentDomain && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-white/20" />
              <Link
                href={`/dashboard/domains/${encodeURIComponent(parentDomain)}`}
                className="font-mono hover:text-white/70 transition-colors"
              >
                {parentDomain}
              </Link>
            </>
          )}
          <ChevronRight className="h-3.5 w-3.5 text-white/20" />
          <span className="font-mono text-white/70">{domainName}</span>
        </nav>

        {/* Domain header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight font-mono text-white truncate">
              {domainName}
            </h1>
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-white/45">
              <StatusPill status={overallStatus} />
              <span>{domainData.connections.length} connection{domainData.connections.length !== 1 ? 's' : ''}</span>
              {connectedAppNames.length > 0 && (
                <span>{connectedAppNames.join(', ')}</span>
              )}
              {domainData.expiresAt && (
                <span>
                  Expires{' '}
                  <span className="text-white/60">
                    {new Date(domainData.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </span>
              )}
              {domainData.autoRenew !== null && (
                <span className={domainData.autoRenew ? 'text-emerald-400/80' : 'text-white/35'}>
                  Auto-renew {domainData.autoRenew ? 'on' : 'off'}
                </span>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="self-start text-white/40 hover:text-white hover:bg-white/[0.06] shrink-0"
            onClick={handleRefresh}
            disabled={isPageLoading}
          >
            {isPageLoading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {/* Error */}
        {domainData.error && (
          <div className="flex items-center gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {looksInternal(domainData.error)
              ? 'Unable to load this domain. Refresh the page to try again.'
              : domainData.error}
          </div>
        )}

        {/* Tabs */}
        {initializing ? (
          <PageSkeleton />
        ) : (
          <Tabs defaultValue="overview">
            {/* Underline tab bar */}
            <div className="border-b border-white/[0.06]">
              <TabsList className="bg-transparent border-0 h-auto p-0 gap-0 rounded-none -mb-px">
                {[
                  { value: 'overview',     label: 'Overview' },
                  { value: 'connections',  label: 'Connections' },
                  { value: 'dns',          label: 'DNS' },
                  { value: 'settings',     label: 'Settings' },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-white/45 data-[state=active]:border-white data-[state=active]:text-white data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-white/70 transition-colors"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="pt-5">
              <TabsContent value="overview" className="mt-0">
                <DomainOverviewTab
                  purchaseRequest={domainData.purchaseRequest}
                  connections={domainData.connections}
                  connectedAppNames={connectedAppNames}
                  relatedDomains={relatedDomains}
                />
              </TabsContent>

              <TabsContent value="connections" className="mt-0">
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
                  anyOperationRunning={connectionsData.anyOperationRunning}
                  usingCustomNameservers={registrarData.registrarSettings?.nameserver_mode === 'custom'}
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

              <TabsContent value="dns" className="mt-0">
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

              <TabsContent value="settings" className="mt-0">
                <DomainSettingsTab
                  registrarLoading={registrarData.registrarLoading}
                  registrarError={registrarData.registrarError}
                  registrarSettings={registrarData.registrarSettings}
                  savingAutorenew={registrarData.savingAutorenew}
                  savingNameservers={registrarData.savingNameservers}
                  connections={domainData.connections}
                  onToggleAutorenew={registrarData.onToggleAutorenew}
                  onSetNameservers={registrarData.onSetNameservers}
                  onUseManagedNameservers={registrarData.onUseManagedNameservers}
                />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
}
