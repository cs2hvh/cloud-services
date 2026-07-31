/**
 * What each worker owns — the single place that maps a runner to its job table.
 *
 * Every value here is taken from the runner's own scan() and its migration, not
 * assumed. Getting `claimable` wrong would mislabel a healthy queue as backed
 * up, so each entry cites where it came from.
 *
 * Deliberately NOT derived at runtime: the whole point of a registry is that an
 * operator can read one file and know what the fleet consists of, including a
 * runner that has never run and therefore has no rows to infer from.
 *
 * Doc: nextstespsAI/21-admin-platform.md (§4, section A4 — Jobs & runners).
 */

export interface RunnerSpec {
  /** Logical worker name, matching workers/<dir> and the k8s Deployment. */
  service: string;
  /** Human label for the UI. */
  label: string;
  /** What it does, in one line. */
  purpose: string;
  schema: "inference" | "agentcore";
  table: string;
  /** Statuses the runner's scan() claims — "work is waiting". */
  claimable: string[];
  /** Statuses meaning a worker holds the row right now. */
  in_flight: string[];
  /** Terminal success / failure, for throughput. */
  done: string[];
  failed: string[];
  /** Per-job heartbeat column, or null if the table has none. */
  heartbeat_column: string | null;
  /** Column to date rows by, for the "recent" window. */
  time_column: string;
  /**
   * Extra gate on `claimable`: some scans require more than a status match.
   * A row whose status is claimable but which fails this gate counts as neither
   * queued nor in flight — it is resting, not waiting.
   */
  claimable_when?: (row: Record<string, unknown>) => boolean;
  /** Columns `claimable_when` needs the query to fetch. */
  extra_columns?: string[];
  /** In-cluster health Service (unreachable today — see fleet.ts on LKE). */
  health_url: string;
  /**
   * Why this runner is not expected to be up right now, or null when it should be.
   *
   * Without this every undeployed runner reads as `not_deployed` forever, and a
   * page that is five parts noise to one part signal teaches an operator to stop
   * looking — the exact failure feature-health.ts avoids by refusing to paint
   * `unused` capabilities red. A deliberately paused runner is a product fact;
   * a runner that should be up and is not is an incident. They must not look
   * the same.
   */
  on_hold: string | null;
}

/**
 * NOTE ON `media`: there is no media-runner deployable. `inference.media_jobs`
 * is claimed by the gateway's own queue consumer, but it is a claim-based job
 * table with a heartbeat like the others, and it currently holds the fleet's
 * worst problem (3 jobs in flight, untouched for 31 days). Excluding it because
 * it lacks a k8s Deployment would hide exactly what this page exists to show.
 */
export const RUNNERS: RunnerSpec[] = [
  {
    service: "ft-runner",
    label: "Fine-tuning",
    purpose: "Provisions RunPod GPUs and runs training jobs",
    schema: "inference",
    table: "finetunes",
    // workers/ft-runner/src/scan.ts → .eq("status", "queued")
    claimable: ["queued"],
    // inference.finetune_status ENUM (20260523000001): queued | preparing |
    // running | completed | failed | cancelled. An earlier version of this file
    // invented 'provisioning'/'training'/'uploading' and MISSED 'preparing',
    // which made a preparing job count as neither queued nor in flight — the row
    // read "Idle" while real work existed.
    in_flight: ["preparing", "running"],
    done: ["completed"],
    failed: ["failed", "cancelled"],
    heartbeat_column: "last_heartbeat_at",
    time_column: "created_at",
    health_url: "http://ahura-ft-runner-health.ahura.svc.cluster.local:8080/health",
    on_hold: "Fine-tuning is on hold — no runner deployed, and the last 27 jobs predate the pause."
  },
  {
    service: "data-runner",
    label: "RAG connectors",
    purpose: "Syncs S3 buckets and web crawls into vector collections",
    schema: "inference",
    table: "connectors",
    // workers/data-runner/src/scan.ts → status 'queued' claimed, 'syncing' in flight
    claimable: ["queued"],
    in_flight: ["syncing"],
    done: ["idle"],
    failed: ["error"],
    heartbeat_column: "heartbeat_at",
    time_column: "updated_at",
    health_url: "http://ahura-data-runner-health.ahura.svc.cluster.local:8080/health",
    on_hold: "Connector syncs are on hold — the runner is built and imaged but not deployed; manual sync via the API still works."
  },
  {
    service: "eval-runner",
    label: "Evals",
    purpose: "Executes eval suites case by case",
    schema: "inference",
    table: "eval_runs",
    // workers/eval-runner/src/scan.ts → .eq("status", "queued")
    claimable: ["queued"],
    in_flight: ["running"],
    done: ["completed"],
    failed: ["failed", "cancelled"],
    heartbeat_column: "heartbeat_at",
    time_column: "created_at",
    health_url: "http://ahura-eval-runner-health.ahura.svc.cluster.local:8080/health",
    on_hold: "Evals are on hold — the runner is built and imaged but not deployed."
  },
  {
    service: "deploy-runner",
    label: "BYO deployments",
    purpose: "Creates and tears down customer model endpoints",
    schema: "inference",
    table: "deployments",
    // inference.deployment_status ENUM (20260523000001): building | deploying |
    // active | paused | failed | deleted. 'deleting' and 'ready' were invented
    // here; 'active' — the steady success state — was missing entirely.
    //
    // workers/deploy-runner/src/scan.ts claims 'building' (create) and 'paused'
    // ONLY when runpod_endpoint_id IS NOT NULL (delete). A paused deployment with
    // no endpoint is resting, not waiting, so counting it as queued would show a
    // permanent false "Backed up".
    claimable: ["building", "paused"],
    claimable_when: (row) =>
      row.status !== "paused" || row.runpod_endpoint_id !== null,
    extra_columns: ["runpod_endpoint_id"],
    in_flight: ["deploying"],
    done: ["active", "deleted"],
    failed: ["failed"],
    heartbeat_column: null, // table has no heartbeat column
    time_column: "created_at",
    health_url: "http://ahura-deploy-runner-health.ahura.svc.cluster.local:8080/health",
    on_hold: "BYO deployments are on hold — never used by any customer (0 rows ever)."
  },
  {
    service: "agent-runner",
    label: "Agents",
    purpose: "Runs durable multi-step agent loops and their tools",
    schema: "agentcore",
    table: "runs",
    // workers/agent-runner/src/scan.ts → .eq("status", "queued")
    claimable: ["queued"],
    in_flight: ["running"],
    done: ["completed"],
    failed: ["failed", "cancelled"],
    heartbeat_column: "heartbeat_at",
    time_column: "created_at",
    health_url: "http://ahura-agent-runner-health.ahura.svc.cluster.local:8080/health",
    on_hold: "Agents cannot be deployed yet: there is no CI image workflow for this runner, unlike the other four. Runs will queue indefinitely until one exists."
  },
  {
    service: "media",
    label: "Media generation",
    purpose: "Image, video, speech and OCR jobs",
    schema: "inference",
    table: "media_jobs",
    // CHECK (20260623000001): queued | running | completed | failed | canceled.
    // Note the ONE-L spelling — 'cancelled' can never occur here, unlike every
    // other table in this registry, so a cancelled media job used to count as
    // nothing at all.
    claimable: ["queued"],
    in_flight: ["running"],
    done: ["completed"],
    failed: ["failed", "canceled"],
    heartbeat_column: "heartbeat_at",
    time_column: "created_at",
    health_url: "", // no dedicated deployable — see the note above
    on_hold: null, // not a deployable at all — the gateway settles these inline
  },
];

export function findRunner(service: string): RunnerSpec | undefined {
  return RUNNERS.find((r) => r.service === service);
}

/** Env var that overrides one runner's health URL, e.g. for a local runner. */
export function healthUrlEnvVar(service: string): string {
  return `RUNNER_HEALTH_URL_${service.replace(/-/g, "_").toUpperCase()}`;
}

/**
 * Where to probe this runner, or null if it cannot be probed at all.
 *
 * Null is NOT an outage. `media` has no /health service, and treating "no URL"
 * as unreachable made enabling probing flip that row from an accurate "degraded"
 * to a false "down" — caught by probing a real local runner on 2026-07-30.
 */
export function probeTargetFor(spec: RunnerSpec, env: Record<string, string | undefined>): string | null {
  return env[healthUrlEnvVar(spec.service)] || spec.health_url || null;
}
