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
        toast.error(data?.message || data?.error || 'Failed to load app domains');
        setDomains([]);
        return;
      }

      setDomains((data?.domains || []) as CustomDomain[]);
    } catch (error) {
      console.error('Error fetching app domains:', error);
      toast.error('Failed to load app domains');
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
        toast.error(data?.message || data?.error || 'Failed to load available domains');
        setInventoryDomains([]);
        return;
      }

      setInventoryDomains((data?.data?.domains || []) as DomainInventoryItem[]);
    } catch (error) {
      console.error('Error fetching inventory domains:', error);
      toast.error('Failed to load available domains');
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
      toast.error('Please provide a valid domain');
      return;
    }

    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      toast.error('Enter a valid domain, for example: example.com');
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
        toast.error(data?.message || data?.error || 'Failed to add domain');
        return;
      }

      if (data?.verification_required) {
        setVerificationInstructions(data?.verification_instructions || null);
        toast.success('Domain added. Complete TXT verification to continue.');
      } else {
        toast.success('Domain added and ownership verified. Activate when DNS is ready.');
        closeAddDialog();
      }

      await refreshAll();
    } catch (error) {
      console.error('Error adding domain:', error);
      toast.error('Failed to add domain');
    } finally {
      setAdding(false);
    }
  };

  const handleVerifyDomain = async (domainId: string) => {
    setVerifyingId(domainId);

    try {
      const res = await fetch(`/api/domains/${domainId}/verify`, {
        method: 'POST',
      });

      const data = await res.json();

      if (data.verified) {
        toast.success('Domain verified. You can now activate it.');
        await fetchDomains();
      } else {
        toast.error(data.error || 'Verification failed. Make sure DNS record is set correctly.');
      }
    } catch (error) {
      console.error('Error verifying domain:', error);
      toast.error('Failed to verify domain');
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
        throw new Error(data?.message || data?.error || 'Failed to get operation status');
      }

      const status = data?.operation?.status;
      if (status === 'succeeded') {
        return;
      }
      if (status === 'failed') {
        throw new Error(data?.operation?.error_message || 'Domain activation failed');
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Domain activation timed out. Check status again.');
  };

  const handleActivateDomain = async (domainId: string) => {
    if (appStatus !== 'running') {
      toast.error('App must be running to activate custom domain');
      return;
    }

    setActivatingId(domainId);

    try {
      const res = await fetch(`/api/domains/${domainId}/activate`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data?.message || data?.error || 'Activation failed');
        return;
      }

      if (data.operation_id) {
        toast.info('Domain activation in progress. Applying routing and SSL...');
        await pollOperation(data.operation_id);
      }

      toast.success('Domain activated. SSL issuance started.');
      await fetchDomains();
    } catch (error) {
      console.error('Error activating domain:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to activate domain');
    } finally {
      setActivatingId(null);
    }
  };

  const handleRemoveDomain = async (domainId: string) => {
    const confirmed = window.confirm('Remove this domain from the app?');
    if (!confirmed) return;

    setRemovingId(domainId);

    try {
      const res = await fetch(`/api/domains/${domainId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to remove domain');
        return;
      }

      toast.success('Domain removed');
      await fetchDomains();
      await fetchInventoryDomains();
    } catch (error) {
      console.error('Error removing domain:', error);
      toast.error('Failed to remove domain');
    } finally {
      setRemovingId(null);
    }
  };

  const handleSetPrimary = async (domainId: string) => {
    try {
      const res = await fetch(`/api/domains/${domainId}/set-primary`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data?.message || data?.error || 'Failed to set primary domain');
        return;
      }

      toast.success('Primary domain set');
      await fetchDomains();
    } catch (error) {
      console.error('Error setting primary domain:', error);
      toast.error('Failed to set primary domain');
    }
  };

  const renderDnsStatus = (domain: CustomDomain) => {
    if (domain.status === 'removed') return null;
    if (typeof domain.dns_ready !== 'boolean' && !domain.dns_message) return null;

    const expected = domain.dns_expected_ips?.length
      ? domain.dns_expected_ips.join(', ')
      : 'platform ingress IP';

    const resolved = domain.dns_resolved_ips?.length
      ? domain.dns_resolved_ips.join(', ')
      : 'No records detected yet';

    return (
      <div
        className={`mt-3 border p-3 text-sm ${
          domain.dns_ready
            ? 'border-green-500/30 bg-green-500/5 text-green-300'
            : 'border-yellow-500/30 bg-yellow-500/5 text-yellow-200'
        }`}
      >
        <div className="mb-1 text-xs uppercase tracking-wide text-white/60">DNS Routing</div>
        <p className="text-sm font-medium">{domain.dns_message || 'DNS status pending update.'}</p>
        <div className="mt-2 space-y-1 text-xs text-white/60">
          <p>
            <span className="text-white/40">Expected:</span> {expected}
          </p>
          <p>
            <span className="text-white/40">Resolved:</span> {resolved}
          </p>
        </div>
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
        description: 'Add TXT record, wait for propagation, then verify.',
        action: 'verify' as const,
      };
    }

    if (domain.status === 'verified' && !dnsReady) {
      return {
        title: 'Update DNS routing',
        description: 'Point A/ANAME or CNAME to platform ingress, then activate.',
        action: null,
      };
    }

    if (domain.status === 'verified' && dnsReady) {
      return {
        title: 'Activate domain',
        description: 'Create ingress and start SSL issuance.',
        action: 'activate' as const,
      };
    }

    if (domain.status === 'active' && !domain.is_primary) {
      return {
        title: 'Set as primary (optional)',
        description: 'Use this domain as canonical URL for your app.',
        action: 'set-primary' as const,
      };
    }

    if (domain.status === 'failed') {
      return {
        title: 'Retry verification',
        description: 'Fix DNS record mismatch and verify again.',
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
              Use domains with this app. Buying stays global in Marketplace.
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
                          <p className="text-xs text-white/55">Leave empty to connect root domain.</p>
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
                      <p className="text-xs text-white/55">For external domains, TXT ownership verification is required.</p>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65">
                  Target domain: <span className="font-mono text-white">{selectedTargetDomain || '-'}</span>
                </div>

                {verificationInstructions && (
                  <Alert className="border-cyan-500/30 bg-cyan-500/10">
                    <AlertCircle className="h-4 w-4 text-cyan-300" />
                    <AlertTitle className="text-cyan-200">Ownership verification required</AlertTitle>
                    <AlertDescription className="space-y-2 text-white/75">
                      <p>Add this TXT record in your DNS provider:</p>
                      <div className="space-y-2 rounded bg-black/30 p-3 font-mono text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-white/50">Type</span>
                          <span className="text-white">{verificationInstructions.record_type}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-white/50">Name</span>
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
                          <span className="text-white/50">Value</span>
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
            <p>No custom domains connected yet.</p>
            <p className="mt-1 text-xs">Use Add Domain to connect an existing domain or external domain.</p>
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

                    {domain.last_error && (
                      <p className="mt-1 text-xs text-red-300">{domain.last_error}</p>
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
                    <AlertTitle className="text-yellow-200">Verification Required</AlertTitle>
                    <AlertDescription className="space-y-2 text-xs text-white/75">
                      <p>Add this TXT record at your DNS provider:</p>
                      <div className="space-y-1 rounded bg-black/30 p-2 font-mono">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/50">Name</span>
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
                          <span className="text-white/50">Value</span>
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
                    onClick={() => void handleRemoveDomain(domain.id)}
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
      </CardContent>
    </Card>
  );
}
