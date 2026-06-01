'use client';

import { Loader2, Lock, LockOpen, RefreshCw } from 'lucide-react';

export type SslStatus = 'pending' | 'issuing' | 'active' | 'failed' | null | undefined;

interface SslStatusBadgeProps {
  /** The current ssl_status value from the domain record. */
  sslStatus: SslStatus;
  /** The domain/connection row id, used to track which row is loading. */
  id: string;
  /** If provided, a "Check now" button is rendered when status = issuing. */
  onCheck?: (id: string) => void;
  /** Id of the row currently being checked — disables / shows spinner on that row's button. */
  checkingId?: string | null;
  /** Visual variant: 'card' renders a padded block; 'row' renders a compact inline strip. */
  variant?: 'card' | 'row';
  /** When set alongside issuing status, shows a DNS-specific hint instead of the generic message. */
  dnsMessage?: string;
}

/**
 * Shared SSL status indicator used in both the app-level domain card
 * (variant="card") and the domain detail connections tab (variant="row").
 */
export function SslStatusBadge({
  sslStatus,
  id,
  onCheck,
  checkingId,
  variant = 'card',
  dnsMessage,
}: SslStatusBadgeProps) {
  const isRow = variant === 'row';

  if (!sslStatus || sslStatus === 'pending') return null;

  if (sslStatus === 'active') {
    const base = isRow
      ? 'mt-2 flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 text-xs text-emerald-300'
      : 'mt-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-300';
    return (
      <div className={base}>
        {!isRow && (
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-white/50">SSL / TLS</div>
        )}
        <div className="flex items-center gap-1.5">
          <Lock className={isRow ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
          <span className={isRow ? undefined : 'font-medium'}>
            {isRow ? 'SSL active — encrypted' : 'Secure connection is active and encrypted.'}
          </span>
        </div>
      </div>
    );
  }

  if (sslStatus === 'issuing') {
    const base = isRow
      ? 'mt-2 rounded border border-blue-500/30 bg-blue-500/5 px-2.5 py-1.5 text-xs text-blue-200'
      : 'mt-3 rounded border border-blue-500/30 bg-blue-500/5 p-3 text-sm text-blue-200';
    return (
      <div className={base}>
        {!isRow && (
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-white/50">SSL / TLS</div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Loader2 className={`${isRow ? 'h-3 w-3' : 'h-3.5 w-3.5'} shrink-0 animate-spin`} />
            <span className={isRow ? undefined : 'font-medium'}>
              {isRow ? 'SSL issuing — takes 2–5 min' : "Secure connection is being prepared."}
            </span>
          </div>
          {onCheck && (
            <button
              type="button"
              onClick={() => onCheck(id)}
              disabled={checkingId === id}
              className="flex shrink-0 items-center gap-1 text-xs text-blue-300 hover:text-blue-100 disabled:opacity-50"
            >
              {checkingId === id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {isRow ? 'Check' : 'Check now'}
            </button>
          )}
        </div>
        {/* Show dns hint in both variants */}
        {isRow ? (
          dnsMessage && (
            <p className="mt-1 text-[11px] text-amber-200/70 leading-relaxed">{dnsMessage}</p>
          )
        ) : (
          <p className="mt-1.5 text-xs text-white/45">
            {dnsMessage
              ? dnsMessage
              : "This usually takes 2–5 minutes. The browser padlock will appear once setup is complete. Your site is live but the connection is not yet encrypted end-to-end."}
          </p>
        )}
      </div>
    );
  }

  if (sslStatus === 'failed') {
    const base = isRow
      ? 'mt-2 rounded border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-xs text-red-200'
      : 'mt-3 rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200';
    return (
      <div className={base}>
        {!isRow && (
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-white/50">SSL / TLS</div>
        )}
        <div className="flex items-center gap-1.5">
          <LockOpen className={isRow ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
          <span className={isRow ? undefined : 'font-medium'}>
            {isRow
              ? 'SSL failed — re-activate to retry'
              : 'Secure connection failed — site is not encrypted.'}
          </span>
        </div>
        {isRow ? (
          dnsMessage && (
            <p className="mt-1 text-[11px] text-amber-200/70 leading-relaxed">{dnsMessage}</p>
          )
        ) : (
          <p className="mt-1.5 text-xs text-white/45">
            {dnsMessage
              ? dnsMessage
              : "Ensure your domain’s DNS A/CNAME record points to our servers, then re-activate. If the issue persists, contact support."}
          </p>
        )}
      </div>
    );
  }

  return null;
}
