'use client';

import { useState, useCallback, useEffect } from 'react';
import { 
  Globe, 
  Plus, 
  Check, 
  X, 
  Loader2, 
  Copy, 
  ExternalLink,
  Shield,
  AlertCircle,
  Trash2,
  Star,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { toast } from 'sonner';

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

interface CustomDomainsManagerProps {
  appId: string;
  appStatus: string;
  platformDomain: string;
}

export function CustomDomainsManager({ 
  appId, 
  appStatus,
  platformDomain 
}: CustomDomainsManagerProps) {
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [verificationInstructions, setVerificationInstructions] = useState<{
    record_type: string;
    record_name: string;
    record_value: string;
  } | null>(null);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch(`/api/domains?app_id=${appId}`);
      if (res.ok) {
        const data = await res.json();
        setDomains(data.domains || []);
      }
    } catch (error) {
      console.error('Error fetching domains:', error);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const normalizeDomainInput = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/\.$/, '');

  const getNextAction = (domain: CustomDomain) => {
    const dnsReady = domain.dns_ready !== false;

    if (domain.status === 'pending') {
      return {
        title: 'Verify ownership',
        description: 'Add TXT record, wait for propagation, then verify.',
        tone: 'warning' as const,
        action: 'verify' as const,
      };
    }

    if (domain.status === 'verified' && !dnsReady) {
      return {
        title: 'Update DNS routing',
        description: 'Point A/CNAME to platform ingress, then activate.',
        tone: 'warning' as const,
      };
    }

    if (domain.status === 'verified' && dnsReady) {
      return {
        title: 'Activate domain',
        description: 'Create ingress and start SSL issuance.',
        tone: 'info' as const,
        action: 'activate' as const,
      };
    }

    if (domain.status === 'active' && !domain.is_primary) {
      return {
        title: 'Optional: set as primary',
        description: 'Use this domain as canonical URL for your app.',
        tone: 'info' as const,
        action: 'set-primary' as const,
      };
    }

    if (domain.status === 'active' && domain.is_primary) {
      return {
        title: 'Live and primary',
        description: 'Traffic and SSL are active on this domain.',
        tone: 'success' as const,
      };
    }

    if (domain.status === 'failed') {
      return {
        title: 'Retry verification',
        description: 'Fix DNS record mismatch and verify again.',
        tone: 'warning' as const,
        action: 'verify' as const,
      };
    }

    return null;
  };

  const handleAddDomain = async () => {
    const normalizedDomain = normalizeDomainInput(newDomain);
    if (!normalizedDomain) {
      toast.error('Please enter a domain');
      return;
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedDomain)) {
      toast.error('Enter a valid domain, for example: example.com');
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, domain: normalizedDomain }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to add domain');
        return;
      }

      toast.success('Domain added! Add the DNS TXT record to verify ownership.');
      setVerificationInstructions(data.verification_instructions);
      setNewDomain('');
      fetchDomains();
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
        toast.success('Domain verified! You can now activate it.');
        fetchDomains();
      } else {
        toast.error(data.error || 'Verification failed. Make sure the DNS record is set correctly.');
      }
    } catch (error) {
      console.error('Error verifying domain:', error);
      toast.error('Failed to verify domain');
    } finally {
      setVerifyingId(null);
    }
  };

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
        throw new Error(data?.operation?.error_message || 'Domain activation failed');
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Domain activation timed out. Please check operation status again.');
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

      if (!data.operation_id) {
        toast.success('Domain activation requested.');
        fetchDomains();
        return;
      }

      toast.info('Domain activation in progress. Applying ingress and SSL...');
      await pollOperation(data.operation_id);
      toast.success('Domain activated! SSL certificate is being issued.');
      fetchDomains();
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

      if (data.success) {
        toast.success('Domain removed');
        fetchDomains();
      } else {
        toast.error(data.error || 'Failed to remove domain');
      }
    } catch (error) {
      console.error('Error removing domain:', error);
      toast.error('Failed to remove domain');
    } finally {
      setRemovingId(null);
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
        className={`mt-3 rounded-lg border p-3 text-sm ${
          domain.dns_ready
            ? 'border-green-500/30 bg-green-500/5 text-green-300'
            : 'border-yellow-500/30 bg-yellow-500/5 text-yellow-200'
        }`}
      >
        <div className="text-xs uppercase tracking-wide text-white/60 mb-1">DNS Routing</div>
        <p className="text-sm font-medium">{domain.dns_message || 'DNS status pending update.'}</p>
        <div className="text-xs text-white/60 mt-2 space-y-1">
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

  const handleSetPrimary = async (domainId: string) => {
    try {
      const res = await fetch(`/api/domains/${domainId}/set-primary`, {
        method: 'POST',
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Primary domain set');
        fetchDomains();
      } else {
        toast.error(data.error || 'Failed to set primary domain');
      }
    } catch (error) {
      console.error('Error setting primary domain:', error);
      toast.error('Failed to set primary domain');
    }
  };

  const getStatusBadge = (domain: CustomDomain) => {
    switch (domain.status) {
      case 'active':
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <Check className="w-3 h-3 mr-1" />
            Active
          </Badge>
        );
      case 'verified':
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            <Shield className="w-3 h-3 mr-1" />
            Verified
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <AlertCircle className="w-3 h-3 mr-1" />
            Pending Verification
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <X className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card className="bg-white/5 border-white/10">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-white/50" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Domains
            </CardTitle>
            <CardDescription className="text-white/50">
              Manage your app&apos;s domains
            </CardDescription>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-white text-black hover:bg-white/90">
                <Plus className="w-4 h-4 mr-1" />
                Add Domain
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>Add Custom Domain</DialogTitle>
                <DialogDescription className="text-white/60">
                  Enter a root or subdomain. We will guide you to verify and activate it.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <Input
                    id="domain"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="example.com or app.example.com"
                    className="bg-white/10 border-white/20 text-white"
                  />
                  <p className="text-xs text-white/50">
                    Enter your domain without http:// or https://
                  </p>
                </div>

                {verificationInstructions && (
                  <Alert className="bg-blue-500/10 border-blue-500/30">
                    <AlertCircle className="h-4 w-4 text-blue-400" />
                    <AlertTitle className="text-blue-400">DNS Configuration Required</AlertTitle>
                    <AlertDescription className="text-white/70 space-y-2">
                      <p>Add this TXT record to your DNS provider:</p>
                      <div className="bg-black/30 rounded p-3 font-mono text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Type:</span>
                          <span className="text-white">{verificationInstructions.record_type}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Name:</span>
                          <div className="flex items-center gap-2">
                            <span className="text-white">{verificationInstructions.record_name}</span>
                            <button 
                              onClick={() => copyToClipboard(verificationInstructions.record_name, 'name')}
                              className="text-white/50 hover:text-white"
                            >
                              {copiedField === 'name' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Value:</span>
                          <div className="flex items-center gap-2">
                            <span className="text-white truncate max-w-[200px]">{verificationInstructions.record_value}</span>
                            <button 
                              onClick={() => copyToClipboard(verificationInstructions.record_value, 'value')}
                              className="text-white/50 hover:text-white"
                            >
                              {copiedField === 'value' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setAddDialogOpen(false);
                  setVerificationInstructions(null);
                  setNewDomain('');
                }}>
                  {verificationInstructions ? 'Close' : 'Cancel'}
                </Button>
                {!verificationInstructions && (
                  <Button 
                    onClick={handleAddDomain} 
                    disabled={adding || !newDomain.trim()}
                    className="bg-white text-black hover:bg-white/90"
                  >
                    {adding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Add Domain
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-gradient-to-br from-cyan-500/10 to-blue-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-300" />
            <p className="text-sm font-semibold text-white">Quick Setup</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="rounded-md border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-cyan-300">Step 1</p>
              <p className="text-sm text-white mt-1">Add domain</p>
              <p className="text-xs text-white/55 mt-1">example.com or app.example.com</p>
            </div>
            <div className="rounded-md border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-yellow-300">Step 2</p>
              <p className="text-sm text-white mt-1">Verify ownership</p>
              <p className="text-xs text-white/55 mt-1">Add TXT record, then click Verify</p>
            </div>
            <div className="rounded-md border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-green-300">Step 3</p>
              <p className="text-sm text-white mt-1">Activate</p>
              <p className="text-xs text-white/55 mt-1">Point DNS, activate, SSL auto-starts</p>
            </div>
          </div>
          <p className="text-xs text-white/45">
            DNS propagation typically takes a few minutes but can take longer depending on your provider.
          </p>
        </div>

        {/* Platform Domain (Always shown) */}
        <div className="p-4 bg-black/30 rounded-lg border border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
              <div>
                <div className="flex items-center gap-2">
                  <a 
                    href={`https://${platformDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-white hover:text-blue-400 flex items-center gap-1"
                  >
                    {platformDomain}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <Badge className="bg-white/10 text-white/60 text-xs">Platform Domain</Badge>
                </div>
                <p className="text-xs text-white/50 mt-1">Default domain - always active</p>
              </div>
            </div>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              <Check className="w-3 h-3 mr-1" />
              Active
            </Badge>
          </div>
        </div>

        {/* Custom Domains */}
        {domains.length === 0 ? (
          <div className="text-center py-8 text-white/50">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No custom domains configured</p>
            <p className="text-xs mt-1">Add a custom domain to use your own domain name</p>
          </div>
        ) : (
          domains.map((domain) => {
            const nextAction = getNextAction(domain);
            const nextActionToneClass =
              nextAction?.tone === 'success'
                ? 'border-green-500/20 bg-green-500/5'
                : nextAction?.tone === 'warning'
                ? 'border-yellow-500/20 bg-yellow-500/5'
                : 'border-cyan-500/20 bg-cyan-500/5';

            return (
              <div
                key={domain.id}
                className="p-4 bg-black/30 rounded-lg border border-white/5 space-y-3"
              >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    domain.status === 'active' ? 'bg-green-400' :
                    domain.status === 'verified' ? 'bg-blue-400' :
                    domain.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                  }`}></div>
                  <div>
                    <div className="flex items-center gap-2">
                      {domain.status === 'active' ? (
                        <a 
                          href={`https://${domain.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-white hover:text-blue-400 flex items-center gap-1"
                        >
                          {domain.domain}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-sm font-medium text-white">{domain.domain}</span>
                      )}
                      {domain.is_primary && (
                        <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                          <Star className="w-3 h-3 mr-1" />
                          Primary
                        </Badge>
                      )}
                    </div>
                    {domain.last_error && (
                      <p className="text-xs text-red-400 mt-1">{domain.last_error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(domain)}
                </div>
              </div>

                {renderDnsStatus(domain)}

                {nextAction && (
                  <div className={`rounded-lg border p-3 ${nextActionToneClass}`}>
                    <p className="text-xs uppercase tracking-wide text-white/45">Next Step</p>
                    <p className="text-sm font-medium text-white mt-1">{nextAction.title}</p>
                    <p className="text-xs text-white/55 mt-1">{nextAction.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      {nextAction.action === 'verify' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleVerifyDomain(domain.id)}
                          disabled={verifyingId === domain.id}
                          className="border-white/20 text-white hover:bg-white/10"
                        >
                          {verifyingId === domain.id ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="w-3 h-3 mr-1" />
                          )}
                          Verify
                        </Button>
                      )}
                      {nextAction.action === 'activate' && (
                        <Button
                          size="sm"
                          onClick={() => handleActivateDomain(domain.id)}
                          disabled={activatingId === domain.id || appStatus !== 'running' || domain.dns_ready === false}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {activatingId === domain.id ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <Check className="w-3 h-3 mr-1" />
                          )}
                          Activate
                        </Button>
                      )}
                      {nextAction.action === 'set-primary' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetPrimary(domain.id)}
                          className="border-white/20 text-white hover:bg-white/10"
                        >
                          <Star className="w-3 h-3 mr-1" />
                          Set Primary
                        </Button>
                      )}
                    </div>
                  </div>
                )}

              {/* Verification Instructions for pending domains */}
              {domain.status === 'pending' && (
                <Alert className="bg-yellow-500/10 border-yellow-500/30">
                  <AlertCircle className="h-4 w-4 text-yellow-400" />
                  <AlertTitle className="text-yellow-400 text-sm">Verification Required</AlertTitle>
                  <AlertDescription className="text-white/70 text-xs space-y-2">
                    <p>Add this TXT record in the DNS settings of your domain to verify ownership:</p>
                    <div className="bg-black/30 rounded p-2 font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-white/50">Name:</span>
                        <div className="flex items-center gap-1">
                          <span className="text-white">galaxyhvh-verify.{domain.domain}</span>
                          <button 
                            onClick={() => copyToClipboard(`galaxyhvh-verify.${domain.domain}`, `name-${domain.id}`)}
                            className="text-white/50 hover:text-white"
                          >
                            {copiedField === `name-${domain.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-white/50">Value:</span>
                        <div className="flex items-center gap-1">
                          <span className="text-white truncate max-w-[150px]">{domain.verification_token}</span>
                          <button 
                            onClick={() => copyToClipboard(domain.verification_token, `token-${domain.id}`)}
                            className="text-white/50 hover:text-white"
                          >
                            {copiedField === `token-${domain.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

                {/* Secondary Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                  {domain.status === 'verified' && domain.dns_ready === false && (
                    <span className="text-xs text-yellow-300">
                      Point the domain to{' '}
                    {domain.dns_expected_ips?.length
                      ? domain.dns_expected_ips.join(', ')
                      : 'the platform ingress IP'}
                    {' '}before activating.
                    </span>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveDomain(domain.id)}
                    disabled={removingId === domain.id}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 ml-auto"
                  >
                    {removingId === domain.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
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
