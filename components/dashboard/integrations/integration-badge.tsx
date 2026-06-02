'use client';

import { CheckCircle2, Clock, Loader2, Link2Off, XCircle } from 'lucide-react';
import type { IntegrationStatus } from './types';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface IntegrationBadgeProps {
  status: IntegrationStatus;
  className?: string;
}

export function IntegrationBadge({ status, className = '' }: IntegrationBadgeProps) {
  switch (status) {
    case 'linked':
      return (
        <span className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 border border-emerald-400/25 bg-emerald-500/[0.08] text-[10px] uppercase tracking-[0.12em] text-emerald-300 rounded-[20px] ${className}`}>
          <CheckCircle2 className="w-2.5 h-2.5" />
          Linked
        </span>
      );
    case 'pending':
      return (
        <span className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 border border-amber-400/25 bg-amber-500/[0.08] text-[10px] uppercase tracking-[0.12em] text-amber-200 rounded-[20px] ${className}`}>
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          Pending
        </span>
      );
    case 'failed':
      return (
        <span className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 border border-rose-500/25 bg-rose-500/[0.08] text-[10px] uppercase tracking-[0.12em] text-rose-300 rounded-[20px] ${className}`}>
          <XCircle className="w-2.5 h-2.5" />
          Failed
        </span>
      );
    case 'unlinked':
      return (
        <span className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 border border-white/[0.08] bg-white/[0.04] text-[10px] uppercase tracking-[0.12em] text-white/40 rounded-[20px] ${className}`}>
          <Link2Off className="w-2.5 h-2.5" />
          Unlinked
        </span>
      );
    default:
      return (
        <span className={`${MONO} inline-flex items-center gap-1 px-2 py-0.5 border border-white/[0.08] bg-white/[0.04] text-[10px] uppercase tracking-[0.12em] text-white/40 rounded-[20px] ${className}`}>
          <Clock className="w-2.5 h-2.5" />
          Unknown
        </span>
      );
  }
}
