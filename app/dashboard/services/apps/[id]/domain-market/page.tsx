'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  PlugZap,
} from 'lucide-react';

import { DomainMarketplaceTab } from '@/components/dashboard/apps/domain-marketplace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/axios/axios';

interface AppSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  deployment_url?: string;
}

interface MarketplaceSummary {
  channel: 'ahuracloud';
  configured: boolean;
  mode: 'managed_reseller';
  capabilities?: {
    search: boolean;
    purchase_requests: boolean;
    auto_fulfillment: boolean;
  };
  notes?: string;
}

const workflow = [
  {
    title: 'Search',
    description: 'Find an available domain or validate a full domain name.',
    icon: Search,
  },
  {
    title: 'Purchase',
    description: 'Submit a purchase request managed by AhuraCloud.',
    icon: ShoppingCart,
  },
  {
    title: 'Attach',
    description: 'Add the domain to this app and finish DNS verification in Domains tab.',
    icon: CheckCircle2,
  },
] as const;

export default function AppDomainMarketPage() {
  const params = useParams();
  const appId = params.id as string;

  const [app, setApp] = useState<AppSummary | null>(null);
  const [marketplace, setMarketplace] = useState<MarketplaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadContext = async () => {
      setLoading(true);
      setError(null);

      try {
        const [appRes, summaryRes] = await Promise.all([
          api.post('/services/platform-apps/get', { app_id: appId }),
          fetch('/api/services/platform-apps/domains/market/summary'),
        ]);

        if (!appRes.data) {
          throw new Error('Failed to load app');
        }

        setApp(appRes.data as AppSummary);

        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          setMarketplace((summaryData?.data || null) as MarketplaceSummary | null);
        }
      } catch (err) {
        console.error('Error loading domain market context:', err);
        setError('Failed to load domain marketplace. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    void loadContext();
  }, [appId]);

  const appDomain = useMemo(() => {
    if (!app) return '';

    if (app.deployment_url) {
      try {
        return new URL(app.deployment_url).hostname;
      } catch {
        return `${app.slug}.galaxyhvh.com`;
      }
    }

    return `${app.slug}.galaxyhvh.com`;
  }, [app]);

  const configuredCount = marketplace?.configured ? 1 : 0;

  if (loading) {
    return (
      <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-white/60" />
          <p className="text-sm text-white/50">Loading domain marketplace...</p>
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
        <Card className="mx-auto max-w-xl bg-red-500/10 border-red-500/20">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-300" />
            <p className="text-sm text-red-100">{error || 'App not found'}</p>
            <Link href="/dashboard/services/apps" className="inline-block mt-5">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Apps
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-black min-h-screen p-4 sm:p-8 text-white">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Link
          href={`/dashboard/services/apps/${appId}`}
          className="mb-4 inline-flex items-center text-white/60 transition-colors hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to App
        </Link>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-sky-600/20 via-cyan-500/10 to-emerald-500/10 p-5 sm:p-7">
          <div className="absolute right-0 top-0 h-44 w-44 translate-x-1/4 -translate-y-1/4 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-36 w-36 -translate-x-1/3 translate-y-1/3 rounded-full bg-emerald-400/20 blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                Domain Marketplace
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{app.name}</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Search domain names, submit managed purchase requests, and connect domains to this app.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge className="border-white/20 bg-white/10 text-white">
                  {configuredCount}/1 marketplace configured
                </Badge>
                <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-200">
                  App status: {app.status}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <a href={`https://${appDomain}`} target="_blank" rel="noopener noreferrer">
                <Button className="w-full sm:w-auto">
                  <Globe className="w-4 h-4 mr-2" />
                  Open App
                  <ExternalLink className="w-3.5 h-3.5 ml-2" />
                </Button>
              </a>
              <Link href={`/dashboard/services/apps/${appId}`}>
                <Button variant="outline" className="w-full sm:w-auto border-white/20 text-white hover:bg-white/10">
                  Manage Domains
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-6 grid gap-4 xl:grid-cols-3"
      >
        <Card className="bg-white/5 border-white/10 xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PlugZap className="w-4 h-4" />
              Purchase Workflow
            </CardTitle>
            <CardDescription className="text-white/50">
              Complete these steps to move from idea to live custom domain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {workflow.map((step, index) => (
                <div key={step.title} className="rounded-lg border border-white/10 bg-black/25 p-3">
                  <div className="mb-2 flex items-center gap-2 text-white/80">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                      {index + 1}
                    </div>
                    <step.icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium text-white">{step.title}</p>
                  <p className="mt-1 text-xs text-white/50">{step.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-base">Marketplace Status</CardTitle>
            <CardDescription className="text-white/50">
              Managed reseller channel used by AhuraCloud.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!marketplace ? (
              <p className="text-sm text-white/50">Marketplace metadata unavailable.</p>
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">AhuraCloud Domains</p>
                  <Badge
                    className={marketplace.configured
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
                      : 'border-amber-500/30 bg-amber-500/15 text-amber-200'}
                  >
                    {marketplace.configured ? 'Active' : 'Needs Setup'}
                  </Badge>
                </div>
                <p className="text-xs text-white/50">{marketplace.notes || 'No notes available.'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <DomainMarketplaceTab appId={appId} />
      </motion.div>
    </div>
  );
}
