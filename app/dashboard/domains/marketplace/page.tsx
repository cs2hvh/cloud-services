'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';

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

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const res = await fetch('/api/domains/market/purchase-requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data?.data ?? []);
      }
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRequests(); }, [fetchRequests]);

  return (
    <div className="flex-1 min-h-screen px-6 py-6 text-white sm:px-8 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-6"
      >
        <nav className="flex items-center gap-1.5 text-sm text-white/40 mb-3">
          <Link href="/dashboard/domains" className="hover:text-white/70 transition-colors flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Domains
          </Link>
        </nav>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/70">
              Domain Marketplace
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Search domain names and request registration.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
              Use this page for search and registration. DNS, renewals, and routing stay on the Domains page.
            </p>
          </div>

          <Link
            href="/dashboard/domains"
            className="inline-flex items-center justify-center gap-2 border border-cyan-400/25 bg-cyan-500/90 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
          >
            Go to Domains
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.28 }}
      >
        <DomainMarketplaceTab initialQuery={initialQuery} />
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
