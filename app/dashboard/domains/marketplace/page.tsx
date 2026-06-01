'use client';

// Domain marketplace — editorial canvas focused on the search experience.
// Hero + search/results only. No nav chrome, no trust strip, no how-it-works.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { DomainMarketplaceTab } from '@/components/dashboard/apps/domain-marketplace';
import type { PurchaseRequest } from '@/components/dashboard/apps/domain-marketplace/types';
import { consumePendingDomain } from '@/lib/domain-intent';

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-nunito), system-ui, sans-serif',
};
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export default function DomainMarketplacePage() {
  const searchParams = useSearchParams();
  const [initialQuery, setInitialQuery] = useState('');
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);

  useEffect(() => {
    const pending = consumePendingDomain();
    const domainParam = searchParams.get('domain');
    setInitialQuery(domainParam || pending?.domain || '');
  }, [searchParams]);

  const fetchRequests = useCallback(async (silent = false) => {
    void silent;
    try {
      const res = await fetch('/api/domains/market/purchase-requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data?.data ?? []);
      }
    } catch {
      // swallow — request state is best-effort here
    }
  }, []);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const hasActive = requests.some((r) => !TERMINAL_STATUSES.has(r.status));
    if (!hasActive) return;
    const id = setInterval(() => {
      void fetchRequests(true);
    }, 5_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[900px] w-[900px] blur-[60px]"
          style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.10), transparent 60%)' }}
        />
        <div
          className="absolute top-[200px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.05), transparent 60%)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.022) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <div className="relative z-10 px-4 py-10 sm:px-6 sm:py-12 lg:px-10">
        <div className="mx-auto max-w-[1600px]">
          {/* ── Hero ──────────────────────────────────────── */}
          <header className="relative mb-10 lg:mb-12">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end lg:gap-14">
              <div>
                <p
                  className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/55`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                  Domain marketplace
                </p>
                <h1 className="text-[40px] font-semibold leading-[1.04] tracking-[-0.03em] text-white sm:text-[52px] lg:text-[60px]">
                  Find your perfect{' '}
                  <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
                    domain
                  </span>
                </h1>
              </div>
              <p className="max-w-[460px] text-[14.5px] leading-[1.6] text-white/55 lg:pb-3">
                Search across 500+ extensions, compare pricing side-by-side, and
                register through our managed ICANN-accredited backend — WHOIS
                privacy included on every domain.
              </p>
            </div>
          </header>

          {/* ── Search + Results ────────────────────────────── */}
          <section>
            <DomainMarketplaceTab initialQuery={initialQuery} onPurchaseRequested={fetchRequests} />
          </section>
        </div>
      </div>
    </div>
  );
}
