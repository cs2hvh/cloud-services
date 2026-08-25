/**
 * Worker fleet health — pure, DB-free, UI-free.
 *
 * Answers "is each worker running, and is it getting through its work?" from two
 * signals, resolved ON DEMAND when the page loads or Refresh is pressed:
 *
 *   1. A LIVE PROBE of the runner's existing /health endpoint, which already
 *      reports readiness, when the claimer last ticked, and when the worker last
 *      did anything. Reachable via each runner's ClusterIP Service.
 *   2. QUEUE STATE from the runner's own job table: waiting, in flight, and
 *      in-flight rows whose per-job heartbeat has gone stale (died mid-job).
 *
 * WHY NOT A CONTINUOUS CHECK-IN TABLE?
 * An earlier design had every runner upsert a row each claimer tick. It was
 * rejected, correctly: Kubernetes ALREADY probes /health every 30s via
 * livenessProbe, so a database heartbeat re-implements the platform's own job,
 * costs a write every few seconds per pod forever, and needs a migration plus a
 * change to all five runners. A probe at the moment you look is simpler and more
 * truthful — it proves the process is answering NOW, not that it wrote a row
 * twelve seconds ago.
 *
 * The trade-off, stated honestly: a probe has no history. It cannot tell you a
 * worker was down at 03:00. If that is ever needed the answer is a metrics
 * scrape, not a bespoke table.
 *
 * Doc: nextstespsAI/21-admin-platform.md (§4, section A4 — Jobs & runners).
 */

/** What GET /health returns (workers/runner-core/src/health.ts). */
export interface RunnerHealthBody {
  ok?: boolean;
  ready?: boolean;
  /** Null until the claimer's first tick. */
  last_claim_tick_ms_ago?: number | null;
  last_worker_activity_ms_ago?: number | null;
}

/**
 * "not_probed" is a first-class outcome, not an error.
 *
 * VERIFIED TOPOLOGY (2026-07-30, via kubectl against the live cluster):
 *   - Each runner manifest DOES define a ClusterIP Service
 *     `ahura-<runner>-health` on port 8080 in namespace `ahura`
 *     (workers/<runner>/k8s/deployment.yaml).
 *   - The app runs in the SAME cluster (`default/cloud-services-dev-app`), and a
 *     pod there was confirmed able to resolve and reach a ClusterIP Service in
 *     another namespace. So the DEPLOYED app can probe these URLs.
 *   - "Outbound-only / 0 NodeBalancer" in infra/k8s/lke/README.md means no
 *     INBOUND path from the internet — it does not block in-cluster traffic.
 *   - No runner is deployed yet: namespace `ahura` does not exist.
 *
 * So probing is unavailable in exactly two cases — running from a laptop, and
 * before the runners are deployed — and the page must then say plainly that it
 * cannot confirm liveness, rather than paint five red "down" rows.
 */
export type ProbeOutcome = "ok" | "unreachable" | "unhealthy" | "not_probed";

export interface ProbeResult {
  service: string;
  url: string;
  outcome: ProbeOutcome;
  /** Round-trip time, for spotting a wedged-but-listening process. */
  latency_ms: number | null;
  status_code: number | null;
  body: RunnerHealthBody | null;
  error: string | null;
}

/** One runner's job table, already reduced to counts by the caller. */
export interface QueueSnapshot {
  service: string;
  queued: number;
  in_flight: number;
  /** In-flight rows whose per-job heartbeat has gone stale — died mid-job. */
  stuck: number;
  completed_recent: number;
  failed_recent: number;
  last_job_activity: string | null;
}

export type FleetStatus =
  | "working"       // reachable, claimer ticking, work in flight
  | "idle"          // reachable, claimer ticking, nothing to do — healthy
  | "degraded"      // reachable, but jobs are stuck mid-flight
  | "backed_up"     // reachable, work queued but not being picked up
  | "not_ticking"   // reachable, but the claimer has stopped polling
  | "down"          // unreachable, and it has job history
  | "not_deployed"  // unreachable, and no trace of it ever running
  | "unknown";      // not probed and nothing in flight — liveness undeterminable

export interface FleetVerdict {
  service: string;
  status: FleetStatus;
  reachable: boolean;
  latency_ms: number | null;
  ready: boolean | null;
  claim_tick_ms_ago: number | null;
  worker_idle_ms_ago: number | null;
  queued: number;
  in_flight: number;
  stuck: number;
  completed_recent: number;
  failed_recent: number;
  /** Plain-language reason, so the UI never has to infer one. */
  detail: string;
}

/**
 * A claimer that has not ticked within this window has stopped polling even
 * though the HTTP server still answers. That is the failure a plain liveness
 * probe misses: the process is up, the work is not moving.
 *
 * Generous because poll intervals are configurable (default 5s, tuned as high as
 * 60s elsewhere) — four minutes is well beyond any sane cadence.
 */
export const CLAIM_TICK_STALE_MS = 240_000;

/** A job in flight whose heartbeat is older than this died mid-job. */
export const STUCK_AFTER_MS = 10 * 60_000;

/** Window for the throughput columns. */
export const RECENT_HOURS = 24;

/**
 * The part of a RunnerSpec that reducing a job table actually needs. Structural
 * on purpose — the registry supplies it, and tests can too without importing it.
 */
export interface RunnerStatusVocab {
  service: string;
  claimable: string[];
  in_flight: string[];
  done: string[];
  failed: string[];
  heartbeat_column: string | null;
  time_column: string;
  /** Extra gate on `claimable` — see RunnerSpec.claimable_when. */
  claimable_when?: (row: Record<string, unknown>) => boolean;
}

export type JobRow = { status?: string | null } & Record<string, unknown>;

function msOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/**
 * Reduce one runner's job table to the counts a verdict needs.
 *
 * Pure so the status vocabulary is testable: getting `claimable` wrong is the
 * most likely bug in the whole feature, and it would silently mislabel a healthy
 * queue as backed up.
 */
export function snapshotOf(spec: RunnerStatusVocab, rows: JobRow[], now: number): QueueSnapshot {
  const recentCutoff = now - RECENT_HOURS * 3_600_000;
  let queued = 0, inFlight = 0, stuck = 0, done = 0, failed = 0;
  let lastActivity: number | null = null;

  for (const row of rows) {
    const status = row.status ?? "";
    // A claimable status is only really waiting if the scan's own extra
    // condition holds (e.g. a paused deployment needs an endpoint to tear down).
    // Failing the gate means resting, so it falls through to neither bucket.
    if (spec.claimable.includes(status)) {
      if (!spec.claimable_when || spec.claimable_when(row)) queued++;
    } else if (spec.in_flight.includes(status)) {
      inFlight++;
      // No heartbeat column means staleness cannot be judged — count it as in
      // flight but never as stuck, rather than inventing a verdict.
      if (spec.heartbeat_column) {
        const beat = msOf(row[spec.heartbeat_column]) ?? msOf(row[spec.time_column]);
        if (beat !== null && now - beat > STUCK_AFTER_MS) stuck++;
      }
    }
    const t = msOf(row[spec.time_column]);
    if (t !== null) {
      if (t >= recentCutoff) {
        if (spec.done.includes(status)) done++;
        else if (spec.failed.includes(status)) failed++;
      }
      lastActivity = lastActivity === null ? t : Math.max(lastActivity, t);
    }
  }

  return {
    service: spec.service,
    queued,
    in_flight: inFlight,
    stuck,
    completed_recent: done,
    failed_recent: failed,
    last_job_activity: lastActivity === null ? null : new Date(lastActivity).toISOString(),
  };
}

/**
 * Combine a probe and queue state into one verdict.
 *
 * Precedence is deliberate — the worst TRUE statement wins:
 *   down / not_deployed > not_ticking > degraded > backed_up > working > idle
 * A worker with stuck jobs is "degraded" even while processing others, because
 * the stuck ones will never finish on their own.
 */
export function verdictFor(
  service: string,
  probe: ProbeResult | undefined,
  queue: QueueSnapshot | undefined
): FleetVerdict {
  const q: QueueSnapshot = queue ?? {
    service,
    queued: 0,
    in_flight: 0,
    stuck: 0,
    completed_recent: 0,
    failed_recent: 0,
    last_job_activity: null,
  };

  const reachable = probe?.outcome === "ok";
  const probed = !!probe && probe.outcome !== "not_probed";
  const body = probe?.body ?? null;
  const tick = typeof body?.last_claim_tick_ms_ago === "number" ? body.last_claim_tick_ms_ago : null;

  let status: FleetStatus;
  let detail: string;

  if (!probed) {
    // Derived-only mode. Queue state still says plenty, and one inference gives
    // real liveness for free: a job IN FLIGHT whose per-job heartbeat is fresh
    // means some worker claimed it and is still touching it. `stuck` is exactly
    // the negation of that, so in_flight > stuck proves a live worker.
    const liveByInference = q.in_flight > q.stuck;
    if (q.stuck > 0) {
      status = "degraded";
      detail = `${q.stuck} job(s) in flight with a stale heartbeat`;
    } else if (liveByInference) {
      status = "working";
      detail = `${q.in_flight} job(s) in flight with live heartbeats — a worker is running`;
    } else if (q.queued > 0) {
      status = "backed_up";
      detail = `${q.queued} job(s) queued and nothing has claimed them`;
    } else {
      status = "unknown";
      // Two different reasons land here and they are NOT interchangeable:
      // probing being off, versus this job system having no /health to probe at
      // all. Saying "probing is off" on a server where it is ON is simply wrong,
      // so prefer the specific reason the caller supplied.
      detail = probe?.error
        ? `no work waiting, and ${probe.error}`
        : "no work waiting — liveness cannot be determined without probing /health";
    }
  } else if (!reachable) {
    // Distinguish "deployed but unreachable" from "never deployed": with no work
    // and no trace of any job, the runner probably isn't up yet — a different
    // action from investigating an outage.
    const everRan =
      q.queued > 0 || q.in_flight > 0 || q.completed_recent > 0 || q.failed_recent > 0 || !!q.last_job_activity;
    if (!everRan) {
      status = "not_deployed";
      detail = probe
        ? `no response from ${probe.url}, and no job history — runner not deployed?`
        : "not probed, and no job history — runner not deployed?";
    } else {
      status = "down";
      // State the evidence for "it exists", otherwise a runner with an empty
      // queue reads as "0 queued, 0 in flight, but timed out" — which sounds
      // like nothing is wrong and gives no hint why this isn't "not deployed".
      const evidence =
        q.queued > 0 || q.in_flight > 0
          ? `${q.queued} queued, ${q.in_flight} in flight`
          : q.completed_recent > 0 || q.failed_recent > 0
            ? `${q.completed_recent + q.failed_recent} job(s) in the last window`
            : "it has run jobs before";
      detail = `no response (${probe?.error ?? "no response"}), but ${evidence}`;
    }
  } else if (tick !== null && tick > CLAIM_TICK_STALE_MS) {
    // Answering HTTP but not polling Postgres — exactly what a liveness probe
    // alone would call healthy.
    status = "not_ticking";
    detail = `responding, but the claimer last ticked ${Math.round(tick / 1000)}s ago — work will not be picked up`;
  } else if (q.stuck > 0) {
    status = "degraded";
    detail = `${q.stuck} job(s) in flight with a stale heartbeat`;
  } else if (q.queued > 0 && q.in_flight === 0) {
    status = "backed_up";
    detail = `${q.queued} job(s) queued but none picked up`;
  } else if (q.in_flight > 0) {
    status = "working";
    detail = `${q.in_flight} job(s) in flight`;
  } else {
    status = "idle";
    detail = "responding, claimer ticking, no work waiting";
  }

  return {
    service,
    status,
    reachable,
    latency_ms: probe?.latency_ms ?? null,
    ready: typeof body?.ready === "boolean" ? body.ready : null,
    claim_tick_ms_ago: tick,
    worker_idle_ms_ago:
      typeof body?.last_worker_activity_ms_ago === "number" ? body.last_worker_activity_ms_ago : null,
    queued: q.queued,
    in_flight: q.in_flight,
    stuck: q.stuck,
    completed_recent: q.completed_recent,
    failed_recent: q.failed_recent,
    detail,
  };
}

export interface FleetSummary {
  services: number;
  healthy: number;
  down: number;
  degraded: number;
  backed_up: number;
  not_deployed: number;
  unknown: number;
  total_queued: number;
  total_stuck: number;
}

export function summarize(verdicts: FleetVerdict[]): FleetSummary {
  const count = (...s: FleetStatus[]) => verdicts.filter((v) => s.includes(v.status)).length;
  return {
    services: verdicts.length,
    healthy: count("working", "idle"),
    down: count("down", "not_ticking"),
    degraded: count("degraded"),
    backed_up: count("backed_up"),
    not_deployed: count("not_deployed"),
    unknown: count("unknown"),
    total_queued: verdicts.reduce((n, v) => n + v.queued, 0),
    total_stuck: verdicts.reduce((n, v) => n + v.stuck, 0),
  };
}

/** Worst-first, so whatever needs attention is at the top of the table. */
const RANK: Record<FleetStatus, number> = {
  down: 0,
  not_ticking: 1,
  degraded: 2,
  backed_up: 3,
  not_deployed: 4,
  unknown: 5,
  working: 6,
  idle: 7,
};

export function sortByUrgency(verdicts: FleetVerdict[]): FleetVerdict[] {
  return [...verdicts].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || b.stuck - a.stuck || a.service.localeCompare(b.service)
  );
}
