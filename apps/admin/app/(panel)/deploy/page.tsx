import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  Hammer,
  CircleCheck,
  CircleX,
  DollarSign,
  AlertTriangle,
  Boxes,
  Loader2,
} from "lucide-react";
import { requireAdmin } from "@/lib/supabase/auth";
import {
  queueView,
  fleetView,
  hostnameView,
  workloadView,
  r2View,
  usageView,
  metricsView,
  sweepView,
  type QueueView,
  type FleetView,
  type UsageView,
} from "@/lib/paas/telemetry/operator";
import { db } from "@/lib/paas/db.ts";
import { PageHeader } from "@admin/components/page-header";
import { StatCard } from "@admin/components/stat-card";
import { RefreshButton } from "@admin/components/deploy/refresh-button";
import { Panel, money } from "@admin/components/deploy/bits";
import { QueueSection } from "@admin/components/deploy/queue-section";
import { FleetSection } from "@admin/components/deploy/fleet-section";
import { WorkloadsSection } from "@admin/components/deploy/workloads-section";
import { HostnamesSection } from "@admin/components/deploy/hostnames-section";
import { StorageSection } from "@admin/components/deploy/storage-section";
import { UsageSection } from "@admin/components/deploy/usage-section";
import { MetricsSection } from "@admin/components/deploy/metrics-section";
import { SweepsSection } from "@admin/components/deploy/sweeps-section";
import {
  DriftHistorySection,
  type DriftObservationRow,
} from "@admin/components/deploy/drift-history-section";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Deploy v2 operations. Every view is kicked off once, in parallel, and each
 * section awaits only its own promise inside its own Suspense boundary — a
 * slow Linode or R2 read streams in late instead of stalling the page, and a
 * failed one renders as that section saying why. Never cached: "is this
 * current" is the question these views exist to answer.
 */

type Settled<T> = T | { error: string };
const settle = <T,>(p: Promise<T>): Promise<Settled<T>> =>
  p.catch((e) => ({ error: (e as Error).message.slice(0, 300) }));

const DRIFT_COLUMNS =
  "select=kind,resource_type,cloud_id,ref,hourly_usd,detail,observed_at,resolved_at";

/**
 * Open set is UNBOUNDED on purpose: rows resolve only when the aggregator is
 * run by hand, so open grows monotonically between runs, and a page that
 * silently truncates open findings is the exact lie this lane exists to call
 * out. Only the recently-resolved list is capped.
 */
const loadDriftHistory = async () => {
  const [open, resolved] = await Promise.all([
    db.select<DriftObservationRow>(
      "drift_observations",
      `${DRIFT_COLUMNS}&resolved_at=is.null&order=observed_at.asc`,
    ),
    db.select<DriftObservationRow>(
      "drift_observations",
      `${DRIFT_COLUMNS}&resolved_at=not.is.null&order=resolved_at.desc&limit=20`,
    ),
  ]);
  return { open, resolved };
};

async function KpiRow({
  queueP,
  fleetP,
  usageP,
}: {
  queueP: Promise<Settled<QueueView>>;
  fleetP: Promise<Settled<FleetView>>;
  usageP: Promise<Settled<UsageView>>;
}) {
  const [queue, fleet, usage] = await Promise.all([queueP, fleetP, usageP]);
  const q = "error" in queue ? null : queue;
  const f = "error" in fleet ? null : fleet;
  const u = "error" in usage ? null : usage;

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
          value={f ? money(f.monthly.standing) : "—"}
          hint="per month, build VMs excluded"
          icon={DollarSign}
        />
        <StatCard
          label="Unaccounted"
          value={f ? `${money(f.drift.unaccountedHourly, 4)}/hr` : "—"}
          hint="Linode bills it, no row admits it"
          icon={AlertTriangle}
          tone={f ? (f.drift.unaccountedHourly > 0 ? "critical" : "good") : undefined}
        />
        <StatCard
          label="Apps running"
          value={u ? u.apps.length : "—"}
          hint={
            u
              ? u.summary.quiet
                ? "no signals"
                : `${u.summary.critical} critical · ${u.summary.warn} warn`
              : "usage unreadable"
          }
          icon={Boxes}
          tone={u && u.summary.critical > 0 ? "critical" : undefined}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Live read, generated {new Date().toUTCString()}. Nothing on this page
        changes anything.
      </p>
    </>
  );
}

function SectionFallback({ title }: { title: string }) {
  return (
    <Panel title={title} subtitle="Live read in progress">
      <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        reading upstream…
      </div>
    </Panel>
  );
}

export default async function DeployAdminPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  // All nine reads start here, together. Sections consume their own promise.
  const queueP = settle(queueView());
  const fleetP = settle(fleetView());
  const workloadsP = settle(workloadView());
  const hostnamesP = settle(hostnameView());
  const storageP = settle(r2View());
  const usageP = settle(usageView());
  const metricsP = settle(metricsView());
  const sweepsP = settle(sweepView());
  const driftP = settle(loadDriftHistory());

  return (
    <div>
      <PageHeader
        title="Deploy v2"
        description="PaaS operations — build queue, fleet cost, drift, and the sweeps that watch it all"
        actions={<RefreshButton />}
      />

      <Suspense
        fallback={
          <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            reading queue, fleet and usage…
          </div>
        }
      >
        <KpiRow queueP={queueP} fleetP={fleetP} usageP={usageP} />
      </Suspense>

      <div className="mt-6 space-y-6">
        <Suspense fallback={<SectionFallback title="Build queue" />}>
          {queueP.then((queue) => <QueueSection queue={queue} />)}
        </Suspense>
        <Suspense fallback={<SectionFallback title="Fleet" />}>
          {fleetP.then((fleet) => <FleetSection fleet={fleet} />)}
        </Suspense>
        <Suspense fallback={<SectionFallback title="Workloads" />}>
          {workloadsP.then((w) => <WorkloadsSection workloads={w} />)}
        </Suspense>
        <Suspense fallback={<SectionFallback title="Hostnames" />}>
          {hostnamesP.then((h) => <HostnamesSection hostnames={h} />)}
        </Suspense>
        <Suspense fallback={<SectionFallback title="Object storage" />}>
          {storageP.then((s) => <StorageSection storage={s} />)}
        </Suspense>
        <Suspense fallback={<SectionFallback title="Running now" />}>
          {usageP.then((u) => <UsageSection usage={u} />)}
        </Suspense>
        <Suspense fallback={<SectionFallback title="Metrics" />}>
          {metricsP.then((m) => <MetricsSection metrics={m} />)}
        </Suspense>
        <Suspense fallback={<SectionFallback title="Sweeps" />}>
          {sweepsP.then((s) => <SweepsSection sweeps={s} />)}
        </Suspense>
        <Suspense fallback={<SectionFallback title="Drift history" />}>
          {driftP.then((h) => <DriftHistorySection history={h} />)}
        </Suspense>
      </div>
    </div>
  );
}
