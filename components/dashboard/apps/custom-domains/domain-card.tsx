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

import { SslStatusBadge, type SslStatus } from '@/components/ui/ssl-status-badge';

import type { CustomDomain } from './types';
import { looksInternal } from './utils';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface DomainCardProps {
  domain: CustomDomain;
  appStatus: string;
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

type StatusConfig = {
  dot: string;
  border: string;
  bg: string;
  text: string;
  label: string;
  icon?: React.ReactNode;
};

function getStatusConfig(domain: CustomDomain): StatusConfig {
  switch (domain.status) {
    case 'active':
      return {
        dot: '#4ade80',
        border: 'border-emerald-400/25',
        bg: 'bg-emerald-500/[0.08]',
        text: 'text-emerald-300',
        label: 'Active',
        icon: <Check className="h-2.5 w-2.5" />,
      };
    case 'verified':
      return {
        dot: '#60a5fa',
        border: 'border-blue-400/25',
        bg: 'bg-blue-500/[0.08]',
        text: 'text-blue-300',
        label: 'Verified',
        icon: <Shield className="h-2.5 w-2.5" />,
      };
    case 'pending':
      return {
        dot: '#fbbf24',
        border: 'border-amber-400/25',
        bg: 'bg-amber-500/[0.08]',
        text: 'text-amber-200',
        label: 'Pending',
        icon: <AlertCircle className="h-2.5 w-2.5" />,
      };
    case 'failed':
      return {
        dot: '#f87171',
        border: 'border-rose-500/25',
        bg: 'bg-rose-500/[0.08]',
        text: 'text-rose-300',
        label: 'Failed',
        icon: <AlertCircle className="h-2.5 w-2.5" />,
      };
    default:
      return {
        dot: 'rgba(255,255,255,0.3)',
        border: 'border-white/[0.08]',
        bg: 'bg-white/[0.04]',
        text: 'text-white/50',
        label: 'Unknown',
      };
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
      className={`mx-4 mb-0 mt-3 border rounded-[4px] px-3 py-2.5 ${
        domain.dns_ready
          ? 'border-emerald-500/25 bg-emerald-500/[0.05]'
          : 'border-amber-400/25 bg-amber-500/[0.05]'
      }`}
    >
      <div className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40 mb-1`}>
        DNS Status
      </div>
      <p
        className={`${MONO} text-[11.5px] font-medium ${
          domain.dns_ready ? 'text-emerald-300' : 'text-amber-200'
        }`}
      >
        {friendlyMessage}
      </p>
      {!domain.dns_ready && resolved && (
        <p className={`${MONO} mt-1.5 text-[10.5px] text-white/40`}>
          <span className="text-white/30">Currently resolves to:</span> {resolved}
        </p>
      )}
    </div>
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
      description:
        domain.dns_ready === false
          ? 'You can activate now. If DNS is still propagating, secure connection will finish once DNS is ready.'
          : 'Secure connection setup will start automatically once activated.',
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
  const statusConfig = getStatusConfig(domain);

  return (
    <div className="border border-white/[0.06] bg-[#0d0e11] rounded-[5px] overflow-hidden">
      {/* Header row */}
      <div className="px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {domain.status === 'active' ? (
              <a
                href={`https://${domain.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${MONO} inline-flex min-w-0 items-center gap-1 text-[13px] font-semibold text-white hover:text-[#0095FF] transition-colors`}
              >
                <span className="truncate">{domain.domain}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            ) : (
              <span className={`${MONO} min-w-0 max-w-full truncate text-[13px] font-semibold text-white`}>{domain.domain}</span>
            )}

            {domain.is_primary && (
              <span
                className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 border border-yellow-400/25 bg-yellow-500/[0.08] text-[10px] uppercase tracking-[0.12em] text-yellow-300 rounded-[20px]`}
              >
                <Star className="h-2.5 w-2.5" />
                Primary
              </span>
            )}
          </div>

          {domain.last_error && !looksInternal(domain.last_error) && (
            <p className={`${MONO} mt-1 text-[11px] text-rose-300`}>{domain.last_error}</p>
          )}
          {domain.last_error && looksInternal(domain.last_error) && (
            <p className={`${MONO} mt-1 text-[11px] text-rose-300`}>
              There was an issue with this domain. Try again or contact support.
            </p>
          )}
        </div>

        {/* Status badge */}
        <span
          className={`${MONO} inline-flex w-fit items-center gap-1.5 px-2.5 py-1 border ${statusConfig.border} ${statusConfig.bg} text-[10px] uppercase tracking-[0.12em] ${statusConfig.text} rounded-[20px] flex-shrink-0`}
        >
          {statusConfig.icon}
          {statusConfig.label}
        </span>
      </div>

      <DnsStatusPanel domain={domain} />

      {domain.status === 'active' && (
        <div className="px-4 mt-3">
          <SslStatusBadge
            sslStatus={domain.ssl_status as SslStatus}
            id={domain.id}
            onCheck={anyOperationRunning ? undefined : onCheckSsl}
            checkingId={checkingSslId}
            variant="card"
            dnsMessage={domain.dns_message}
          />
        </div>
      )}

      {/* Next action */}
      {nextAction && (
        <div className="mx-4 mt-3 border border-white/[0.06] bg-[#111216] rounded-[4px] px-4 py-3">
          <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>
            Next Step
          </span>
          <p className={`${MONO} mt-1.5 text-[12px] font-semibold text-white`}>{nextAction.title}</p>
          <p className={`${MONO} mt-1 text-[11px] text-white/50`}>{nextAction.description}</p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {nextAction.action === 'verify' && (
              <button
                type="button"
                onClick={() => onVerify(domain.id)}
                disabled={anyOperationRunning}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[#0095FF]/30 bg-[#0d0e11] px-3 text-[12.5px] font-medium text-[#0095FF] transition-colors hover:bg-[#0095FF]/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {verifyingId === domain.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Verify
              </button>
            )}

            {nextAction.action === 'activate' && (
              <button
                type="button"
                onClick={() => onActivate(domain.id)}
                disabled={anyOperationRunning || appStatus !== 'running'}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[#0095FF]/30 bg-[#0d0e11] px-3 text-[12.5px] font-medium text-[#0095FF] transition-colors hover:bg-[#0095FF]/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {activatingId === domain.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Activate
              </button>
            )}

            {nextAction.action === 'set-primary' && (
              <button
                type="button"
                onClick={() => onSetPrimary(domain.id)}
                disabled={anyOperationRunning}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[#0095FF]/30 bg-[#0d0e11] px-3 text-[12.5px] font-medium text-[#0095FF] transition-colors hover:bg-[#0095FF]/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {settingPrimaryId === domain.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Star className="h-3.5 w-3.5" />
                )}
                Set Primary
              </button>
            )}

            {nextAction.action === 're-activate' && (
              <button
                type="button"
                onClick={() => onActivate(domain.id)}
                disabled={anyOperationRunning || appStatus !== 'running'}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[#0095FF]/30 bg-[#0d0e11] px-3 text-[12.5px] font-medium text-[#0095FF] transition-colors hover:bg-[#0095FF]/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {activatingId === domain.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Re-Activate
              </button>
            )}
          </div>
        </div>
      )}

      {/* TXT verification instructions */}
      {domain.status === 'pending' && (
        <div className="mx-4 mt-3 border border-amber-400/20 bg-amber-500/[0.04] rounded-[5px] px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-300 flex-shrink-0" />
            <span className={`${MONO} text-[11px] uppercase tracking-[0.10em] text-amber-300`}>
              Ownership verification required
            </span>
          </div>
          <p className={`${MONO} text-[11px] text-white/55`}>
            Add this TXT record at your DNS provider, then click <strong className="text-white">Verify</strong>:
          </p>
          <div className="border border-white/[0.06] bg-[#111216] rounded-[4px] divide-y divide-white/[0.04]">
            <div className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className={`${MONO} text-[10px] uppercase tracking-[0.10em] text-white/35`}>
                Record type
              </span>
              <span className={`${MONO} text-[11.5px] text-white`}>TXT</span>
            </div>
            <div className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className={`${MONO} text-[10px] uppercase tracking-[0.10em] text-white/35 flex-shrink-0`}>
                Record name
              </span>
              <button
                type="button"
                onClick={() =>
                  onCopy(`ahuracloud-verify.${domain.domain}`, `pending-name-${domain.id}`)
                }
                className={`${MONO} flex min-w-0 items-center gap-1.5 text-left text-[11.5px] text-white hover:text-[#0095FF] transition-colors`}
              >
                <span className="max-w-full break-all sm:max-w-[190px] sm:truncate">{`ahuracloud-verify.${domain.domain}`}</span>
                {copiedField === `pending-name-${domain.id}` ? (
                  <Check className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                ) : (
                  <Copy className="h-3 w-3 text-white/35 flex-shrink-0" />
                )}
              </button>
            </div>
            <div className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className={`${MONO} text-[10px] uppercase tracking-[0.10em] text-white/35 flex-shrink-0`}>
                Record value
              </span>
              <button
                type="button"
                onClick={() =>
                  onCopy(domain.verification_token, `pending-token-${domain.id}`)
                }
                className={`${MONO} flex min-w-0 items-center gap-1.5 text-left text-[11.5px] text-white hover:text-[#0095FF] transition-colors`}
              >
                <span className="max-w-full break-all sm:max-w-[190px] sm:truncate">{domain.verification_token}</span>
                {copiedField === `pending-token-${domain.id}` ? (
                  <Check className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                ) : (
                  <Copy className="h-3 w-3 text-white/35 flex-shrink-0" />
                )}
              </button>
            </div>
          </div>
          <p className={`${MONO} text-[10px] text-white/35`}>
            DNS changes may take a few minutes to a few hours.
          </p>
        </div>
      )}

      {/* Footer actions */}
      <div className="px-4 py-3 mt-3 border-t border-white/[0.06] flex items-center gap-2">
        <Link href={`/dashboard/domains/${encodeURIComponent(domain.domain)}`}>
          <span
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[5px] border border-white/[0.10] bg-white/[0.03] px-3 text-[12.5px] font-medium text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Manage
          </span>
        </Link>

        <button
          type="button"
          onClick={() => onRemoveConfirm(domain.id)}
          disabled={anyOperationRunning}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-rose-500/25 bg-[#0d0e11] px-3 text-[12.5px] font-medium text-rose-200 transition-colors hover:bg-rose-500/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {removingId === domain.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Remove
        </button>
      </div>
    </div>
  );
}
