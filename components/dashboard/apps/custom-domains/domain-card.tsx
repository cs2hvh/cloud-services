'use client';

import Link from 'next/link';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Shield,
  Star,
  Trash2,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SslStatusBadge, type SslStatus } from '@/components/ui/ssl-status-badge';

import type { CustomDomain, DnsRoutingInstructions } from './types';
import { looksInternal } from './utils';

interface DomainCardProps {
  domain: CustomDomain;
  appStatus: string;
  platformDomain: string;
  verifyingId: string | null;
  activatingId: string | null;
  settingPrimaryId: string | null;
  removingId: string | null;
  copiedField: string | null;
  checkingSslId: string | null;
  anyOperationRunning: boolean;
  onVerify: (id: string) => void;
  onActivate: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onRemoveConfirm: (id: string) => void;
  onCopy: (text: string, field: string) => void;
  onCheckSsl: (id: string) => void;
}

function getStatusBadge(domain: CustomDomain) {
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
      return <Badge className="border-red-500/30 bg-red-500/20 text-red-200">Failed</Badge>;
    default:
      return <Badge className="border-white/20 bg-white/10 text-white/70">Unknown</Badge>;
  }
}

function DnsStatusPanel({ domain }: { domain: CustomDomain }) {
  if (domain.status === 'removed') return null;
  if (typeof domain.dns_ready !== 'boolean' && !domain.dns_message) return null;
  if (domain.status === 'pending') return null;

  const resolved = domain.dns_resolved_ips?.length ? domain.dns_resolved_ips.join(', ') : null;

  const friendlyMessage = domain.dns_ready
    ? 'Your DNS is correctly pointing to our servers.'
    : domain.dns_message && !looksInternal(domain.dns_message)
      ? domain.dns_message
      : "Your DNS isn't pointing to our servers yet — changes can take up to 24 hours.";

  return (
    <div
      className={`mt-3 rounded border p-3 text-sm ${
        domain.dns_ready
          ? 'border-green-500/30 bg-green-500/5 text-green-300'
          : 'border-yellow-500/30 bg-yellow-500/5 text-yellow-200'
      }`}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-white/50">
        DNS Status
      </div>
      <p className="text-sm font-medium">{friendlyMessage}</p>
      {!domain.dns_ready && resolved && (
        <p className="mt-2 text-xs text-white/55">
          <span className="text-white/40">Currently resolves to:</span> {resolved}
        </p>
      )}
    </div>
  );
}



function buildRoutingInstructions(domain: CustomDomain, platformDomain: string): DnsRoutingInstructions | null {
  const parts = domain.domain.split('.').filter(Boolean);
  const isApex = parts.length <= 2;
  const kubeIp = domain.dns_expected_ips?.[0];

  if (isApex && kubeIp) {
    return { record_type: 'A', record_name: domain.domain, record_value: kubeIp };
  }
  if (!isApex && platformDomain) {
    return { record_type: 'CNAME', record_name: domain.domain, record_value: platformDomain };
  }
  return null;
}

function shouldShowRoutingInstructions(domain: CustomDomain): boolean {
  if (domain.status === 'verified') return true;
  if (domain.status === 'active' && domain.ssl_status === 'issuing' && domain.dns_ready === false) return true;
  if (domain.status === 'active' && domain.ssl_status === 'failed') return true;
  return false;
}

function DnsRoutingPanel({
  domain,
  platformDomain,
  copiedField,
  onCopy,
}: {
  domain: CustomDomain;
  platformDomain: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  const instructions = buildRoutingInstructions(domain, platformDomain);
  if (!instructions || !shouldShowRoutingInstructions(domain)) return null;

  const isVerified = domain.status === 'verified';

  return (
    <Alert className={`mt-3 ${isVerified ? 'border-blue-500/30 bg-blue-500/10' : 'border-orange-500/30 bg-orange-500/10'}`}>
      <AlertCircle className={`h-4 w-4 ${isVerified ? 'text-blue-300' : 'text-orange-300'}`} />
      <AlertTitle className={isVerified ? 'text-blue-200' : 'text-orange-200'}>
        {isVerified ? 'Add DNS record to point your domain to this app' : 'DNS record required for SSL'}
      </AlertTitle>
      <AlertDescription className="space-y-2 text-xs text-white/75">
        <p>
          Add this {instructions.record_type} record at your DNS provider
          {!isVerified ? ', then click Re-Activate' : ' before or after activating'}.
        </p>
        <div className="space-y-1.5 rounded bg-black/30 p-2 font-mono">
          <div className="flex items-center justify-between gap-2">
            <span className="text-white/50">Record type</span>
            <span className="text-white">{instructions.record_type}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-white/50">Record name</span>
            <button
              type="button"
              onClick={() => onCopy(instructions.record_name, `routing-name-${domain.id}`)}
              className="flex items-center gap-1 text-white hover:text-blue-100"
            >
              <span className="truncate max-w-[190px]">{instructions.record_name}</span>
              {copiedField === `routing-name-${domain.id}` ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-white/50">Record value</span>
            <button
              type="button"
              onClick={() => onCopy(instructions.record_value, `routing-value-${domain.id}`)}
              className="flex items-center gap-1 text-white hover:text-blue-100"
            >
              <span className="truncate max-w-[190px]">{instructions.record_value}</span>
              {copiedField === `routing-value-${domain.id}` ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
        <p className="text-orange-300/80 font-medium">
          ⚠ Point DNS directly to this platform — do not route through a proxy or CDN or SSL will fail.
        </p>
      </AlertDescription>
    </Alert>
  );
}

function getNextAction(domain: CustomDomain) {
  if (domain.status === 'pending') {
    return {
      title: 'Verify ownership',
      description: 'Add the TXT record shown below to your DNS, then click Verify.',
      action: 'verify' as const,
    };
  }

  if (domain.status === 'verified') {
    return {
      title: 'Activate domain',
      description: 'Add the DNS record shown below, then activate. SSL will be issued automatically once DNS propagates.',
      action: 'activate' as const,
    };
  }

  if (domain.status === 'active' && domain.ssl_status === 'issuing') {
    return {
      title: 'Secure connection in progress…',
      description:
        'Secure connection setup is in progress. If this takes longer than a few minutes, use Re-Activate to retry.',
      action: 're-activate' as const,
    };
  }

  if (domain.status === 'active' && domain.ssl_status === 'failed') {
    return {
      title: 'Secure connection failed',
      description:
        'Secure setup could not be completed. Re-activate the domain after checking DNS, or contact support.',
      action: 're-activate' as const,
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
      description:
        'Check that your DNS TXT record exactly matches the value below, then try again.',
      action: 'verify' as const,
    };
  }

  return null;
}

export function DomainCard({
  domain,
  appStatus,
  platformDomain,
  verifyingId,
  activatingId,
  settingPrimaryId,
  removingId,
  copiedField,
  checkingSslId,
  anyOperationRunning,
  onVerify,
  onActivate,
  onSetPrimary,
  onRemoveConfirm,
  onCopy,
  onCheckSsl,
}: DomainCardProps) {
  const nextAction = getNextAction(domain);

  return (
    <div className="border border-white/10 bg-black/20 p-4 mb-3 rounded-md hover:shadow-md transition-shadow">
      {/* Header row */}
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
            <p className="mt-1 text-xs text-red-300">
              There was an issue with this domain. Try again or contact support.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">{getStatusBadge(domain)}</div>
      </div>

      <DnsStatusPanel domain={domain} />
      <DnsRoutingPanel domain={domain} platformDomain={platformDomain} copiedField={copiedField} onCopy={onCopy} />
      {domain.status === 'active' && (
        <SslStatusBadge
          sslStatus={domain.ssl_status as SslStatus}
          id={domain.id}
          onCheck={anyOperationRunning ? undefined : onCheckSsl}
          checkingId={checkingSslId}
          variant="card"
          dnsMessage={domain.dns_message}
        />
      )}

      {/* Next action */}
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
                onClick={() => onVerify(domain.id)}
                disabled={anyOperationRunning}
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
                onClick={() => onActivate(domain.id)}
                disabled={anyOperationRunning || appStatus !== 'running'}
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
                onClick={() => onSetPrimary(domain.id)}
                disabled={anyOperationRunning}
                className="border-white/20 text-white hover:bg-white/10"
              >
                {settingPrimaryId === domain.id ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Star className="mr-1 h-3.5 w-3.5" />
                )}
                Set Primary
              </Button>
            )}

            {nextAction.action === 're-activate' && (
              <Button
                size="sm"
                onClick={() => onActivate(domain.id)}
                disabled={anyOperationRunning || appStatus !== 'running'}
                className="bg-orange-600 text-white hover:bg-orange-700 rounded-md px-4 py-1.5"
              >
                {activatingId === domain.id ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                )}
                Re-Activate
              </Button>
            )}
          </div>
        </div>
      )}

      {/* TXT verification instructions card */}
      {domain.status === 'pending' && (
        <Alert className="mt-3 border-yellow-500/30 bg-yellow-500/10">
          <AlertCircle className="h-4 w-4 text-yellow-300" />
          <AlertTitle className="text-yellow-200">Ownership verification required</AlertTitle>
          <AlertDescription className="space-y-2 text-xs text-white/75">
            <p>
              Add this TXT record at your DNS provider, then click <strong>Verify</strong>:
            </p>
            <div className="space-y-1.5 rounded bg-black/30 p-2 font-mono">
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/50">Record type</span>
                <span className="text-white">TXT</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/50">Record name</span>
                <button
                  type="button"
                  onClick={() =>
                    onCopy(`ahuracloud-verify.${domain.domain}`, `pending-name-${domain.id}`)
                  }
                  className="flex items-center gap-1 text-white hover:text-yellow-100"
                >
                  <span className="truncate max-w-[190px]">{`ahuracloud-verify.${domain.domain}`}</span>
                  {copiedField === `pending-name-${domain.id}` ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/50">Record value</span>
                <button
                  type="button"
                  onClick={() =>
                    onCopy(domain.verification_token, `pending-token-${domain.id}`)
                  }
                  className="flex items-center gap-1 text-white hover:text-yellow-100"
                >
                  <span className="truncate max-w-[190px]">{domain.verification_token}</span>
                  {copiedField === `pending-token-${domain.id}` ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
            <p className="text-white/45">DNS changes may take a few minutes to a few hours.</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Footer actions */}
      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
        <Link href={`/dashboard/domains/${encodeURIComponent(domain.domain)}`}>
          <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10">
            Manage Domain
          </Button>
        </Link>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onRemoveConfirm(domain.id)}
          disabled={anyOperationRunning}
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
}
