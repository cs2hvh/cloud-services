import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  Hammer,
  CircleCheck,
  CircleX,
  DollarSign,
  AlertTriangle,
  Boxes,
} from "lucide-react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import {
  operatorView,
  queueView,
  type QueueView,
} from "@/lib/paas/telemetry/operator";
import { PageHeader } from "@admin/components/page-header";
import { StatCard } from "@admin/components/stat-card";
import { RefreshButton } from "@admin/components/deploy/refresh-button";
import { money } from "@admin/components/deploy/bits";
import { QueueSection } from "@admin/components/deploy/queue-section";
import { FleetSection } from "@admin/components/deploy/fleet-section";
import { WorkloadsSection } from "@admin/components/deploy/workloads-section";
import { HostnamesSection } from "@admin/components/deploy/hostnames-section";
import { StorageSection } from "@admin/components/deploy/storage-section";
import { UsageSection } from "@admin/components/deploy/usage-section";
import { MetricsSection } from "@admin/components/deploy/metrics-section";
import { SweepsSection } from "@admin/components/deploy/sweeps-section";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Deploy v2 operations. A server component that calls
 * lib/paas/telemetry/operator.ts directly, exactly like the main app's
 * operator page — the HTTP routes exist for scripts and alerting, and a page
 * taking a round trip to its own process would add a failure mode for
 * nothing. Every section settles independently: an operator page is most
 * useful precisely when something is broken.
 */
const DeployLive = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const [view, queue] = await Promise.all([
    operatorView(),
    queueView().catch(
      (e): { error: string } => ({ error: (e as Error).message.slice(0, 200) }),
    ) as Promise<QueueView | { error: string }>,
  ]);

  const q = "error" in queue ? null : queue;
  const fleet = "error" in view.fleet ? null : view.fleet;
  const usage = "error" in view.usage ? null : view.usage;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Building"
          value={q ? q.counts.queued + q.counts.building + q.counts.publishing : "—"}
          hint={q ? `${q.counts.queued} queued · ${q.counts.building} building` : "queue unreadable"}
          icon={Hammer}
          tone={q && q.stalled.length > 0 ? "critical" : undefined}
        />
        <StatCard
          label="Ready 24h"
          value={q ? q.counts.ready24h : "—"}
          icon={CircleCheck}
          tone={q ? "good" : undefined}
        />
        <StatCard
          label="Failed 24h"
          value={q ? q.counts.failed24h : "—"}
          icon={CircleX}
          tone={q && q.counts.failed24h > 0 ? "critical" : undefined}
        />
        <StatCard
          label="Standing spend"
          value={fleet ? `${money(fleet.monthly.standing)}` : "—"}
          hint="per month, build VMs excluded"
          icon={DollarSign}
        />
        <StatCard
          label="Unaccounted"
          value={fleet ? `${money(fleet.drift.unaccountedHourly, 4)}/hr` : "—"}
          hint="Linode bills it, no row admits it"
          icon={AlertTriangle}
          tone={fleet ? (fleet.drift.unaccountedHourly > 0 ? "critical" : "good") : undefined}
        />
        <StatCard
          label="Apps running"
          value={usage ? usage.apps.length : "—"}
          hint={
            usage
              ? usage.summary.quiet
                ? "no signals"
                : `${usage.summary.critical} critical · ${usage.summary.warn} warn`
              : "usage unreadable"
          }
          icon={Boxes}
          tone={usage && usage.summary.critical > 0 ? "critical" : undefined}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Live read, generated {new Date(view.generatedAt).toUTCString()}. Nothing
        on this page changes anything.
      </p>

      <div className="mt-6 space-y-6">
        <QueueSection queue={queue} />
        <FleetSection fleet={view.fleet} />
        <WorkloadsSection workloads={view.workloads} />
        <HostnamesSection hostnames={view.hostnames} />
        <StorageSection storage={view.storage} />
        <UsageSection usage={view.usage} />
        <MetricsSection metrics={view.metrics} />
        <SweepsSection sweeps={view.sweeps} />
      </div>
    </>
  );
};

export default function DeployAdminPage() {
  return (
    <div>
      <PageHeader
        title="Deploy v2"
        description="PaaS operations — build queue, fleet cost, drift, and the sweeps that watch it all"
        actions={<RefreshButton />}
      />
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <LoadingSpinner />
            <p className="text-xs text-muted-foreground">
              Reading Linode, the cluster, Cloudflare, and R2 live — the slow
              sections are fleet and storage.
            </p>
          </div>
        }
      >
        <DeployLive />
      </Suspense>
    </div>
  );
}
