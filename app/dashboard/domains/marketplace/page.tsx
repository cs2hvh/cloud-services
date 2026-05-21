'use client';

// Domain marketplace — editorial canvas, big editorial title, trust bar,
// search + results (existing DomainMarketplaceTab), "how it works" 3-step
// strip, then any active purchase requests at the bottom. Matches the
// dashboard's editorial language.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Globe, ShieldCheck, Zap, Lock } from 'lucide-react';

import { DomainMarketplaceTab } from '@/components/dashboard/apps/domain-marketplace';
import { PurchaseRequests } from '@/components/dashboard/apps/domain-marketplace/purchase-requests';
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
  const [requestsLoading, setRequestsLoading] = useState(true);

  useEffect(() => {
    const pending = consumePendingDomain();
    const domainParam = searchParams.get('domain');
    setInitialQuery(domainParam || pending?.domain || '');
  }, [searchParams]);

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

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  // Poll every 5s while any request is still in-progress
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
          style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.08), transparent 60%)' }}
        />
        <div
          className="absolute top-[200px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
        {/* Back link */}
        <Link
          href="/dashboard/domains"
          className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors mb-8`}
        >
          ← My domains
        </Link>

        {/* ── Hero — centered ──────────────────────────── */}
        <header className="text-center mb-12 max-w-[780px] mx-auto">
          <div className={`${MONO} mb-5 inline-flex items-center gap-3 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
            <span className="h-px w-6 bg-white/30" />
            Domain Marketplace
            <span className="h-px w-6 bg-white/30" />
          </div>
          <h1 className="text-[40px] sm:text-[48px] leading-[1.05] tracking-[-0.03em] text-white font-semibold mb-3">
            Find your perfect{' '}
            <span
              style={{
                ...SERIF_STYLE,
                background: `linear-gradient(135deg, ${ACCENT}, #82adfb)`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              domain
            </span>
            .
          </h1>
          <p className={`${MONO} max-w-[520px] mx-auto text-[12px] text-white/45 leading-relaxed`}>
            Search across 500+ extensions, compare pricing side-by-side, and register through our managed ICANN-accredited backend.
          </p>
        </header>

        {/* ── Trust bar (4 features) ────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 max-w-[1100px] mx-auto mb-10">
          <TrustCell
            icon={<Globe className="h-4 w-4" />}
            value="500+ extensions"
            meta="All major and emerging TLDs"
          />
          <TrustCell
            icon={<ShieldCheck className="h-4 w-4" />}
            value="Managed registrar"
            meta="ICANN-accredited backend"
          />
          <TrustCell
            icon={<Zap className="h-4 w-4" />}
            value="Instant availability"
            meta="Sub-second WHOIS lookups"
          />
          <TrustCell
            icon={<Lock className="h-4 w-4" />}
            value="Free WHOIS privacy"
            meta="Included with every domain"
          />
        </section>

        {/* ── Search + Results (existing marketplace tab) ───── */}
        <section className="max-w-[1100px] mx-auto">
          <DomainMarketplaceTab initialQuery={initialQuery} onPurchaseRequested={fetchRequests} />
        </section>

        {/* ── How it works ───────────────────────────── */}
        <section className="mt-12 max-w-[1100px] mx-auto">
          <div className="mb-4">
            <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-1.5`}>
              How it works
            </p>
            <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-white">
              From search{' '}
              <span style={SERIF_STYLE} className="text-white/55 font-normal">
                to live in minutes
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <HowStep
              num="01"
              title="Search and compare"
              desc="Type once, see availability across 500+ TLDs. Pricing, premium status, and renewal cost surfaced upfront."
            />
            <HowStep
              num="02"
              title="Register and pay"
              desc="Add domains to your cart and check out with your billing method. WHOIS privacy is included at no extra cost."
            />
            <HowStep
              num="03"
              title="Manage and route"
              desc="DNS, renewals, and routing live on the Domains page. Connect to ahurasense apps and servers in one click."
            />
          </div>
        </section>

        {/* ── Active purchase requests ──────────────────── */}
        {(requestsLoading || requests.length > 0) && (
          <section className="mt-10 max-w-[1100px] mx-auto">
            <div className="mb-4">
              <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-1.5`}>
                In progress
              </p>
              <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-white">
                Purchase{' '}
                <span style={SERIF_STYLE} className="text-white/55 font-normal">
                  requests
                </span>
              </h2>
            </div>
            <PurchaseRequests
              requests={requests}
              loading={requestsLoading}
              showAttachActions={false}
              attachOptions={[]}
              onRefresh={fetchRequests}
            />
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────

function TrustCell({
  icon,
  value,
  meta,
}: {
  icon: React.ReactNode;
  value: string;
  meta: string;
}) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[5px] px-4 py-3.5 flex items-center gap-3">
      <span
        className="h-9 w-9 shrink-0 inline-flex items-center justify-center border rounded-[6px]"
        style={{
          color: ACCENT,
          background: 'rgba(0,149,255,0.06)',
          borderColor: 'rgba(0,149,255,0.2)',
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold tracking-[-0.005em] text-white">{value}</div>
        <div className={`${MONO} text-[10.5px] text-white/45 mt-0.5 truncate`}>{meta}</div>
      </div>
    </div>
  );
}

function HowStep({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[5px] p-5 flex flex-col gap-2">
      <span className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] font-semibold`} style={{ color: ACCENT }}>
        Step {num}
      </span>
      <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white">{title}</h3>
      <p className={`${MONO} text-[11px] text-white/50 leading-relaxed`}>{desc}</p>
    </div>
  );
}
