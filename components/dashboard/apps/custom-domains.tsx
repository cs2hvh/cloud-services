'use client';

import Link from 'next/link';
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Star,
  Trash2,
} from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CustomDomain {
  id: string;
  app_id: string;
  domain: string;
  status: 'pending' | 'verified' | 'active' | 'failed' | 'removed';
  verification_token: string;
  verification_method: string;
  verified_at: string | null;
  activated_at: string | null;
  ssl_status: string;
  is_primary: boolean;
  last_error: string | null;
  created_at: string;
  dns_ready?: boolean;
  dns_message?: string;
  dns_resolved_ips?: string[];
  dns_expected_ips?: string[];
}

interface DomainInventoryItem {
  domain: string;
  source: 'purchased' | 'external' | 'mixed';
  purchase: {
    status: 'requested' | 'processing' | 'completed' | 'failed' | 'cancelled';
  } | null;
}

interface CustomDomainsManagerProps {
  appId: string;
  appStatus: string;
  platformDomain: string;
}

type AddDomainMode = 'existing' | 'external';

interface VerificationInstructions {
  record_type: string;
  record_name: string;
  record_value: string;
}

// ─── Error helpers ───────────────────────────────────────────────────────────

const API_ERROR_MESSAGES: Record<string, string> = {
  DOMAIN_LIMIT_REACHED: "You've reached the maximum number of domains for this app. Remove one to add another.",
  DOMAIN_ALREADY_EXISTS: 'This domain is already connected to an app.',
  DOMAIN_ALREADY_IN_USE: 'This domain is already in use by another app.',
  NOT_FOUND: 'Domain not found — it may have already been removed.',
  DOMAIN_NOT_MANAGED: "This domain isn't managed through your account.",
  TOO_MANY_REQUESTS: 'Too many requests — please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong on our end. Please try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: "You don't have permission to do that.",
  VALIDATION_ERROR: 'Please check your input and try again.',
};

function looksInternal(msg: string): boolean {
  return /supabase|postgres|sql[\s(]|stack trace|node_modules|\.ts:\d|undefined is not|cannot read property|fetch failed|econnrefused|503|500 internal/i.test(msg);
}

function friendlyError(data: Record<string, unknown> | null | undefined, fallback: string): string {
  const code = typeof data?.error === 'string' ? data.error : '';
  const message = typeof data?.message === 'string' ? data.message : '';
  if (code && API_ERROR_MESSAGES[code]) return API_ERROR_MESSAGES[code];
  if (message && !looksInternal(message)) return message;
  return fallback;
}

function sanitizeOperationError(msg: string | undefined | null, fallback: string): string {
  if (!msg) return fallback;
  if (looksInternal(msg)) return fallback;
  return msg;
}

// ─────────────────────────────────────────────────────────────────────────────

function normalizeDomainInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

function sanitizeSubdomainLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

export function CustomDomainsManager({
  appId,
  appStatus,
  platformDomain,
}: CustomDomainsManagerProps) {
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [inventoryDomains, setInventoryDomains] = useState<DomainInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddDomainMode>('existing');
  const [selectedExistingDomain, setSelectedExistingDomain] = useState('');
  const [subdomainLabel, setSubdomainLabel] = useState('');
  const [externalDomain, setExternalDomain] = useState('');
  const [adding, setAdding] = useState(false);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [verificationInstructions, setVerificationInstructions] = useState<VerificationInstructions | null>(null);

  const existingDomainOptions = useMemo(() => {
    const unique = new Map<string, DomainInventoryItem>();

    inventoryDomains.forEach((item) => {
      const domain = normalizeDomainInput(item.domain);
      if (!domain) return;
      if (!unique.has(domain)) {
        unique.set(domain, item);
      }
    });

    return Array.from(unique.values()).sort((a, b) => a.domain.localeCompare(b.domain));
  }, [inventoryDomains]);

  useEffect(() => {
    if (!selectedExistingDomain && existingDomainOptions.length > 0) {
      setSelectedExistingDomain(existingDomainOptions[0].domain);
      return;
    }

    if (selectedExistingDomain && !existingDomainOptions.some((item) => item.domain === selectedExistingDomain)) {
      setSelectedExistingDomain(existingDomainOptions[0]?.domain || '');
    }
  }, [existingDomainOptions, selectedExistingDomain]);

  const selectedTargetDomain = useMemo(() => {
    if (addMode !== 'existing') {
      return normalizeDomainInput(externalDomain);
    }

    const root = normalizeDomainInput(selectedExistingDomain);
    if (!root) return '';

    const cleanLabel = sanitizeSubdomainLabel(subdomainLabel);
    return cleanLabel ? `${cleanLabel}.${root}` : root;
  }, [addMode, externalDomain, selectedExistingDomain, subdomainLabel]);

  const domainCounts = useMemo(() => {
    return domains.reduce(
      (acc, domain) => {
        if (domain.status === 'active') acc.active += 1;
        if (domain.status === 'pending' || domain.status === 'verified') acc.pending += 1;
        if (domain.status === 'failed') acc.failed += 1;
        return acc;
      },
      { active: 0, pending: 0, failed: 0 }
    );
  }, [domains]);

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

  useEffect(() => {
    setVerificationInstructions(null);
  }, [addMode]);

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
      const res = await fetch(`/api/domains/${domainId}/verify`, {
        method: 'POST',
      });

      const data = await res.json();

      if (data.verified) {
        toast.success(`${domainName ? `${domainName} verified` : 'Domain verified'} — you can now activate it.`);
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

  const pollOperation = async (operationId: string) => {
    const maxAttempts = 75; // 75 × 2s = 150s — covers Jenkins 120s pipeline timeout
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

  const handleActivateDomain = async (domainId: string) => {
    if (appStatus !== 'running') {
      toast.error('Your app needs to be running before you can activate a custom domain. Start your app first.');
      return;
    }

    const domainName = domains.find((d) => d.id === domainId)?.domain;
    setActivatingId(domainId);

    try {
      const res = await fetch(`/api/domains/${domainId}/activate`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(friendlyError(data, 'Activation failed. Please try again.'));
        return;
      }

      if (data.operation_id) {
        toast.info(`Setting up ${domainName || 'domain'}\u2026 this may take up to 2 minutes.`);
        await pollOperation(data.operation_id);
      }

      toast.success(`${domainName || 'Domain'} is now live\u2014your SSL certificate will be ready shortly.`);
      await fetchDomains();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Activation failed. Please try again.');
    } finally {
      setActivatingId(null);
    }
  };

  const handleRemoveDomain = async (domainId: string) => {
    const domainName = domains.find((d) => d.id === domainId)?.domain;
    setRemovingId(domainId);

    try {
      const res = await fetch(`/api/domains/${domainId}`, {
        method: 'DELETE',
      });

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

    try {
      const res = await fetch(`/api/domains/${domainId}/set-primary`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(friendlyError(data, 'Failed to update primary domain. Please try again.'));
        return;
      }

      toast.success(`${primaryDomain || 'Domain'} is now your primary domain.`);
      await fetchDomains();
    } catch {
      toast.error('Failed to update primary domain. Please try again.');
    }
  };

  const renderDnsStatus = (domain: CustomDomain) => {
    if (domain.status === 'removed') return null;
    if (typeof domain.dns_ready !== 'boolean' && !domain.dns_message) return null;
    // Don't show DNS status for pending/unverified domains — verify first
    if (domain.status === 'pending') return null;

    const resolved = domain.dns_resolved_ips?.length
      ? domain.dns_resolved_ips.join(', ')
      : null;

    const friendlyMessage = domain.dns_ready
      ? 'Your DNS is correctly pointing to our servers.'
      : (domain.dns_message && !looksInternal(domain.dns_message)
          ? domain.dns_message
          : "Your DNS isn't pointing to our servers yet — changes can take up to 24 hours.");

    return (
      <div
        className={`mt-3 rounded border p-3 text-sm ${
          domain.dns_ready
            ? 'border-green-500/30 bg-green-500/5 text-green-300'
            : 'border-yellow-500/30 bg-yellow-500/5 text-yellow-200'
        }`}
      >
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-white/50">DNS Status</div>
        <p className="text-sm font-medium">{friendlyMessage}</p>
        {!domain.dns_ready && resolved && (
          <p className="mt-2 text-xs text-white/55">
            <span className="text-white/40">Currently resolves to:</span> {resolved}
          </p>
        )}
      </div>
    );
  };

  const getStatusBadge = (domain: CustomDomain) => {
    switch (domain.status) {
      case 'active':
        return (
          <Badge className="border-green-500/30 bg-green-500/20 text-green-300">
            <Check className="mr-1 h-3 w-3" />
            Active
          </Badge>
        );
      case 'verified':
        return (
          <Badge className="border-cyan-500/30 bg-cyan-500/20 text-cyan-200">
            <Shield className="mr-1 h-3 w-3" />
            Verified
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="border-yellow-500/30 bg-yellow-500/20 text-yellow-200">
            <AlertCircle className="mr-1 h-3 w-3" />
            Pending Verification
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="border-red-500/30 bg-red-500/20 text-red-200">Failed</Badge>
        );
      default:
        return <Badge className="border-white/20 bg-white/10 text-white/70">Unknown</Badge>;
    }
  };

  const getNextAction = (domain: CustomDomain) => {
    const dnsReady = domain.dns_ready !== false;

    if (domain.status === 'pending') {
      return {
        title: 'Verify ownership',
        description: 'Add the TXT record shown below to your DNS, then click Verify.',
        action: 'verify' as const,
      };
    }

    if (domain.status === 'verified' && !dnsReady) {
      return {
        title: 'Update your DNS',
        description: 'Point this domain to our servers (A or CNAME record), then activate to go live.',
        action: null,
      };
    }

    if (domain.status === 'verified' && dnsReady) {
      return {
        title: 'Activate domain',
        description: 'Your SSL certificate will be provisioned automatically once activated.',
        action: 'activate' as const,
      };
    }

    if (domain.status === 'active' && !domain.is_primary) {
      return {
        title: 'Set as primary (optional)',
        description: 'Make this the main URL shown to visitors.',
        action: 'set-primary' as const,
      };
    }

    if (domain.status === 'failed') {
      return {
        title: 'Retry verification',
        description: 'Check that your DNS TXT record exactly matches the value below, then try again.',
        action: 'verify' as const,
      };
    }

    return null;
  };

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
              <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/8 rounded-md px-3">
                Open Marketplace
              </Button>
            </Link>
            <Link href="/dashboard/domains">
              <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/8 rounded-md px-3">
                Domains Dashboard
              </Button>
            </Link>
            <Dialog
              open={addDialogOpen}
              onOpenChange={(open) => {
                if (!open) {
                  closeAddDialog();
                  return;
                }
                setAddDialogOpen(true);
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" className="bg-white text-black hover:bg-white/95 rounded-md px-3 py-1.5">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Domain
                </Button>
              </DialogTrigger>
              <DialogContent className="border-white/10 bg-zinc-900 text-white">
                <DialogHeader>
                  <DialogTitle>Add Domain to App</DialogTitle>
                  <DialogDescription className="text-white/60">
                    Choose an existing account domain or add an external domain.
                  </DialogDescription>
                </DialogHeader>

                <Tabs value={addMode} onValueChange={(value) => setAddMode(value as AddDomainMode)} className="space-y-4">
                  <TabsList className="grid w-full grid-cols-2 bg-black/30 border border-white/10">
                    <TabsTrigger value="existing" className="data-[state=active]:bg-white/10">
                      Existing Domain
                    </TabsTrigger>
                    <TabsTrigger value="external" className="data-[state=active]:bg-white/10">
                      External Domain
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="existing" className="space-y-3">
                    {inventoryLoading ? (
                      <div className="flex items-center gap-2 text-sm text-white/60">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading account domains...
                      </div>
                    ) : existingDomainOptions.length === 0 ? (
                      <Alert className="border-yellow-500/30 bg-yellow-500/10">
                        <AlertCircle className="h-4 w-4 text-yellow-300" />
                        <AlertTitle className="text-yellow-200">No account domains yet</AlertTitle>
                        <AlertDescription className="text-yellow-100/90">
                          Buy a domain in Marketplace or add an external domain in the next tab.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label className="text-white/70">Base domain</Label>
                          <Select value={selectedExistingDomain} onValueChange={setSelectedExistingDomain}>
                            <SelectTrigger className="border-white/20 bg-black/30 text-white">
                              <SelectValue placeholder="Select domain" />
                            </SelectTrigger>
                            <SelectContent>
                              {existingDomainOptions.map((item) => (
                                <SelectItem key={item.domain} value={item.domain}>
                                  {item.domain} ({item.source})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-white/70">Subdomain (optional)</Label>
                          <Input
                            value={subdomainLabel}
                            onChange={(event) => setSubdomainLabel(event.target.value)}
                            placeholder="api"
                            className="border-white/20 bg-black/30 text-white"
                          />
                          <p className="text-xs text-white/55">Leave empty to use the root domain (e.g. example.com).</p>
                        </div>
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="external" className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-white/70">Domain</Label>
                      <Input
                        value={externalDomain}
                        onChange={(event) => setExternalDomain(event.target.value)}
                        placeholder="example.com or app.example.com"
                        className="border-white/20 bg-black/30 text-white"
                      />
                      <p className="text-xs text-white/55">You&apos;ll need to add a short TXT record to prove you own this domain.</p>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65">
                  Target domain: <span className="font-mono text-white">{selectedTargetDomain || '-'}</span>
                </div>

                {verificationInstructions && (
                  <Alert className="border-cyan-500/30 bg-cyan-500/10">
                    <AlertCircle className="h-4 w-4 text-cyan-300" />
                    <AlertTitle className="text-cyan-200">One more step — verify ownership</AlertTitle>
                    <AlertDescription className="space-y-2 text-white/75">
                      <p>Add the following TXT record at your DNS provider, then click Verify in the domain card below.</p>
                      <div className="space-y-2 rounded bg-black/30 p-3 font-mono text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-white/50">Record type</span>
                          <span className="text-white">{verificationInstructions.record_type}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-white/50">Record name</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(verificationInstructions.record_name, 'verification-name')}
                            className="flex items-center gap-1 text-white hover:text-cyan-200"
                          >
                            <span className="truncate max-w-[220px]">{verificationInstructions.record_name}</span>
                            {copiedField === 'verification-name' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-white/50">Record value</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(verificationInstructions.record_value, 'verification-value')}
                            className="flex items-center gap-1 text-white hover:text-cyan-200"
                          >
                            <span className="truncate max-w-[220px]">{verificationInstructions.record_value}</span>
                            {copiedField === 'verification-value' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-white/50">DNS changes can take a few minutes to a few hours to take effect.</p>
                    </AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={closeAddDialog}
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    {verificationInstructions ? 'Close' : 'Cancel'}
                  </Button>
                  {!verificationInstructions && (
                    <Button
                      onClick={() => void submitAddDomain()}
                      disabled={adding || !selectedTargetDomain}
                      className="bg-white text-black hover:bg-white/90"
                    >
                      {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Add Domain
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/[0.06] bg-gradient-to-b from-white/[0.01] to-transparent p-4 flex flex-col items-center justify-center min-h-[88px]">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">Active</p>
            <p className="mt-1 text-2xl font-bold text-white">{domainCounts.active}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-gradient-to-b from-white/[0.01] to-transparent p-4 flex flex-col items-center justify-center min-h-[88px]">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">Pending Setup</p>
            <p className="mt-1 text-2xl font-bold text-white">{domainCounts.pending}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-gradient-to-b from-white/[0.01] to-transparent p-4 flex flex-col items-center justify-center min-h-[88px]">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">Needs Attention</p>
            <p className="mt-1 text-2xl font-bold text-white">{domainCounts.failed}</p>
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-black/20 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Platform Domain</p>
            <p className="text-xs text-white/55">Default domain, always active.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-white/5 px-3 py-1 font-mono text-sm text-white">{platformDomain}</div>
            <Badge className="border-green-500/30 bg-green-500/20 text-green-300">Active</Badge>
            <a href={`https://${platformDomain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-cyan-200 hover:text-cyan-100">
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {domains.length === 0 ? (
          <div className="border border-dashed border-white/15 p-6 text-center text-white/60">
            <Globe className="mx-auto mb-2 h-8 w-8 opacity-60" />
            <p className="font-medium text-white/70">No custom domains yet</p>
            <p className="mt-1 text-xs">Click <strong>Add Domain</strong> to connect a domain you own, or visit the Marketplace to purchase one.</p>
          </div>
        ) : (
          domains.map((domain) => {
            const nextAction = getNextAction(domain);

            return (
              <div key={domain.id} className="border border-white/10 bg-black/20 p-4 mb-3 rounded-md hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {domain.status === 'active' ? (
                        <a
                          href={`https://${domain.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-semibold text-white hover:text-cyan-200"
                        >
                          {domain.domain}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-sm font-semibold text-white">{domain.domain}</span>
                      )}

                      {domain.is_primary && (
                        <Badge className="border-yellow-500/30 bg-yellow-500/20 text-yellow-200">
                          <Star className="mr-1 h-3 w-3" />
                          Primary
                        </Badge>
                      )}
                    </div>

                    {domain.last_error && !looksInternal(domain.last_error) && (
                      <p className="mt-1 text-xs text-red-300">{domain.last_error}</p>
                    )}
                    {domain.last_error && looksInternal(domain.last_error) && (
                      <p className="mt-1 text-xs text-red-300">There was an issue with this domain. Try again or contact support.</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">{getStatusBadge(domain)}</div>
                </div>

                {renderDnsStatus(domain)}

                {nextAction && (
                  <div className="mt-3 border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-xs uppercase tracking-wide text-white/45">Next Step</p>
                    <p className="mt-1 text-sm font-medium text-white">{nextAction.title}</p>
                    <p className="mt-1 text-xs text-white/55">{nextAction.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      {nextAction.action === 'verify' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleVerifyDomain(domain.id)}
                          disabled={verifyingId === domain.id}
                          className="border-white/20 text-white hover:bg-white/10"
                        >
                          {verifyingId === domain.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1 h-3.5 w-3.5" />
                          )}
                          Verify
                        </Button>
                      )}

                      {nextAction.action === 'activate' && (
                        <Button
                          size="sm"
                          onClick={() => void handleActivateDomain(domain.id)}
                          disabled={activatingId === domain.id || appStatus !== 'running' || domain.dns_ready === false}
                          className="bg-green-600 text-white hover:bg-green-700 rounded-md px-4 py-1.5"
                        >
                          {activatingId === domain.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3.5 w-3.5" />
                          )}
                          Activate
                        </Button>
                      )}

                      {nextAction.action === 'set-primary' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleSetPrimary(domain.id)}
                          className="border-white/20 text-white hover:bg-white/10"
                        >
                          <Star className="mr-1 h-3.5 w-3.5" />
                          Set Primary
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {domain.status === 'pending' && (
                  <Alert className="mt-3 border-yellow-500/30 bg-yellow-500/10">
                    <AlertCircle className="h-4 w-4 text-yellow-300" />
                    <AlertTitle className="text-yellow-200">Ownership verification required</AlertTitle>
                    <AlertDescription className="space-y-2 text-xs text-white/75">
                      <p>Add this TXT record at your DNS provider, then click <strong>Verify</strong>:</p>
                      <div className="space-y-1.5 rounded bg-black/30 p-2 font-mono">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/50">Record type</span>
                          <span className="text-white">TXT</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/50">Record name</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`galaxyhvh-verify.${domain.domain}`, `pending-name-${domain.id}`)}
                            className="flex items-center gap-1 text-white hover:text-yellow-100"
                          >
                            <span className="truncate max-w-[190px]">{`galaxyhvh-verify.${domain.domain}`}</span>
                            {copiedField === `pending-name-${domain.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/50">Record value</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(domain.verification_token, `pending-token-${domain.id}`)}
                            className="flex items-center gap-1 text-white hover:text-yellow-100"
                          >
                            <span className="truncate max-w-[190px]">{domain.verification_token}</span>
                            {copiedField === `pending-token-${domain.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                      <p className="text-white/45">DNS changes may take a few minutes to a few hours.</p>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
                  <Link href={`/dashboard/domains/${encodeURIComponent(domain.domain)}`}>
                    <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                      Manage Domain
                    </Button>
                  </Link>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRemoveConfirmId(domain.id)}
                    disabled={removingId === domain.id}
                    className="ml-auto border-red-500/30 text-red-200 hover:bg-red-500/10"
                  >
                    {removingId === domain.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })
        )}

        {/* Remove domain confirmation dialog */}
        <AlertDialog open={removeConfirmId !== null} onOpenChange={(open) => { if (!open) setRemoveConfirmId(null); }}>
          <AlertDialogContent className="border-white/10 bg-zinc-900 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove domain?</AlertDialogTitle>
              <AlertDialogDescription className="text-white/60">
                <strong className="text-white">{domains.find((d) => d.id === removeConfirmId)?.domain}</strong> will be
                disconnected from this app. It will remain in your domain inventory and can be re-added at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/20 bg-transparent text-white hover:bg-white/10">
                Keep it
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  if (removeConfirmId) void handleRemoveDomain(removeConfirmId);
                }}
              >
                Remove domain
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
