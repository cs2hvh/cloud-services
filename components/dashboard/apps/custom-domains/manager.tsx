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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
    navigator.clipboard.writeText(text);
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
          `${domainName || 'Domain'} activated. Add ${recordType} ${recordName}${recordValue ? ` -> ${recordValue}` : ''} at your DNS provider.`,
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
        toast.error('Secure connection failed. Verify DNS settings and re-activate the domain.');
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
      <Card className="glass-panel border-white/[0.08] rounded-none">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-white/50" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel border-white/[0.06] rounded-none">
      <CardHeader className="border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-3 text-2xl font-semibold text-white">
              <Globe className="h-6 w-6" />
              App Domains
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-white/60">
              Connect a domain to this app. Purchase domains globally from the Marketplace.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/dashboard/domains/marketplace">
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 text-white hover:bg-white/8 rounded-md px-3"
              >
                Open Marketplace
              </Button>
            </Link>
            <Link href="/dashboard/domains">
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 text-white hover:bg-white/8 rounded-md px-3"
              >
                Domains Dashboard
              </Button>
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
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Active', count: domainCounts.active },
            { label: 'Pending Setup', count: domainCounts.pending },
            { label: 'Needs Attention', count: domainCounts.failed },
          ].map(({ label, count }) => (
            <div
              key={label}
              className="rounded-lg border border-white/[0.06] bg-gradient-to-b from-white/[0.01] to-transparent p-4 flex flex-col items-center justify-center min-h-[88px]"
            >
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">{label}</p>
              <p className="mt-1 text-2xl font-bold text-white">{count}</p>
            </div>
          ))}
        </div>

        {/* Platform domain */}
        <div className="rounded-md border border-white/10 bg-black/20 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Platform Domain</p>
            <p className="text-xs text-white/55">Default domain, always active.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-white/5 px-3 py-1 font-mono text-sm text-white">
              {platformDomain}
            </div>
            <Badge className="border-green-500/30 bg-green-500/20 text-green-300">Active</Badge>
            <a
              href={`https://${platformDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-cyan-200 hover:text-cyan-100"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Domain list */}
        {domains.length === 0 ? (
          <div className="border border-dashed border-white/15 p-6 text-center text-white/60">
            <Globe className="mx-auto mb-2 h-8 w-8 opacity-60" />
            <p className="font-medium text-white/70">No custom domains yet</p>
            <p className="mt-1 text-xs">
              Click <strong>Add Domain</strong> to connect a domain you own, or visit the
              Marketplace to purchase one.
            </p>
          </div>
        ) : (
          domains.map((domain) => (
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
          ))
        )}

        {/* Remove confirmation dialog */}
        <AlertDialog
          open={removeConfirmId !== null}
          onOpenChange={(open) => {
            if (!open && !removingId) setRemoveConfirmId(null);
          }}
        >
          <AlertDialogContent className="border-white/10 bg-zinc-900 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove domain?</AlertDialogTitle>
              <AlertDialogDescription className="text-white/60">
                <strong className="text-white">
                  {domains.find((d) => d.id === removeConfirmId)?.domain}
                </strong>{' '}
                will be disconnected from this app. It will remain in your domain inventory and can
                be re-added at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="border-white/20 bg-transparent text-white hover:bg-white/10"
                disabled={removingId !== null}
              >
                Keep it
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={removingId !== null}
                onClick={() => {
                  if (removeConfirmId) void handleRemoveDomain(removeConfirmId);
                }}
              >
                {removingId !== null ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Removing…</>
                ) : (
                  'Remove domain'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
