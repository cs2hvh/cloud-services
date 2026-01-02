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
  ChevronDown,
  ChevronUp,
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
  dns_ready: boolean;
  dns_message: string;
  dns_resolved_ips: string[];
  dns_expected_ips: string[];
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
  const [showGuide, setShowGuide] = useState(true);
  const [verificationInstructions, setVerificationInstructions] = useState<{
    record_type: string;
    record_name: string;
    record_value: string;
  } | null>(null);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/platform-apps/domains?app_id=${appId}`);
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

  const handleAddDomain = async () => {
    if (!newDomain.trim()) {
      toast.error('Please enter a domain');
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/services/platform-apps/domains/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, domain: newDomain }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to add domain');
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
      const res = await fetch('/api/services/platform-apps/domains/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain_id: domainId }),
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

  const handleActivateDomain = async (domainId: string) => {
    if (appStatus !== 'running') {
      toast.error('App must be running to activate custom domain');
      return;
    }

    setActivatingId(domainId);
    try {
      const res = await fetch('/api/services/platform-apps/domains/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain_id: domainId }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Domain activated! SSL certificate is being issued.');
        fetchDomains();
      } else {
        toast.error(data.error || 'Activation failed');
      }
    } catch (error) {
      console.error('Error activating domain:', error);
      toast.error('Failed to activate domain');
    } finally {
      setActivatingId(null);
    }
  };

  const handleRemoveDomain = async (domainId: string) => {
    setRemovingId(domainId);
    try {
      const res = await fetch('/api/services/platform-apps/domains/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain_id: domainId }),
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
        <p className="text-sm font-medium">{domain.dns_message}</p>
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
      const res = await fetch('/api/services/platform-apps/domains/set-primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain_id: domainId }),
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
                  Connect your own domain to this application
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
        {/* Step-by-Step Guide */}
        <div className="rounded-lg border border-white/10 bg-gradient-to-br from-blue-500/5 to-purple-500/5 overflow-hidden">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-white">How to Configure Your Custom Domain</h3>
                <p className="text-xs text-white/50">Step-by-step guide to connect your own domain</p>
              </div>
            </div>
            {showGuide ? (
              <ChevronUp className="w-5 h-5 text-white/50" />
            ) : (
              <ChevronDown className="w-5 h-5 text-white/50" />
            )}
          </button>
          
          {showGuide && (
            <div className="px-4 pb-4 space-y-4">
              <div className="h-px bg-white/10" />
              
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-400">i</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-white mb-1">Add Your Domain</h4>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Click the <span className="text-blue-400 font-medium">&quot;Add Domain&quot;</span> button above and enter your domain name 
                    (e.g., <span className="font-mono text-white/80">example.com</span> or <span className="font-mono text-white/80">app.example.com</span>). 
                    Don&apos;t include <span className="font-mono text-white/80">http://</span> or <span className="font-mono text-white/80">https://</span>.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-yellow-400">ii</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-white mb-1">Add TXT Record for Verification</h4>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Go to your domain registrar&apos;s DNS settings (e.g., GoDaddy, Namecheap, Cloudflare) and add a <span className="font-mono text-yellow-400">TXT</span> record 
                    with the name and value we provide. This proves you own the domain.
                  </p>
                  <div className="mt-2 p-2 rounded bg-black/30 border border-white/5">
                    <p className="text-xs text-white/50">Example TXT Record:</p>
                    <p className="text-xs font-mono text-white/80 mt-1">
                      Name: <span className="text-yellow-400">galaxyhvh-verify.yourdomain.com</span>
                    </p>
                    <p className="text-xs font-mono text-white/80">
                      Value: <span className="text-yellow-400">[verification-token]</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-purple-400">iii</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-white mb-1">Verify Domain Ownership</h4>
                  <p className="text-xs text-white/60 leading-relaxed">
                    After adding the TXT record, wait a few minutes for DNS propagation (can take up to 24-48 hours, but usually 5-15 minutes). 
                    Then click the <span className="text-purple-400 font-medium">&quot;Verify&quot;</span> button on your pending domain.
                  </p>
                  <p className="text-xs text-white/40 mt-1 italic">
                    💡 Tip: Use <a href="https://dnschecker.org" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">dnschecker.org</a> to check if your TXT record has propagated.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-orange-400">iv</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-white mb-1">Point Domain to Platform (A/CNAME Record)</h4>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Once verified, add an <span className="font-mono text-orange-400">A</span> record or <span className="font-mono text-orange-400">CNAME</span> record 
                    to point your domain to our platform. You&apos;ll see the required IP address in the DNS Routing section below your domain.
                  </p>
                  <div className="mt-2 p-2 rounded bg-black/30 border border-white/5">
                    <p className="text-xs text-white/50">For root domain (example.com):</p>
                    <p className="text-xs font-mono text-white/80 mt-1">
                      Type: <span className="text-orange-400">A</span> | Name: <span className="text-orange-400">@</span> | Value: <span className="text-orange-400">[Platform IP]</span>
                    </p>
                    <p className="text-xs text-white/50 mt-2">For subdomain (app.example.com):</p>
                    <p className="text-xs font-mono text-white/80 mt-1">
                      Type: <span className="text-orange-400">A</span> | Name: <span className="text-orange-400">app</span> | Value: <span className="text-orange-400">[Platform IP]</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-green-400">v</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-white mb-1">Activate Your Domain</h4>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Once the DNS is pointing correctly (shown as &quot;DNS Ready&quot; in green), click the <span className="text-green-400 font-medium">&quot;Activate&quot;</span> button. 
                    We&apos;ll automatically provision an SSL certificate for your domain.
                  </p>
                </div>
              </div>

              {/* Step 6 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-emerald-400">vi</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-white mb-1">You&apos;re Live! 🎉</h4>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Your custom domain is now active with HTTPS enabled. You can optionally set it as your <span className="text-emerald-400 font-medium">Primary Domain</span> 
                    using the &quot;Set Primary&quot; button. The primary domain will be used for redirects and canonical URLs.
                  </p>
                </div>
              </div>

              {/* Help Note */}
              <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-xs text-white/60">
                  <span className="text-white/80 font-medium">Need help?</span> DNS changes can take time to propagate. 
                  If verification fails, wait 15-30 minutes and try again. Make sure you&apos;ve saved the DNS record in your registrar&apos;s panel.
                </p>
              </div>
            </div>
          )}
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
          domains.map((domain) => (
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

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                {domain.status === 'pending' && (
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
                
                {domain.status === 'verified' && (
                  <Button
                    size="sm"
                    onClick={() => handleActivateDomain(domain.id)}
                    disabled={
                      activatingId === domain.id ||
                      appStatus !== 'running' ||
                      !domain.dns_ready
                    }
                    title={
                      !domain.dns_ready
                        ? 'Update the domain DNS to point to the platform ingress IP before activating.'
                        : undefined
                    }
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
                {domain.status === 'verified' && !domain.dns_ready && (
                  <span className="text-xs text-yellow-300">
                    Point the domain to{' '}
                    {domain.dns_expected_ips?.length
                      ? domain.dns_expected_ips.join(', ')
                      : 'the platform ingress IP'}
                    {' '}before activating.
                  </span>
                )}

                {domain.status === 'active' && !domain.is_primary && (
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
