'use client';

import Link from 'next/link';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { ExternalLink, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { copyToClipboard as safeCopyToClipboard } from '@/lib/utils/safe-clipboard';
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};

import { AddDomainDialog } from './add-domain-dialog';
import { DomainCard } from './domain-card';
import {
  friendlyError,
  normalizeDomainInput,
  operationFailureFallback,
  sanitizeOperationError,
  sanitizeSubdomainLabel,
} from './utils';
import type {
  AddDomainMode,
  CustomDomain,
  CustomDomainsManagerProps,
  DomainInventoryItem,
  VerificationInstructions,
} from './types';
import { useAutoSslRefresh } from '@/hooks/use-auto-ssl-refresh';

export function CustomDomainsManager({ appId, appStatus, platformDomain }: CustomDomainsManagerProps) {
  // ── Data ─────────────────────────────────────────────────────────────────
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [inventoryDomains, setInventoryDomains] = useState<DomainInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  // ── Add-domain dialog ─────────────────────────────────────────────────────
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddDomainMode>('existing');
  const [selectedExistingDomain, setSelectedExistingDomain] = useState('');
  const [subdomainLabel, setSubdomainLabel] = useState('');
  const [externalDomain, setExternalDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [verificationInstructions, setVerificationInstructions] =
    useState<VerificationInstructions | null>(null);

  // ── Per-domain action state ───────────────────────────────────────────────
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [checkingSslId, setCheckingSslId] = useState<string | null>(null);

  // ── Derived values ────────────────────────────────────────────────────────
  const anyOperationRunning = !!(verifyingId || activatingId || settingPrimaryId || removingId || checkingSslId);
  const existingDomainOptions = useMemo(() => {
    const unique = new Map<string, DomainInventoryItem>();
    inventoryDomains.forEach((item) => {
      const domain = normalizeDomainInput(item.domain);
      if (!domain) return;
      if (!unique.has(domain)) unique.set(domain, item);
    });
    return Array.from(unique.values()).sort((a, b) => a.domain.localeCompare(b.domain));
  }, [inventoryDomains]);

  useEffect(() => {
    if (!selectedExistingDomain && existingDomainOptions.length > 0) {
      setSelectedExistingDomain(existingDomainOptions[0].domain);
      return;
    }
    if (
      selectedExistingDomain &&
      !existingDomainOptions.some((item) => item.domain === selectedExistingDomain)
    ) {
      setSelectedExistingDomain(existingDomainOptions[0]?.domain || '');
    }
  }, [existingDomainOptions, selectedExistingDomain]);

  const selectedTargetDomain = useMemo(() => {
    if (addMode !== 'existing') return normalizeDomainInput(externalDomain);
    const root = normalizeDomainInput(selectedExistingDomain);
    if (!root) return '';
    const cleanLabel = sanitizeSubdomainLabel(subdomainLabel);
    return cleanLabel ? `${cleanLabel}.${root}` : root;
  }, [addMode, externalDomain, selectedExistingDomain, subdomainLabel]);

  const domainCounts = useMemo(
    () =>
      domains.reduce(
        (acc, d) => {
          if (d.status === 'active') acc.active += 1;
          if (d.status === 'pending' || d.status === 'verified') acc.pending += 1;
          if (d.status === 'failed') acc.failed += 1;
          return acc;
        },
        { active: 0, pending: 0, failed: 0 },
      ),
    [domains],
  );

  // Reset verification instructions when mode changes
  useEffect(() => {
    setVerificationInstructions(null);
  }, [addMode]);

  // ── Data fetchers ─────────────────────────────────────────────────────────
  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch(`/api/domains?app_id=${appId}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Unable to load your domains. Refresh the page to try again.'));
        setDomains([]);
        return;
      }
      setDomains((data?.domains || []) as CustomDomain[]);
    } catch {
      toast.error('Unable to load your domains. Refresh the page to try again.');
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const fetchInventoryDomains = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const res = await fetch('/api/domains/inventory');
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Unable to load your available domains. Refresh to try again.'));
        setInventoryDomains([]);
        return;
      }
      setInventoryDomains((data?.data?.domains || []) as DomainInventoryItem[]);
    } catch {
      toast.error('Unable to load your available domains. Refresh to try again.');
      setInventoryDomains([]);
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchDomains(), fetchInventoryDomains()]);
  }, [fetchDomains, fetchInventoryDomains]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Auto-refresh while any domain is still issuing an SSL cert.
  const issuingDomainIds = useMemo(
    () => domains.filter((d) => d.ssl_status === 'issuing').map((d) => d.id),
    [domains],
  );
  useAutoSslRefresh(issuingDomainIds, fetchDomains);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const copyToClipboard = (text: string, field: string) => {
    void safeCopyToClipboard(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const closeAddDialog = () => {
    setAddDialogOpen(false);
    setVerificationInstructions(null);
    setExternalDomain('');
    setSubdomainLabel('');
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const submitAddDomain = async () => {
    const domain = selectedTargetDomain;
    if (!domain) {
      toast.error('Please enter a domain name.');
      return;
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      toast.error('Enter a valid domain — for example: example.com or app.example.com');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, domain }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Failed to add domain. Please try again.'));
        return;
      }
      if (data?.verification_required) {
        setVerificationInstructions(data?.verification_instructions || null);
        toast.success(`${domain} added — add the TXT record shown to verify you own this domain.`);
      } else {
        toast.success(`${domain} added. Activate it once your DNS is ready.`);
        closeAddDialog();
      }
      await refreshAll();
    } catch {
      toast.error('Failed to add domain. Please check your connection and try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleVerifyDomain = async (domainId: string) => {
    setVerifyingId(domainId);
    const domainName = domains.find((d) => d.id === domainId)?.domain;
    try {
      const res = await fetch(`/api/domains/${domainId}/verify`, { method: 'POST' });
      const data = await res.json();
      if (data.verified) {
        toast.success(
          `${domainName ? `${domainName} verified` : 'Domain verified'} — you can now activate it.`,
        );
        await fetchDomains();
      } else {
        toast.error(
          friendlyError(
            data,
            'Verification failed — check that your TXT record exactly matches the value shown and try again.',
          ),
        );
      }
    } catch {
      toast.error('Verification check failed. Check your connection and try again.');
    } finally {
      setVerifyingId(null);
    }
  };

  const pollOperation = async (operationId: string): Promise<Record<string, unknown> | null> => {
    const maxAttempts = 75; // 75 × 2s = 150s — covers the async activation window
    const delayMs = 2000;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const res = await fetch(`/api/domains/operations/${operationId}`);
      const data = await res.json();
      if (!res.ok) throw new Error('Unable to check setup status. Please refresh and try again.');
      const status = data?.operation?.status;
      if (status === 'succeeded') {
        return (data?.operation?.response_data || null) as Record<string, unknown> | null;
      }
      if (status === 'failed') {
        const errorCode = data?.operation?.error_code;
        const rawMsg = data?.operation?.error_message;
        throw new Error(
          sanitizeOperationError(rawMsg, operationFailureFallback(errorCode)),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error('Setup is taking longer than expected. Refresh to check the current status.');
  };

  const handleActivateDomain = async (domainId: string) => {
    if (appStatus !== 'running') {
      toast.error(
        'Your app needs to be running before you can activate a custom domain. Start your app first.',
      );
      return;
    }
    const domainName = domains.find((d) => d.id === domainId)?.domain;
    setActivatingId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}/activate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(friendlyError(data, 'Activation failed. Please try again.'));
        return;
      }
      let responseData: Record<string, unknown> | null = null;
      if (data.operation_id) {
        toast.info(`Setting up ${domainName || 'domain'}\u2026 this may take up to 2 minutes.`);
        responseData = await pollOperation(data.operation_id);
      }
      const dnsAutoConfigured =
        responseData && typeof responseData.dns_auto_configured === 'boolean'
          ? responseData.dns_auto_configured
          : true;
      const routingInstructions =
        responseData && typeof responseData.routing_instructions === 'object'
          ? (responseData.routing_instructions as Record<string, unknown>)
          : null;

      if (!dnsAutoConfigured && routingInstructions) {
        const recordType =
          typeof routingInstructions.record_type === 'string'
            ? routingInstructions.record_type
            : 'DNS';
        const recordName =
          typeof routingInstructions.record_name === 'string'
            ? routingInstructions.record_name
            : domainName || 'domain';
        const recordValue =
          typeof routingInstructions.record_value === 'string'
            ? routingInstructions.record_value
            : '';

        toast.warning(
          `${domainName || 'Domain'} activated. Add ${recordType} ${recordName}${recordValue ? ` with value ${recordValue}` : ''} at your DNS provider.`,
        );
      } else if (!dnsAutoConfigured) {
        toast.warning(
          `${domainName || 'Domain'} activated. Update DNS at your provider, then secure connection will finish.`,
        );
      } else {
        toast.success(
          `${domainName || 'Domain'} is now live\u2014secure connection setup will finish shortly.`,
        );
      }
      await fetchDomains();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Activation failed. Please try again.');
    } finally {
      setActivatingId(null);
    }
  };

  const handleCheckSsl = async (domainId: string) => {
    setCheckingSslId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}/check-ssl`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Could not check SSL status. Try refreshing.'));
        return;
      }
      if (data.ssl_status === 'active') {
        toast.success('Secure connection is now active — your traffic is encrypted.');
      } else if (data.ssl_status === 'issuing') {
        if (data.dns_ready === false && data.dns_message) {
          toast.warning(`DNS not ready: ${data.dns_message}`);
        } else {
          toast.info('Certificate is still being issued. Check again in a minute.');
        }
      } else if (data.ssl_status === 'failed') {
        if (data.dns_ready === true && data.dns_message) {
          toast.error(data.dns_message);
        } else {
          toast.error('Secure connection failed. Verify DNS settings and re-activate the domain.');
        }
      }
      await fetchDomains();
    } catch {
      toast.error('SSL check failed. Please try again.');
    } finally {
      setCheckingSslId(null);
    }
  };

  const handleRemoveDomain = async (domainId: string) => {
    const domainName = domains.find((d) => d.id === domainId)?.domain;
    setRemovingId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Failed to remove domain. Please try again.'));
        return;
      }
      toast.success(`${domainName || 'Domain'} has been removed from this app.`);
      await fetchDomains();
      await fetchInventoryDomains();
    } catch {
      toast.error('Failed to remove domain. Please try again.');
    } finally {
      setRemovingId(null);
      setRemoveConfirmId(null);
    }
  };

  const handleSetPrimary = async (domainId: string) => {
    const primaryDomain = domains.find((d) => d.id === domainId)?.domain;
    setSettingPrimaryId(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}/set-primary`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(friendlyError(data, 'Failed to update primary domain. Please try again.'));
        return;
      }
      toast.success(`${primaryDomain || 'Domain'} is now your primary domain.`);
      await fetchDomains();
    } catch {
      toast.error('Failed to update primary domain. Please try again.');
    } finally {
      setSettingPrimaryId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    );
  }

  const statCells: Array<{ label: string; count: number; accent: string }> = [
    { label: 'Active', count: domainCounts.active, accent: '#4ade80' },
    { label: 'Pending Setup', count: domainCounts.pending, accent: '#fbbf24' },
    { label: 'Needs Attention', count: domainCounts.failed, accent: '#f87171' },
  ];

  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
      <div className="border-b border-white/[0.06] px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-white/45" />
          <div>
            <h3 className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/65 font-semibold`}>
              App domains
            </h3>
            <p className={`${MONO} mt-1 text-[10.5px] text-white/40`}>
              Connect a domain to this app. Purchase domains globally from the Marketplace.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/dashboard/domains/marketplace"
            className={`${MONO} h-9 inline-flex items-center gap-1.5 px-3 border border-white/[0.08] bg-[#0d0e11] text-[10.5px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
          >
            Marketplace
          </Link>
          <Link
            href="/dashboard/domains"
            className={`${MONO} h-9 inline-flex items-center gap-1.5 px-3 border border-white/[0.08] bg-[#0d0e11] text-[10.5px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
          >
            Domains
          </Link>
          <AddDomainDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            addMode={addMode}
            setAddMode={setAddMode}
            selectedExistingDomain={selectedExistingDomain}
            setSelectedExistingDomain={setSelectedExistingDomain}
            subdomainLabel={subdomainLabel}
            setSubdomainLabel={setSubdomainLabel}
            externalDomain={externalDomain}
            setExternalDomain={setExternalDomain}
            adding={adding}
            verificationInstructions={verificationInstructions}
            inventoryLoading={inventoryLoading}
            existingDomainOptions={existingDomainOptions}
            selectedTargetDomain={selectedTargetDomain}
            copiedField={copiedField}
            onCopy={copyToClipboard}
            onSubmit={() => void submitAddDomain()}
            onClose={closeAddDialog}
            disabled={anyOperationRunning}
          />
        </div>
      </div>

      {/* Stats strip */}
      <div className="border-b border-white/[0.06] grid grid-cols-3 divide-x divide-white/[0.06]">
        {statCells.map((s) => (
          <div key={s.label} className="px-5 py-4 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: s.accent, boxShadow: `0 0 6px ${s.accent}` }}
              />
              <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                {s.label}
              </span>
            </div>
            <span
              style={SERIF_STYLE}
              className="text-[26px] leading-none font-bold tabular-nums tracking-[-0.025em] text-white"
            >
              {s.count}
            </span>
          </div>
        ))}
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* Platform domain */}
        <div className="border border-white/[0.06] bg-[#0d0e11] rounded-[5px] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className={`${MONO} text-[11px] uppercase tracking-[0.12em] text-white/75 font-semibold`}>
              Platform domain
            </p>
            <p className={`${MONO} mt-0.5 text-[10.5px] text-white/40`}>
              Default domain, always active.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`${MONO} inline-flex items-center px-2.5 py-1 border border-white/[0.06] bg-[#111216] text-[11.5px] text-white rounded-[5px]`}>
              {platformDomain}
            </span>
            <span className={`${MONO} inline-flex items-center gap-1.5 px-2.5 py-1 border border-emerald-500/25 bg-emerald-500/[0.08] text-[10px] uppercase tracking-[0.12em] text-emerald-300 rounded-[20px]`}>
              <span
                className="h-1 w-1 rounded-full bg-emerald-400"
                style={{ boxShadow: "0 0 5px #4ade80" }}
              />
              Active
            </span>
            <a
              href={`https://${platformDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/35 hover:text-[#0095FF] transition-colors"
              title="Open"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Domain list */}
        {domains.length === 0 ? (
          <div className="border border-dashed border-white/[0.12] rounded-[5px] px-6 py-10 text-center">
            <Globe className="mx-auto mb-3 h-7 w-7 text-white/25" />
            <p className={`${MONO} text-[12px] uppercase tracking-[0.12em] text-white/65 font-semibold`}>
              No custom domains yet
            </p>
            <p className={`${MONO} mt-2 text-[11px] text-white/40 max-w-md mx-auto leading-relaxed`}>
              Click Add Domain to connect a domain you own, or visit the Marketplace to purchase one.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {domains.map((domain) => (
              <DomainCard
                key={domain.id}
                domain={domain}
                appStatus={appStatus}
                verifyingId={verifyingId}
                activatingId={activatingId}
                settingPrimaryId={settingPrimaryId}
                removingId={removingId}
                copiedField={copiedField}
                checkingSslId={checkingSslId}
                anyOperationRunning={anyOperationRunning}
                onVerify={(id) => void handleVerifyDomain(id)}
                onActivate={(id) => void handleActivateDomain(id)}
                onSetPrimary={(id) => void handleSetPrimary(id)}
                onRemoveConfirm={setRemoveConfirmId}
                onCopy={copyToClipboard}
                onCheckSsl={(id) => void handleCheckSsl(id)}
              />
            ))}
          </div>
        )}

        {/* Remove confirmation dialog */}
        <AlertDialog
          open={removeConfirmId !== null}
          onOpenChange={(open) => {
            if (!open && !removingId) setRemoveConfirmId(null);
          }}
        >
          <AlertDialogContent className="bg-[#0d0e11] border border-white/[0.08] rounded-[6px] text-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[16px] font-semibold">
                Remove domain?
              </AlertDialogTitle>
              <AlertDialogDescription className={`${MONO} text-[11.5px] text-white/55 leading-relaxed`}>
                <strong className="text-white font-semibold">
                  {domains.find((d) => d.id === removeConfirmId)?.domain}
                </strong>{' '}
                will be disconnected from this app. It will remain in your domain inventory and can
                be re-added at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className={`${MONO} h-10 px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px]`}
                disabled={removingId !== null}
              >
                Keep it
              </AlertDialogCancel>
              <AlertDialogAction
                className={`${MONO} h-10 px-3.5 border border-rose-500/25 bg-rose-500/[0.08] text-[11px] uppercase tracking-[0.14em] text-rose-300 hover:bg-rose-500/[0.15] rounded-[5px]`}
                disabled={removingId !== null}
                onClick={() => {
                  if (removeConfirmId) void handleRemoveDomain(removeConfirmId);
                }}
              >
                {removingId !== null ? (
                  <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Removing</>
                ) : (
                  'Remove domain'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
