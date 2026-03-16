'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Globe,
  Loader2,
  Plus,
  Search,
  ShoppingCart,
} from 'lucide-react';

import { DomainMarketplaceTab } from '@/components/dashboard/apps/domain-marketplace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AppListItem {
  id: string;
  name: string;
  slug?: string;
  status: string;
  deployment_url?: string;
}

const steps = [
  {
    title: 'Search Domain',
    description: 'Check availability and compare top domain options.',
    icon: Search,
  },
  {
    title: 'Purchase Domain',
    description: 'Submit a managed purchase request through AhuraCloud.',
    icon: ShoppingCart,
  },
  {
    title: 'Attach to App',
    description: 'Add domain to your selected app and complete DNS verification.',
    icon: CheckCircle2,
  },
] as const;

export default function DomainServicesPage() {
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadApps = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/services/platform-apps/list');
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.message || data?.error || 'Failed to load apps');
        }

        const appList = (data?.apps || []) as AppListItem[];
        setApps(appList);

        const preferred =
          appList.find((app) => app.status === 'running') ||
          appList[0];

        if (preferred) {
          setSelectedAppId(preferred.id);
        }
      } catch (err) {
        console.error('Failed to load apps for domain marketplace:', err);
        setError('Unable to load application list right now.');
      } finally {
        setLoading(false);
      }
    };

    void loadApps();
  }, []);

  const selectedApp = useMemo(
    () => apps.find((app) => app.id === selectedAppId) || null,
    [apps, selectedAppId]
  );

  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-3xl">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
            Domain Services
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Domain marketplace for your deployments.
            </h1>
            <Badge className="border-cyan-500/20 bg-cyan-500/10 text-cyan-200">
              Search / Buy / Connect
            </Badge>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
            Purchase domains through AhuraCloud and attach them to the application you choose below.
          </p>
        </div>

        <Link
          href="/dashboard/services/apps/new"
          className="inline-flex items-center justify-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Deploy Application
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04, duration: 0.28 }}
        className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        {steps.map((step, index) => (
          <Card key={step.title} className="glass-panel">
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
        transition={{ delay: 0.08, duration: 0.28 }}
        className="mb-6"
      >
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Target Application
            </CardTitle>
            <CardDescription className="text-white/50">
              Select which app will receive purchased domains.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading applications...
              </div>
            ) : error ? (
              <div className="text-sm text-red-300">{error}</div>
            ) : apps.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-white/70">No applications found. Deploy an app first to attach domains.</p>
                <Link href="/dashboard/services/apps/new" className="inline-flex items-center gap-1 mt-3 text-xs text-blue-300 hover:text-blue-200">
                  Deploy first app <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <>
                <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                  <SelectTrigger className="bg-black/30 border-white/10">
                    <SelectValue placeholder="Select an application" />
                  </SelectTrigger>
                  <SelectContent>
                    {apps.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.name} ({app.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedApp && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-white/10 bg-black/20 p-3">
                    <div>
                      <p className="text-sm font-medium text-white">{selectedApp.name}</p>
                      <p className="text-xs text-white/50">Status: {selectedApp.status}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/dashboard/services/apps/${selectedApp.id}`}>
                        <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" size="sm">
                          App Details
                        </Button>
                      </Link>
                      <Link href={`/dashboard/services/apps/${selectedApp.id}/domain-market`}>
                        <Button size="sm">
                          App Domain Page
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {selectedAppId && !loading && apps.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.28 }}
        >
          <DomainMarketplaceTab appId={selectedAppId} />
        </motion.div>
      )}
    </div>
  );
}
