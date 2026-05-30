'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ChevronRight, Globe, RefreshCw } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ─── Design tokens ─────────────────────────────────────────────────
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';
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

const STATUS_COLOR: Record<OverallStatus, string> = {
  Active: '#4ade80',
  'Partially Active': ACCENT,
  'Purchase Pending': '#fbbf24',
  'Setup Pending': '#fbbf24',
  'Needs Attention': '#f87171',
  Purchased: ACCENT,
  Unknown: 'rgba(255,255,255,0.45)',
};

function StatusPill({ status }: { status: OverallStatus }) {
  const color = STATUS_COLOR[status];
  const pulse = status.includes('Pending');
  return (
    <span className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold`} style={{ color }}>
      <span
        className={`h-1.5 w-1.5 rounded-full shrink-0 ${pulse ? 'animate-pulse' : ''}`}
        style={{ background: color, boxShadow: status === 'Unknown' ? 'none' : `0 0 5px ${color}` }}
      />
      {status}
    </span>
  );
}

/* ── Page skeleton while initializing ── */
function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-full max-w-[360px] animate-pulse rounded-[8px] bg-white/[0.05]" />
      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-[6px] bg-white/[0.04]" />
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
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]" style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)' }} />
        <div className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]" style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)', backgroundSize: '28px 28px' }} />
      </div>

      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
        <div className="mx-auto max-w-[1280px]">

          {/* Breadcrumb */}
          <nav className={`${MONO} flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/40 mb-5`}>
            <Link href="/dashboard/domains" className="hover:text-white/75 transition-colors">Domains</Link>
            {parentDomain && (
              <>
                <ChevronRight className="h-3 w-3 text-white/20" />
                <Link href={`/dashboard/domains/${encodeURIComponent(parentDomain)}`} className="normal-case tracking-normal hover:text-white/75 transition-colors">
                  {parentDomain}
                </Link>
              </>
            )}
            <ChevronRight className="h-3 w-3 text-white/20" />
            <span className="normal-case tracking-normal text-white/70">{domainName}</span>
          </nav>

          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 pb-6 border-b border-white/[0.06]">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-12 w-12 shrink-0 inline-flex items-center justify-center border border-white/[0.09] rounded-[8px]" style={{ background: 'linear-gradient(135deg, #16181d, #1a1c23)', color: ACCENT }}>
                <Globe className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className={`${MONO} text-[22px] sm:text-[26px] leading-none tracking-[-0.01em] text-white font-semibold truncate`}>
                  {domainName}
                </h1>
                <div className={`${MONO} mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-white/45`}>
                  <StatusPill status={overallStatus} />
                  <span className="text-white/15">·</span>
                  <span>{domainData.connections.length} connection{domainData.connections.length !== 1 ? 's' : ''}</span>
                  {connectedAppNames.length > 0 && (
                    <>
                      <span className="text-white/15">·</span>
                      <span className="text-white/60 truncate">{connectedAppNames.join(', ')}</span>
                    </>
                  )}
                  {domainData.expiresAt && (
                    <>
                      <span className="text-white/15">·</span>
                      <span>Expires <span className="text-white/65">{new Date(domainData.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
                    </>
                  )}
                  {domainData.autoRenew !== null && (
                    <>
                      <span className="text-white/15">·</span>
                      <span className={domainData.autoRenew ? 'text-emerald-400/80' : 'text-white/35'}>Auto-renew {domainData.autoRenew ? 'on' : 'off'}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={isPageLoading}
              className={`${MONO} self-start sm:self-center inline-flex h-9 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50 shrink-0`}
            >
              <RefreshCw className={`h-3 w-3 ${isPageLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {/* Error */}
          {domainData.error && (
            <div className="mb-5 flex items-center gap-2.5 border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-[12.5px] text-red-200 rounded-[6px]">
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
              {/* Pill tab bar */}
              <div className="inline-flex items-center gap-1 rounded-[8px] border border-white/[0.10] bg-white/[0.03] p-1">
                <TabsList className="bg-transparent border-0 h-auto p-0 gap-1 rounded-none">
                  {[
                    { value: 'overview',     label: 'Overview' },
                    { value: 'connections',  label: 'Connections' },
                    { value: 'dns',          label: 'DNS' },
                    { value: 'settings',     label: 'Settings' },
                  ].map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={`${MONO} rounded-[6px] px-4 py-2 text-[11.5px] uppercase tracking-[0.12em] font-semibold text-white/55 hover:text-white/85 transition-colors data-[state=active]:text-white data-[state=active]:bg-[rgba(0,149,255,0.10)] data-[state=active]:shadow-[inset_0_0_0_1px_rgba(0,149,255,0.35)]`}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="pt-6">
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
    </div>
  );
}
