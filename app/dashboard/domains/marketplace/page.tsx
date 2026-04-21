'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Globe, ShieldCheck, Zap } from 'lucide-react';

import { DomainMarketplaceTab } from '@/components/dashboard/apps/domain-marketplace';
import { PurchaseRequests } from '@/components/dashboard/apps/domain-marketplace/purchase-requests';
import type { PurchaseRequest } from '@/components/dashboard/apps/domain-marketplace/types';
import { consumePendingDomain } from '@/lib/domain-intent';

export default function DomainMarketplacePage() {
  const searchParams = useSearchParams();
  const [initialQuery, setInitialQuery] = useState('');
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  useEffect(() => {
    const pending = consumePendingDomain();
    const domainParam = searchParams.get('domain');
    setInitialQuery(domainParam || pending?.domain || '');
  }, [searchParams]);

  const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

  const fetchRequests = useCallback(async (silent = false) => {
    if (!silent) setRequestsLoading(true);
    try {
      const res = await fetch('/api/domains/market/purchase-requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data?.data ?? []);
      }
    } finally {
      if (!silent) setRequestsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRequests(); }, [fetchRequests]);

  // Poll every 5s while any request is still in-progress
  useEffect(() => {
    const hasActive = requests.some((r) => !TERMINAL_STATUSES.has(r.status));
    if (!hasActive) return;
    const id = setInterval(() => { void fetchRequests(true); }, 5_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  return (
    <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-6 glass-panel overflow-hidden"
      >
        <div className="px-6 py-5">
          <nav className="mb-4 flex items-center gap-1.5 text-sm text-white/38">
            <Link href="/dashboard/domains" className="flex items-center gap-1.5 transition-colors hover:text-white/70">
              <ArrowLeft className="h-3.5 w-3.5" />
              Domains
            </Link>
          </nav>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/70">
                Domain Marketplace
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Search domain names and request registration.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
                Use this page for search and registration. DNS, renewals, and routing stay on the Domains page.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { icon: Globe, text: '500+ extensions' },
                  { icon: ShieldCheck, text: 'Managed registrar' },
                  { icon: Zap, text: 'Instant availability' },
                ].map(({ icon: Icon, text }) => (
                  <span key={text} className="inline-flex items-center gap-1.5 border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/42">
                    <Icon className="h-3 w-3 text-cyan-300/70" />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            <Link
              href="/dashboard/domains"
              className="inline-flex shrink-0 self-start items-center justify-center gap-2 border border-cyan-400/25 bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 lg:mt-1"
            >
              Go to Domains
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.28 }}
      >
        <DomainMarketplaceTab initialQuery={initialQuery} onPurchaseRequested={fetchRequests} />
      </motion.div>

      {(requestsLoading || requests.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.28 }}
          className="mt-8"
        >
          <PurchaseRequests
            requests={requests}
            loading={requestsLoading}
            showAttachActions={false}
            attachOptions={[]}
            onRefresh={fetchRequests}
          />
        </motion.div>
      )}
    </div>
  );
}
