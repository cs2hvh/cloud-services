/**
 * The operator view: everything a person needs to answer "is the platform
 * healthy and what is it costing", assembled from the tested modules beside
 * this one.
 *
 * WHY THIS EXISTS RATHER THAN THE ROUTES DOING IT. Two reasons, both about
 * boundaries.
 *
 * The service role lives here, not in app/. `paas.clusters` and
 * `paas.build_vms` have RLS enabled with no policy, so they are reachable no
 * other way — but app/api/v2 carries a deliberate rule that nothing in it may
 * import a service-role client, because v1 used one for 100% of tenant queries
 * and reduced its own RLS to decoration. A route that calls a function here
 * keeps that rule intact while still reading platform data. The distinction
 * that makes it safe is that NOTHING in this file is scoped to a tenant: it is
 * fleet-wide by construction, and it is the caller's job to have proved the
 * caller is an operator before asking.
 *
 * And it means the logic is testable. Anything under app/ cannot currently be
 * typechecked or executed in this repo, so anything that lives there is
 * reviewed by inspection only. Everything with a decision in it belongs here.
 */

import { db } from "../db.ts";
import { BUILD_TIMEOUT_MS } from "../build/vm.ts";
import { paasConfig } from "../config.ts";
import { listObjects } from "../build/r2.ts";
import { listDnsRecords } from "../edge/cloudflare.ts";
import { loadKubeconfig, kube } from "../k8s/client.ts";
import {
  reconcileR2,
  type DeploymentLike as R2DeploymentLike,
  type R2DriftReport,
} from "./r2-drift.ts";
import {
  capacityDrift,
  reconcileWorkloads,
  workloadFrom,
  type CapacityDrift,
  type DeploymentRowLike,
  type WorkloadDriftReport,
} from "./workload-drift.ts";
import {
  byDeployment,
  podUsage,
  type DeploymentUsage,
  type PodMetricsLike,
} from "./metrics.ts";
import { assertControlPlaneReachable, loadCloudInventory, loadControlPlane } from "./fleet-source.ts";
import { MONTH_HOURS, reconcile, type DriftReport } from "./reconcile.ts";
import { ingressHosts, reconcileHostnames, type AliasLike, type DnsDriftReport } from "./dns-drift.ts";
import {
  buildUsage,
  deploymentRefFromPod,
  observeNamespace,
  type BuildUsage,
  type BuildVmLifetime,
  type PodLike,
} from "./usage.ts";
import { detectSignals, summarise, type Signal, type SignalSummary } from "./signals.ts";
import { sweepHealthReport, type SweepHealthReport } from "./sweep-health.ts";

const V2_TAG = "ahura-v2";
const BUILD_TAG = "ahura-v2-build";
const PLATFORM_NS = new Set([
  "default",
  "kube-system",
  "kube-public",
  "kube-node-lease",
  "ahura-system",
  "platform",
]);

function cluster() {
  const path = paasConfig.kubeconfigPath();
  return kube(loadKubeconfig(path));
}

// ── fleet ───────────────────────────────────────────────────────────────────

export interface FleetView {
  drift: DriftReport;
  monthly: { standing: number; foreign: number };
  observed: {
    lkeClusters: number;
    instances: number;
    nodeBalancers: number;
    clusterRows: number;
    buildVmRows: number;
  };
}

export async function fleetView(): Promise<FleetView> {
  await assertControlPlaneReachable();
  const [cloud, plane] = await Promise.all([loadCloudInventory(), loadControlPlane()]);

  const drift = reconcile({
    lkeClusters: cloud.lkeClusters,
    instances: cloud.instances,
    nodeBalancers: cloud.nodeBalancers,
    clusterRows: plane.clusterRows,
    buildVmRows: plane.buildVmRows,
    pricing: cloud.pricing,
    now: new Date(),
    v2Tag: V2_TAG,
    buildTag: BUILD_TAG,
  });

  return {
    drift,
    monthly: {
      // Standing only. Build VMs live for minutes; projecting one across 730
      // hours invents money — see `transientHourly` in reconcile.ts.
      standing: drift.standingHourly * MONTH_HOURS,
      foreign: drift.foreignHourly * MONTH_HOURS,
    },
    observed: {
      lkeClusters: cloud.lkeClusters.length,
      instances: cloud.instances.length,
      nodeBalancers: cloud.nodeBalancers.length,
      clusterRows: plane.clusterRows.length,
      buildVmRows: plane.buildVmRows.length,
    },
  };
}

// ── hostnames ───────────────────────────────────────────────────────────────

export interface HostnameView {
  drift: DnsDriftReport;
  gatewayIp: string;
  appDomain: string;
}

export async function hostnameView(): Promise<HostnameView> {
  const k = cluster();
  const namespace = process.env.V2_PAAS_NAMESPACE ?? "ahura-system";

  const svc = await k.get<{ status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } } }>(
    `/api/v1/namespaces/${namespace}/services/traefik`,
    true,
  );
  const gatewayIp = svc?.status?.loadBalancer?.ingress?.[0]?.ip;
  if (!gatewayIp) {
    throw new Error("[paas/telemetry] gateway has no LoadBalancer address — cannot classify records");
  }

  const [ingressList, records, aliases] = await Promise.all([
    k.get<{
      items: Array<{ metadata: { name: string; namespace: string }; spec?: { rules?: Array<{ host?: string }> } }>;
    }>("/apis/networking.k8s.io/v1/ingresses", true),
    listDnsRecords(),
    db.select<AliasLike>("aliases", "select=ref,hostname,kind,deployment_id&order=created_at"),
  ]);

  return {
    gatewayIp,
    appDomain: paasConfig.appDomain(),
    drift: reconcileHostnames({
      records,
      ingresses: (ingressList?.items ?? []).map(ingressHosts),
      aliases,
      gatewayIp,
      appDomain: paasConfig.appDomain(),
    }),
  };
}

// ── usage ───────────────────────────────────────────────────────────────────

export interface RunningApp {
  appKey: string;
  projectRef: string;
  namespace: string;
  pods: number;
  restarts: number;
  /** Earliest container start among this app's pods. */
  runningSince: string | null;
}

export interface UsageView {
  /** A point-in-time read, NOT accumulated usage. See the note below. */
  apps: RunningApp[];
  builds: BuildUsage;
  signals: Signal[];
  summary: SignalSummary;
  /**
   * Warm fraction is absent on purpose. It is an accumulation over time and
   * cannot be computed from one observation — a request handler that tried
   * would either invent a number or re-introduce v1's defect of metering only
   * when someone looks. It appears here once the sampler writes samples to a
   * table; the arithmetic already exists and is tested in usage.ts.
   */
  warmFractionAvailable: false;
}

export async function usageView(): Promise<UsageView> {
  const k = cluster();

  const namespaces = (await k.listNamespaces())
    .map((n) => n.metadata.name)
    .filter((n) => !PLATFORM_NS.has(n));

  const apps: RunningApp[] = [];
  for (const ns of namespaces) {
    const pods = (await k.listPods(ns)) as unknown as PodLike[];
    const projectRef = ns.startsWith("app-") ? ns.slice(4) : ns;
    for (const o of observeNamespace(ns, projectRef, pods, deploymentRefFromPod)) {
      const starts = o.pods.map((p) => p.startedAt).filter((s): s is string => !!s).sort();
      apps.push({
        appKey: o.appKey,
        projectRef: o.projectRef,
        namespace: o.namespace,
        pods: o.pods.length,
        restarts: o.pods.reduce((n, p) => n + p.restarts, 0),
        runningSince: starts[0] ?? null,
      });
    }
  }

  const now = new Date();
  const vmRows = await db.select<BuildVmLifetime>(
    "build_vms",
    "select=ref,deployment_id,created_at,destroyed_at,instance_type,expires_at&order=created_at",
  );
  const builds = buildUsage(vmRows, new Date(now.getTime() - 24 * 3600 * 1000), now);

  // Signals that do not need accumulation. Warm-fraction signals are omitted
  // rather than computed from a single sample: `degraded: true` marks every
  // app so nothing downstream mistakes this for a measured figure.
  const signals = detectSignals({
    apps: apps.map((a) => ({
      appKey: a.appKey,
      projectRef: a.projectRef,
      warmFraction: 0,
      degraded: true,
      restarts: a.restarts,
      peakPods: a.pods,
      podSeconds: 1,
    })),
    builds,
    windowSeconds: 24 * 3600,
  });

  return { apps, builds, signals, summary: summarise(signals), warmFractionAvailable: false };
}

// ── everything, for one dashboard render ────────────────────────────────────

// ── workloads ───────────────────────────────────────────────────────────────

export interface WorkloadView {
  drift: WorkloadDriftReport;
  capacity: CapacityDrift;
}

/**
 * Kubernetes Deployments against `paas.deployments`.
 *
 * The layer `fleetView` structurally cannot see: a workload with no row lives
 * inside Kubernetes, on a node that IS recorded, in a cluster that IS
 * recorded. Fleet drift reports clean while the pod rides along.
 */
export async function workloadView(): Promise<WorkloadView> {
  const k = cluster();

  const deploymentList = await k.get<{
    items: Array<{
      metadata: { name: string; namespace: string; labels?: Record<string, string> };
      spec?: { replicas?: number };
      status?: { readyReplicas?: number };
    }>;
  }>("/apis/apps/v1/deployments", true);

  const workloads = (deploymentList?.items ?? [])
    .filter((d) => !PLATFORM_NS.has(d.metadata.namespace))
    .map(workloadFrom);

  const [rows, placementRows, withIds, clusters] = await Promise.all([
    db.select<DeploymentRowLike>("deployments", "select=ref,state,project_id,scaled_to_zero_at,created_at:queued_at"),
    db.select<{ deployment_id: string; namespace: string }>(
      "deployment_placements",
      "select=deployment_id,namespace",
    ),
    db.select<{ id: string; ref: string }>("deployments", "select=id,ref"),
    db.select<{ pod_allocated: number }>("clusters", "select=pod_allocated&state=eq.ready"),
  ]);

  const idToRef = new Map(withIds.map((d) => [d.id, d.ref]));
  const placements = placementRows.map((p) => ({
    ref: idToRef.get(p.deployment_id),
    namespace: p.namespace,
  }));

  const drift = reconcileWorkloads({ workloads, deployments: rows, placements });

  // EVERY pod, platform namespaces included — see capacityDrift's docblock.
  // pod_allocated counts against the LKE pod cap and that cap counts
  // everything, so comparing it to the tenant count reports a false drift.
  const allPods = await k.get<{ items: Array<{ status?: { phase?: string } }> }>("/api/v1/pods", true);
  const runningPods = (allPods?.items ?? []).filter((p) => p.status?.phase === "Running").length;

  return {
    drift,
    capacity: capacityDrift(clusters.reduce((n, c) => n + c.pod_allocated, 0), runningPods),
  };
}

// ── object storage ──────────────────────────────────────────────────────────

export interface R2View {
  drift: R2DriftReport;
}

/**
 * R2 objects against `paas.deployments`. Nothing prunes this bucket, so it
 * grows monotonically and is invisible in every other report.
 */
export async function r2View(): Promise<R2View> {
  const [objects, deployments, projects] = await Promise.all([
    listObjects(""),
    db.select<R2DeploymentLike>("deployments", "select=ref,state,image_digest"),
    db.select<{ ref: string }>("projects", "select=ref"),
  ]);

  return {
    drift: reconcileR2({ objects, deployments, liveProjectRefs: projects.map((p) => p.ref) }),
  };
}

// ── are the observers running ───────────────────────────────────────────────

export interface SweepView {
  report: SweepHealthReport;
}

/**
 * The section that watches the other sections.
 *
 * Every view above reports on the platform. None of them could report that the
 * sweep feeding it had been failing every hour since it was installed, which is
 * how that went unnoticed — a sweep that never runs produces silence, and
 * silence renders exactly like a clean result.
 */
export async function sweepView(): Promise<SweepView> {
  const k = cluster();
  const ns = process.env.V2_PAAS_NAMESPACE ?? "ahura-system";
  const list = await k.get<{
    items: Array<{
      metadata: { name: string };
      spec?: {
        schedule?: string;
        suspend?: boolean;
        jobTemplate?: { spec?: { template?: { spec?: { containers?: Array<{ command?: string[] }> } } } };
      };
      status?: { lastScheduleTime?: string; lastSuccessfulTime?: string };
    }>;
  }>(`/apis/batch/v1/namespaces/${ns}/cronjobs`);

  // Throwing beats returning an empty report. No CronJobs and an unreadable API
  // both render as "nothing wrong with the sweeps", which is the one answer
  // this section must never give by accident.
  if (!list) throw new Error(`could not list CronJobs in ${ns}`);

  return {
    report: sweepHealthReport(
      (list.items ?? []).map((c) => ({
        name: c.metadata.name,
        schedule: c.spec?.schedule ?? "",
        suspended: c.spec?.suspend ?? false,
        lastScheduleTime: c.status?.lastScheduleTime ?? null,
        lastSuccessfulTime: c.status?.lastSuccessfulTime ?? null,
        command: c.spec?.jobTemplate?.spec?.template?.spec?.containers?.[0]?.command ?? [],
      })),
      Date.now(),
    ),
  };
}

// ── CPU and memory ──────────────────────────────────────────────────────────

export interface MetricsView {
  deployments: DeploymentUsage[];
  /** Pods whose usage could not be read at all. */
  unreadable: number;
}

/**
 * Per-app CPU and memory from the metrics.k8s.io aggregated API.
 *
 * Throws when metrics-server is not installed rather than returning zeros.
 * An idle app and a missing metrics API produce the same number, and a
 * dashboard showing 0m CPU for every app looks like a working dashboard —
 * which is the failure mode this whole lane exists to argue against.
 */
export async function metricsView(): Promise<MetricsView> {
  const k = cluster();

  const list = await k.get<{ items: PodMetricsLike[] }>(
    "/apis/metrics.k8s.io/v1beta1/pods",
    true,
  );
  if (!list) {
    throw new Error(
      "[paas/telemetry] metrics.k8s.io is not serving — metrics-server is not installed. " +
        "Reporting zeros here would be indistinguishable from an idle fleet.",
    );
  }

  const pods = (list.items ?? [])
    .filter((m) => !PLATFORM_NS.has(m.metadata.namespace))
    .map(podUsage);

  return {
    deployments: byDeployment(pods, deploymentRefFromPodName),
    unreadable: pods.filter((p) => p.cpuCores === null || p.memoryBytes === null).length,
  };
}

/**
 * metrics.k8s.io returns pod names without labels, so the deployment has to
 * come from the name. Same convention as usage.ts's fallback path: strip the
 * replicaset and pod suffixes Kubernetes appends.
 */
function deploymentRefFromPodName(podName: string): string {
  return podName.split("-").slice(0, -2).join("-") || podName;
}

export interface OperatorView {
  generatedAt: string;
  fleet: FleetView | { error: string };
  hostnames: HostnameView | { error: string };
  workloads: WorkloadView | { error: string };
  storage: R2View | { error: string };
  metrics: MetricsView | { error: string };
  usage: UsageView | { error: string };
  sweeps: SweepView | { error: string };
}

/**
 * Each section fails independently.
 *
 * An operator dashboard is most useful exactly when something is broken, so
 * one unreachable dependency must not blank the page. If Cloudflare is down,
 * the cost figures still render and say so.
 */
/** One deployment, as an operator needs to read it. */
export interface QueueEntry {
  deployment: string;
  project: string | null;
  projectName: string | null;
  state: string;
  trigger: string;
  branch: string;
  sha: string | null;
  queuedAt: string;
  startedAt: string | null;
  readyAt: string | null;
  waitingSeconds: number | null;
  runningSeconds: number | null;
  hasImage: boolean;
  errorCode: string | null;
  error: string | null;
}

export interface QueueView {
  windowHours: number;
  inFlight: QueueEntry[];
  recent: QueueEntry[];
  stalled: QueueEntry[];
  counts: {
    queued: number;
    building: number;
    publishing: number;
    failed24h: number;
    ready24h: number;
  };
  note?: string;
}

/** How much history the queue view carries. Long enough to cover a working day. */
const QUEUE_WINDOW_HOURS = 24;

/**
 * What the build queue is doing right now.
 *
 * The one operator view that did not exist. Fleet, hostnames, workloads and
 * storage all compare recorded state against reality; none answered 'is
 * anything building, and did the last thing fail?'. So the only way to see a
 * build was to read the worker's stdout on whichever machine happened to be
 * running it — which is not something an operator can do, and is how every
 * stuck deployment in this project was diagnosed.
 *
 * IN-FLIGHT IS SEPARATED FROM RECENT. Queued and building are what somebody is
 * waiting on; recent is history. Merged into one 'latest deployments' table, a
 * queue that has silently stopped moving looks identical to one with nothing
 * to do.
 */
export async function queueView(): Promise<QueueView> {
  const since = new Date(Date.now() - QUEUE_WINDOW_HOURS * 3_600_000).toISOString();

  const [rows, projectRows] = await Promise.all([
    db.select<{
      ref: string; state: string; trigger: string; git_ref: string; git_sha: string | null;
      error_code: string | null; error_message: string | null; queued_at: string;
      started_at: string | null; ready_at: string | null; image_digest: string | null;
      project_id: string;
    }>(
      "deployments",
      `select=ref,state,trigger,git_ref,git_sha,error_code,error_message,queued_at,` +
        `started_at,ready_at,image_digest,project_id` +
        `&or=(state.in.(queued,building,publishing),queued_at.gte.${since})` +
        `&order=queued_at.desc&limit=200`,
    ),
    db.select<{ id: string; ref: string; name: string }>("projects", "select=id,ref,name"),
  ]);

  const nameOf = new Map(projectRows.map((p) => [p.id, { ref: p.ref, name: p.name }]));
  const ageMs = (iso: string | null): number | null => (iso ? Date.now() - Date.parse(iso) : null);

  const shape = (r: (typeof rows)[number]): QueueEntry => {
    const waiting = ageMs(r.queued_at);
    const running = ageMs(r.started_at);
    return {
      deployment: r.ref,
      project: nameOf.get(r.project_id)?.ref ?? null,
      projectName: nameOf.get(r.project_id)?.name ?? null,
      state: r.state,
      trigger: r.trigger,
      branch: r.git_ref,
      sha: r.git_sha ? r.git_sha.slice(0, 7) : null,
      queuedAt: r.queued_at,
      startedAt: r.started_at,
      readyAt: r.ready_at,
      waitingSeconds: waiting === null ? null : Math.round(waiting / 1000),
      runningSeconds: running === null ? null : Math.round(running / 1000),
      hasImage: Boolean(r.image_digest),
      errorCode: r.error_code,
      // Truncated, never dropped: the whole reason this exists is that the
      // failure was only ever visible in a log on somebody's laptop.
      error: r.error_message ? r.error_message.slice(0, 300) : null,
    };
  };

  const inFlightStates = new Set(["queued", "building", "publishing"]);
  const inFlight = rows.filter((r) => inFlightStates.has(r.state)).map(shape);
  const recent = rows.filter((r) => !inFlightStates.has(r.state)).map(shape);

  // Past the build timeout and still unfinished: either a row abandoned when a
  // worker died, or nothing picking it up. A queued row with no worker running
  // looks exactly like a busy one from the database alone.
  const stalled = inFlight.filter((d) => {
    const age = d.state === "queued" ? d.waitingSeconds : (d.runningSeconds ?? d.waitingSeconds);
    return age !== null && age * 1000 > BUILD_TIMEOUT_MS;
  });

  return {
    windowHours: QUEUE_WINDOW_HOURS,
    inFlight,
    recent: recent.slice(0, 50),
    stalled,
    counts: {
      queued: inFlight.filter((d) => d.state === "queued").length,
      building: inFlight.filter((d) => d.state === "building").length,
      publishing: inFlight.filter((d) => d.state === "publishing").length,
      failed24h: recent.filter((d) => d.state === "error").length,
      ready24h: recent.filter((d) => d.state === "ready").length,
    },
    // Said in the payload rather than left to the reader: nothing here proves a
    // worker is alive.
    note:
      stalled.length > 0
        ? `${stalled.length} deployment(s) past the ${Math.round(BUILD_TIMEOUT_MS / 60000)}m build timeout — check that a build worker is running.`
        : undefined,
  };
}

export async function operatorView(): Promise<OperatorView> {
  const settle = async <T>(fn: () => Promise<T>): Promise<T | { error: string }> => {
    try {
      return await fn();
    } catch (e) {
      return { error: (e as Error).message.slice(0, 300) };
    }
  };

  const [fleet, hostnames, workloads, storage, metrics, usage, sweeps] = await Promise.all([
    settle(fleetView),
    settle(hostnameView),
    settle(workloadView),
    settle(r2View),
    settle(metricsView),
    settle(usageView),
    settle(sweepView),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    fleet,
    hostnames,
    workloads,
    storage,
    metrics,
    usage,
    sweeps,
  };
}
