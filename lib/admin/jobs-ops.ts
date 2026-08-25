/**
 * The Jobs admin — one row per long-running job, and the two actions an operator
 * needs on it. Pure: no DB, no UI.
 *
 * WHY THIS EXISTS: Worker Fleet answers "is the queue backed up" with counts.
 * It cannot answer "WHICH video failed for THIS customer, and can you re-run
 * it" — the question support actually receives. Doc 21 §4 (A4) promised retry /
 * cancel / force-reap; §8.11 records that none of it was built, so recovering
 * 17 failed fine-tunes and 3 media jobs stuck for 31 days meant `kubectl` and
 * hand-written SQL.
 *
 * THE DESIGN RULE HERE IS "REFUSE, WITH A REASON".
 *
 * Every action is planned before it is executed, and a plan that cannot legally
 * run comes back as a refusal carrying the sentence to show the operator. Three
 * distinct refusals, which a boolean `canRetry` would have collapsed into one
 * unhelpful greyed-out button:
 *
 *   - the job kind has no such action at all (media has no real retry, because
 *     nothing claims its queue — see runner-registry.ts);
 *   - the action exists but this row is in the wrong state (you cannot retry a
 *     job that is still running);
 *   - the action is legal but has a consequence worth confirming (a retry that
 *     re-bills the customer).
 *
 * The last one is not a refusal — it is a warning the route passes through and
 * the UI must show BEFORE the click, because an operator retrying a job on a
 * customer's behalf is spending that customer's money.
 */
import type { RunnerSpec } from "./runner-registry";

export type JobAction = "retry" | "cancel";

/** One job row, already narrowed to the columns the registry asked for. */
export type JobRow = Record<string, unknown>;

/** A job as the admin UI consumes it — table-agnostic. */
export interface JobView {
  id: string;
  org_id: string | null;
  org_name: string | null;
  status: string;
  label: string | null;
  error: string | null;
  created_at: string | null;
  /** Milliseconds since `created_at`, so the UI never re-parses dates. */
  age_ms: number | null;
  /** True when the row is queued or in flight, i.e. still consuming the fleet. */
  open: boolean;
  /**
   * True when this row is in flight and has not reported a heartbeat inside the
   * stuck threshold. These are the rows the page exists for.
   */
  stuck: boolean;
  /** The registry's `detail_columns`, passed through untouched. */
  details: Record<string, unknown>;
  /** What can be done to THIS row, and why not when it cannot. */
  actions: Record<JobAction, ActionAvailability>;
}

export interface ActionAvailability {
  allowed: boolean;
  /** Present exactly when `allowed` is false. */
  reason: string | null;
  /** Present when allowed AND there is a consequence to confirm first. */
  warning: string | null;
}

/** How long a claimed job may go without a heartbeat before it counts as stuck. */
export const STUCK_AFTER_MS = 30 * 60_000;

function str(row: JobRow, column: string | null): string | null {
  if (!column) return null;
  const v = row[column];
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

/**
 * Statuses a retry is legal from: the ones the registry already calls failure.
 *
 * Deliberately NOT "anything terminal" — re-running a COMPLETED job would
 * duplicate work the customer already paid for, and an operator scanning a list
 * of green rows should not be one misclick from doing that.
 */
export function retryableFrom(spec: RunnerSpec): string[] {
  return spec.jobs.retry_to ? [...spec.failed] : [];
}

/** Statuses a cancel is legal from: anything still open. Terminal rows are done. */
export function cancellableFrom(spec: RunnerSpec): string[] {
  return spec.jobs.cancel_to ? [...spec.claimable, ...spec.in_flight] : [];
}

function availability(
  spec: RunnerSpec,
  action: JobAction,
  status: string
): ActionAvailability {
  const ops = spec.jobs;
  const target = action === "retry" ? ops.retry_to : ops.cancel_to;
  const unavailable = action === "retry" ? ops.retry_unavailable_reason : ops.cancel_unavailable_reason;

  // 1. The job KIND does not support this at all.
  if (!target) {
    return { allowed: false, reason: unavailable ?? `${spec.label} jobs cannot be ${action}ed.`, warning: null };
  }

  // 2. This ROW is in the wrong state for it.
  const legal = action === "retry" ? retryableFrom(spec) : cancellableFrom(spec);
  if (!legal.includes(status)) {
    return {
      allowed: false,
      reason:
        action === "retry"
          ? `Only failed jobs can be retried — this one is '${status}'.`
          : `Only jobs still queued or running can be cancelled — this one is '${status}'.`,
      warning: null,
    };
  }

  // 3. Legal, but say what it costs.
  return {
    allowed: true,
    reason: null,
    warning: action === "retry" ? ops.retry_warning : ops.cancel_warning,
  };
}

export function toJobView(
  spec: RunnerSpec,
  row: JobRow,
  orgNames: Map<string, string>,
  now: number
): JobView {
  const status = String(row.status ?? "unknown");
  const createdAt = str(row, spec.time_column);
  const orgId = typeof row.org_id === "string" ? row.org_id : null;

  const inFlight = spec.in_flight.includes(status);
  const heartbeat = spec.heartbeat_column ? str(row, spec.heartbeat_column) : null;
  // A claimed row with no heartbeat at all is judged on its own age — that is
  // precisely the "claimed and then the runner died before its first beat" case,
  // and treating a missing heartbeat as fresh would hide it.
  const lastBeat = heartbeat ?? createdAt;
  const beatAge = lastBeat ? now - Date.parse(lastBeat) : null;

  const details: Record<string, unknown> = {};
  for (const col of spec.jobs.detail_columns) details[col] = row[col] ?? null;

  return {
    id: String(row.id ?? ""),
    org_id: orgId,
    org_name: orgId ? (orgNames.get(orgId) ?? null) : null,
    status,
    label: str(row, spec.jobs.label_column),
    error: str(row, spec.jobs.error_column),
    created_at: createdAt,
    age_ms: createdAt ? Math.max(0, now - Date.parse(createdAt)) : null,
    open: inFlight || spec.claimable.includes(status),
    stuck: inFlight && beatAge !== null && !Number.isNaN(beatAge) && beatAge > STUCK_AFTER_MS,
    details,
    actions: {
      retry: availability(spec, "retry", status),
      cancel: availability(spec, "cancel", status),
    },
  };
}

export interface JobsSummary {
  total: number;
  queued: number;
  in_flight: number;
  stuck: number;
  failed: number;
  completed: number;
}

export function summarizeJobs(spec: RunnerSpec, views: JobView[]): JobsSummary {
  return {
    total: views.length,
    queued: views.filter((v) => spec.claimable.includes(v.status)).length,
    in_flight: views.filter((v) => spec.in_flight.includes(v.status)).length,
    stuck: views.filter((v) => v.stuck).length,
    failed: views.filter((v) => spec.failed.includes(v.status)).length,
    completed: views.filter((v) => spec.done.includes(v.status)).length,
  };
}

/** A refusal carries the sentence to show the operator; nothing else needs to. */
export type ActionPlan =
  | { ok: false; reason: string }
  | { ok: true; update: Record<string, unknown>; from: string[]; to: string };

/**
 * Build the exact UPDATE for one action, or refuse.
 *
 * `from` is returned so the caller can make the write CONDITIONAL on the row
 * still being in one of those statuses. That is what makes this safe against a
 * runner finishing the job between the operator's page load and their click:
 * the update simply matches no rows, and the route reports that the job moved
 * on — rather than yanking a row out from under a live runner.
 */
export function planAction(spec: RunnerSpec, action: JobAction, currentStatus: string, now: number): ActionPlan {
  const check = availability(spec, action, currentStatus);
  if (!check.allowed) return { ok: false, reason: check.reason ?? `Cannot ${action} this job.` };

  const ops = spec.jobs;
  const to = (action === "retry" ? ops.retry_to : ops.cancel_to) as string;
  const update: Record<string, unknown> = { status: to };

  if (action === "retry") {
    for (const col of ops.retry_clear) update[col] = null;
    // agentcore.runs is reaped past expires_at. A retry that left the original
    // deadline in place would be undone by the run-reaper within five minutes,
    // and would read to the operator as "the retry silently did nothing".
    if (spec.schema === "agentcore" && spec.table === "runs") {
      update.expires_at = new Date(now + 30 * 60_000).toISOString();
    }
  }

  return { ok: true, update, from: action === "retry" ? retryableFrom(spec) : cancellableFrom(spec), to };
}
