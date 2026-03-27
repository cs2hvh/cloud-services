'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Info, Search, ShoppingCart } from 'lucide-react';

import { DomainMarketplaceTab } from '@/components/dashboard/apps/domain-marketplace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { consumePendingDomain, type PendingDomainIntent } from '@/lib/domain-intent';

const steps = [
  {
    title: 'Search',
    description: 'Check availability and pricing instantly.',
    icon: Search,
  },
  {
    title: 'Purchase',
    description: 'Submit managed domain purchase requests.',
    icon: ShoppingCart,
  },
  {
    title: 'Track Requests',
    description: 'Monitor request status: pending, completed, or failed.',
    icon: CheckCircle2,
  },
] as const;

export default function DomainMarketplacePage() {
  const searchParams = useSearchParams();
  const [initialQuery, setInitialQuery] = useState('');
  const [pendingIntent, setPendingIntent] = useState<PendingDomainIntent | null>(null);

  // Consume localStorage intent exactly once on mount (not on every searchParams change)
  useEffect(() => {
    const pending = consumePendingDomain();
    if (pending) setPendingIntent(pending);
  }, []);

  // Sync initialQuery from ?domain= URL param whenever it changes
  useEffect(() => {
    const domainParam = searchParams.get('domain');
    if (domainParam) {
      setInitialQuery(domainParam);
    } else if (pendingIntent) {
      setInitialQuery(pendingIntent.domain);
    }
  }, [searchParams, pendingIntent]);

  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-6"
      >
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-sky-600/20 via-cyan-500/10 to-emerald-500/10 p-5 sm:p-7">
          <div className="absolute right-0 top-0 h-40 w-40 translate-x-1/4 -translate-y-1/4 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 -translate-x-1/3 translate-y-1/3 rounded-full bg-emerald-400/20 blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
                Domain Marketplace
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Buy domains globally for your account.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-[15px]">
                This page is only for domain buying and request tracking. Domain management and app connections are in Domains Dashboard.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge className="border-cyan-500/20 bg-cyan-500/15 text-cyan-100">Buy only flow</Badge>
                <Badge className="border-white/20 bg-white/10 text-white/90">Account-level domains</Badge>
              </div>
            </div>

            <Link href="/dashboard/domains">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Open Domains Dashboard
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>

      {pendingIntent && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.25 }}
          className="mb-4"
        >
          <div className="flex items-start gap-3 rounded-lg border border-blue-500/25 bg-blue-500/10 p-4">
            <Info className="h-4 w-4 mt-0.5 text-blue-300 shrink-0" />
            <div className="text-sm text-blue-100">
              <p className="font-medium">
                You were looking to purchase <span className="text-white font-semibold">{pendingIntent.domain}</span>
              </p>
              <p className="mt-1 text-blue-200/70 text-xs">
                Search results are shown below. Domain availability may have changed — please verify before purchasing.
                {pendingIntent.price !== null && (
                  <span> Last seen price: <span className="text-white/80">{pendingIntent.currency === 'USD' ? '$' : pendingIntent.currency + ' '}{pendingIntent.price}</span></span>
                )}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04, duration: 0.28 }}
        className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        {steps.map((step, index) => (
          <Card key={step.title} className="glass-panel border-white/10 bg-white/[0.03]">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-xs font-semibold text-white/80">
                  {index + 1}
                </div>
                <step.icon className="h-4 w-4 text-white/65" />
              </div>
              <p className="text-sm font-semibold text-white">{step.title}</p>
              <p className="mt-1 text-xs text-white/50">{step.description}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.28 }}
      >
        <DomainMarketplaceTab
          modeLabel="Search, purchase, and track domain requests across your account."
          showAttachActions={false}
          initialQuery={initialQuery}
        />
      </motion.div>
    </div>
  );
}
