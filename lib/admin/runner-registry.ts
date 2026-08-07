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

/**
 * What the Jobs admin can show and do for one job table.
 *
 * TWO RULES, both learned the expensive way elsewhere in this directory:
 *
 * 1. **Every status string is cited to its migration.** `media_jobs` spells it
 *    `canceled` with one L while every other table uses `cancelled`; writing the
 *    wrong one does not error, it just matches no rows.
 * 2. **"Cannot" is a first-class answer.** A retry that only flips a row to
 *    `queued` is real work only when something CLAIMS that queue. Nothing claims
 *    `media_jobs` — the gateway settles those inline — so a media retry would
 *    look successful and leave the job stuck forever. `retry_to: null` with a
 *    stated reason is the honest encoding, and the UI shows the reason instead
 *    of a button that lies.
 */
export interface JobOpsSpec {
  /** Column holding the failure text an operator needs to see. Null if none. */
  error_column: string | null;
  /** Column that best names the job in a list (model, display name). */
  label_column: string | null;
  /** Extra columns worth showing, beyond id/org/status/time/label/error. */
  detail_columns: string[];
  /** Status a retry moves a row to, or null when retry is not real here. */
  retry_to: string | null;
  /** Why retry is unavailable. Set exactly when retry_to is null. */
  retry_unavailable_reason: string | null;
  /** Columns cleared on retry so the row is claimable again (claim, heartbeat, error). */
  retry_clear: string[];
  /**
   * What a retry will COST, when re-running is not free. Shown in the
   * confirmation — an operator retrying a failed job on a customer's behalf is
   * spending that customer's money, and must be told so before they click.
   */
  retry_warning: string | null;
  /** Status a cancel moves a row to, or null when the table has no such state. */
  cancel_to: string | null;
  /** Why cancel is unavailable. Set exactly when cancel_to is null. */
  cancel_unavailable_reason: string | null;
  /**
   * What an operator should know before cancelling — money or resources that do
   * NOT stop just because the row did. Shown in the confirmation, not buried.
   */
  cancel_warning: string | null;
}

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
   * How one job of this kind is shown and operated on in the Jobs admin.
   *
   * Kept HERE rather than in a second registry because the statuses above and
   * the statuses an action moves a row between must agree — splitting them is
   * how `cancelled` vs `canceled` drifts back in.
   */
  jobs: JobOpsSpec;
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
    on_hold: "Fine-tuning is on hold — no runner deployed, and the last 27 jobs predate the pause.",
    jobs: {
      error_column: "error_message",
      label_column: "name",
      detail_columns: ["base_model_id", "gpu_sku", "cost_cents"],
      // ft-runner/src/scan.ts claims `queued`, so this is a real requeue.
      retry_to: "queued",
      retry_unavailable_reason: null,
      retry_clear: ["error_message", "runpod_job_id", "started_at", "completed_at", "last_heartbeat_at"],
      retry_warning: "Re-runs training from scratch on a fresh GPU. The customer is charged for the new run.",
      cancel_to: "cancelled",
      cancel_unavailable_reason: null,
      // The finetune-watchdog's zombie sweep terminates pods left on TERMINAL
      // jobs, so cancelling is what actually stops the GPU bill — but not
      // instantly, and it is worth an operator knowing that.
      cancel_warning:
        "Any RunPod GPU pod for this job keeps billing until the finetune watchdog's next sweep terminates it (within ~5 minutes).",
    },
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
    on_hold: "Connector syncs are on hold — the runner is built and imaged but not deployed; manual sync via the API still works.",
    jobs: {
      error_column: "last_error",
      label_column: "display_name",
      detail_columns: ["kind", "sync_schedule", "docs_total", "last_synced_at"],
      retry_to: "queued",
      retry_unavailable_reason: null,
      retry_clear: ["last_error", "claimed_by", "heartbeat_at"],
      retry_warning: "Re-syncs the source. Re-embedding changed documents is billed to the customer.",
      // 'error' is what the ingest-watchdog already sets when it reaps a dead
      // sync (CHECK 20260721000001: idle|queued|syncing|error|disabled). Using
      // the same terminal state keeps "cancel then retry" symmetrical with what
      // the watchdog does on its own.
      cancel_to: "error",
      cancel_unavailable_reason: null,
      cancel_warning: null,
    },
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
    on_hold: "Evals are on hold — the runner is built and imaged but not deployed.",
    jobs: {
      error_column: "error",
      label_column: "name",
      detail_columns: ["model_id", "total_cases", "completed_cases", "avg_score"],
      retry_to: "queued",
      retry_unavailable_reason: null,
      retry_clear: ["error", "heartbeat_at"],
      // Checked against workers/eval-runner/src/lifecycle.ts: a re-run iterates
      // EVERY case in the dataset, not just the unfinished ones (the pending-row
      // pre-insert is `ignoreDuplicates`, and the batch loop has no
      // already-scored filter). So a retry is a full re-run and a full re-charge.
      retry_warning: "Re-runs every case in the dataset, including ones that already scored, and bills the customer for all of them.",
      cancel_to: "cancelled",
      cancel_unavailable_reason: null,
      cancel_warning: null,
    },
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
    on_hold: "BYO deployments are on hold — never used by any customer (0 rows ever).",
    jobs: {
      error_column: "error_message",
      label_column: "name",
      detail_columns: ["source", "source_ref", "gpu_sku", "runpod_endpoint_id"],
      // 'building' is the claimable create state, so this re-runs the build.
      // NOT 'queued' — inference.deployment_status has no such value.
      retry_to: "building",
      retry_unavailable_reason: null,
      retry_clear: ["error_message", "image_uri"],
      retry_warning: "Rebuilds the customer's image and re-provisions the endpoint.",
      // deployment_status (20260523000001) is building|deploying|active|paused|
      // failed|deleted — there is no 'cancelled'. 'failed' is what the runner
      // itself writes when it gives up, so it is the truthful terminal state.
      cancel_to: "failed",
      cancel_unavailable_reason: null,
      cancel_warning:
        "Marks the deployment failed. Any RunPod endpoint already created is NOT torn down by this — delete it from the deployment itself.",
    },
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
    on_hold: "Agents cannot be deployed yet: there is no CI image workflow for this runner, unlike the other four. Runs will queue indefinitely until one exists.",
    jobs: {
      error_column: "error",
      label_column: null, // a run has no name — the agent_id and input identify it
      detail_columns: ["agent_id", "step_count", "cost_cents", "max_cost_cents", "expires_at"],
      retry_to: "queued",
      retry_unavailable_reason: null,
      // expires_at MUST be pushed forward — a run requeued with a past
      // expires_at is reaped by the run-reaper within five minutes and the
      // retry would look like it silently failed again. Handled as a special
      // case in lib/admin/jobs-ops.ts, which is why it is not just a clear.
      retry_clear: ["error", "claimed_by", "heartbeat_at"],
      retry_warning: "Re-runs the agent loop from its original input. Tool calls and model tokens are billed again.",
      cancel_to: "cancelled",
      cancel_unavailable_reason: null,
      cancel_warning:
        "Any sandbox session this run opened is released by the sandbox reaper, not immediately.",
    },
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
    jobs: {
      error_column: "error_code",
      label_column: "model_id",
      // `cost_cents` is DELIBERATELY ABSENT, unlike every other job kind here.
      //
      // The column exists on `media_jobs` and no code path ever writes it —
      // verified 2026-08-06: 20 completed jobs, every one still 0, while those
      // same 20 jobs have correct usage rows totalling real money. Media bills
      // through `inference.usage` (the gateway enqueues a usage event, the
      // consumer prices it from the model's pricing JSONB); the job row only
      // ever records the QUANTITY. Showing the column anyway put a permanent
      // "0" in front of an operator asking "what did this cost?", and a wrong
      // number is worse than no number.
      //
      // Populating it instead would mean teaching the gateway to price a job,
      // duplicating pricing logic that lives in the usage consumer — the exact
      // drift behind every other bug this registry has had. So the quantity is
      // shown (`num_units` + `unit_label` = "4 video_second") and cost is left
      // to the Usage page, which reads the ledger that actually has it.
      //
      // fine-tunes (6 of 7 completed) and agent runs (315 of 330) DO write
      // theirs, which is why they keep the column.
      detail_columns: ["modality", "num_units", "unit_label", "output_url"],
      // NOT RETRYABLE FROM HERE, and this is the honest answer rather than a
      // missing feature. Nothing claims `media_jobs` from the queue — the
      // gateway settles them inline — so flipping a row back to 'queued' would
      // report success and leave the job stuck forever, which is strictly worse
      // than no button. A real retry has to re-submit upstream with the
      // customer's own routing and key, which is exactly what
      // POST /v1/videos/:id/retry does (workers/inference/src/routes/
      // video-generations.ts) and what the customer should be pointed at.
      retry_to: null,
      retry_unavailable_reason:
        "Nothing consumes the media queue — the gateway settles these jobs inline, so re-queueing would strand the job. The customer retries with POST /v1/videos/{id}/retry, which re-submits upstream under their own key.",
      retry_clear: [],
      retry_warning: null,
      // One L — CHECK constraint in 20260623000001.
      cancel_to: "canceled",
      cancel_unavailable_reason: null,
      cancel_warning:
        "Stops the job being reported as in flight. It does not cancel work already running at the upstream provider.",
    },
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
