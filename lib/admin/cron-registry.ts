/**
 * The scheduled sweeps the AI platform depends on. Pure — DB-free, UI-free.
 *
 * Every one of these recovers work that would otherwise sit broken forever: a
 * media job whose upstream never called back, a fine-tune whose runner died, a
 * connector that is due to sync, a BYO deployment whose GPU minutes are unbilled.
 * They are fired by the gateway Worker's cron (`workers/inference/src/index.ts`,
 * `[triggers] crons = ["* * * * *"]`) which POSTs each control-plane endpoint.
 *
 * A DECLARATIVE REGISTRY for the same reason feature-health.ts and
 * runner-registry.ts are: the interval, the endpoint and the consequence of a
 * job stopping are three facts that must stay together, and a hand-written check
 * per job drifts the moment someone changes the cron dispatch.
 *
 * THE FAILURE THIS CATCHES: six of these endpoints returned 404 in production for
 * ~2 months after a stale deploy. Nothing reported it, because a sweep that never
 * reaches its handler cannot log a failure — it simply stops existing. So health
 * here is judged on the AGE of the last heartbeat, not on what the last run said.
 * "Never reported in" and "reported an error" are different verdicts.
 */

export type CronVerdict =
  | "ok"         // ran recently and succeeded
  | "failing"    // ran recently and errored
  | "stale"      // has a heartbeat, but far older than its interval
  | "never_run"; // no heartbeat has ever been recorded

export interface CronSpec {
  /** Stable key — must match the string passed to withCronRun() in the route. */
  job: string;
  label: string;
  /** What breaks for customers if this stops. Written for an operator, not a dev. */
  protects: string;
  /** Control-plane endpoint the Worker POSTs. */
  path: string;
  /** How often the Worker's dispatch actually fires it, in minutes. */
  interval_minutes: number;
}

/**
 * Nine jobs, matching the dispatch in `workers/inference/src/index.ts` exactly.
 *
 * `spend-alert` is deliberately absent: it is fired by the usage queue consumer
 * when spend crosses a threshold, not on a schedule, so an age-based check would
 * call it stale every time nobody spent money. The semantic-cache GC is absent
 * for the opposite reason — it runs inside the Worker and never touches the
 * control plane, so it has nothing to heartbeat with.
 */
export const CRON_JOBS: CronSpec[] = [
  {
    job: "serving-pod-watchdog",
    label: "Serving-pod watchdog",
    protects: "Idle hosted-serving pods past their auto-stop time keep billing GPU minutes.",
    path: "/api/inference/internal/serving-pod-watchdog",
    interval_minutes: 1,
  },
  {
    job: "media-job-watchdog",
    label: "Media job watchdog",
    protects: "Video and OCR jobs whose upstream never called back stay 'running' forever and are never billed or refunded.",
    path: "/api/inference/internal/media-job-watchdog",
    interval_minutes: 1,
  },
  {
    job: "finetune-watchdog",
    label: "Fine-tune watchdog",
    protects: "Fine-tunes whose runner died stay 'running', and their GPU pods keep costing money.",
    path: "/api/inference/internal/finetune-watchdog",
    interval_minutes: 5,
  },
  {
    job: "eval-watchdog",
    label: "Eval watchdog",
    protects: "Eval runs orphaned by a dead runner never resolve, so the customer sees no result and no error.",
    path: "/api/inference/internal/eval-watchdog",
    interval_minutes: 5,
  },
  {
    job: "agent-run-reaper",
    label: "Agent run reaper",
    protects: "Agent runs past their deadline stay open and hold their resources.",
    path: "/api/agents/internal/run-reaper",
    interval_minutes: 5,
  },
  {
    job: "agent-session-reaper",
    label: "Agent sandbox reaper",
    protects: "Sandbox sessions leaked by a dead runner keep running — this is the one that leaks real compute.",
    path: "/api/agents/internal/session-reaper",
    interval_minutes: 5,
  },
  {
    job: "connector-scheduler",
    label: "Connector scheduler",
    protects: "Scheduled RAG connectors stop syncing, so customers' data silently goes stale.",
    path: "/api/inference/internal/connector-scheduler",
    interval_minutes: 5,
  },
  {
    job: "ingest-watchdog",
    label: "Ingest watchdog",
    protects: "Connector syncs whose data-runner died stay in flight and block the next sync.",
    path: "/api/inference/internal/ingest-watchdog",
    interval_minutes: 5,
  },
  {
    job: "deployment-meter",
    label: "Deployment meter",
    protects: "BYO deployment GPU uptime goes unmetered — revenue we never bill.",
    path: "/api/inference/internal/deployment-meter",
    interval_minutes: 5,
  },
];

/** One heartbeat row, as stored by lib/inference/cron-heartbeat.ts. */
export interface CronRunRow {
  job: string;
  last_run_at: string | null;
  last_status: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  last_duration_ms: number | null;
  last_result: Record<string, unknown> | null;
  consecutive_failures: number | null;
  runs_total: number | null;
}

export interface CronHealth extends CronSpec {
  verdict: CronVerdict;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  last_duration_ms: number | null;
  last_result: Record<string, unknown> | null;
  consecutive_failures: number;
  runs_total: number;
  /** Minutes since the last heartbeat, or null when there has never been one. */
  age_minutes: number | null;
  /** Age past which this job is considered stale. */
  stale_after_minutes: number;
  /** Plain-language reason, so the UI never has to infer one. */
  detail: string;
}

/**
 * How late a job may be before it is called stale.
 *
 * Four missed firings plus two minutes of slack. Generous on purpose: a sweep
 * that runs every minute must not go amber because one firing was slow, or the
 * page cries wolf and an operator learns to ignore it. Four in a row is not
 * jitter.
 */
export function staleAfterMinutes(spec: CronSpec): number {
  return spec.interval_minutes * 4 + 2;
}

function minutesSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now - t) / 60_000);
}

function human(minutes: number): string {
  if (minutes < 1) return "less than a minute";
  if (minutes < 90) return `${Math.round(minutes)} minute(s)`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} hour(s)`;
  return `${Math.round(minutes / 1440)} day(s)`;
}

/**
 * Judge one job.
 *
 * Precedence is deliberate: NOT RUNNING beats reporting an error. A job that
 * errors is at least still being fired — someone is trying. A job with no recent
 * heartbeat is the silent case, and it is the one that cost us two months.
 */
export function judgeCron(spec: CronSpec, row: CronRunRow | undefined, now: number): CronHealth {
  const staleAfter = staleAfterMinutes(spec);
  const age = minutesSince(row?.last_run_at ?? null, now);
  const failures = row?.consecutive_failures ?? 0;

  let verdict: CronVerdict;
  let detail: string;

  if (!row || age === null) {
    verdict = "never_run";
    detail =
      `No run has ever been recorded. Either the Worker cron is not firing, or ` +
      `${spec.path} is not reachable on this deployment.`;
  } else if (age > staleAfter) {
    verdict = "stale";
    detail =
      `Last ran ${human(age)} ago, but it is scheduled every ${spec.interval_minutes} minute(s). ` +
      `Check that the gateway Worker's cron is deployed and that ${spec.path} exists on the running build.`;
  } else if ((row.last_status ?? "ok") !== "ok") {
    verdict = "failing";
    detail =
      `Ran ${human(age)} ago and failed${failures > 1 ? ` — ${failures} times in a row` : ""}: ` +
      `${row.last_error ?? "no error reported"}`;
  } else {
    verdict = "ok";
    detail = `Ran ${human(age)} ago and succeeded.`;
  }

  return {
    ...spec,
    verdict,
    last_run_at: row?.last_run_at ?? null,
    last_ok_at: row?.last_ok_at ?? null,
    last_error: row?.last_error ?? null,
    last_duration_ms: row?.last_duration_ms ?? null,
    last_result: row?.last_result ?? null,
    consecutive_failures: failures,
    runs_total: row?.runs_total ?? 0,
    age_minutes: age === null ? null : Math.round(age),
    stale_after_minutes: staleAfter,
    detail,
  };
}

export interface CronSummary {
  jobs: number;
  ok: number;
  failing: number;
  stale: number;
  never_run: number;
  /** stale + never_run + failing — the number an operator should act on. */
  needs_attention: number;
}

export function summarizeCron(rows: CronHealth[]): CronSummary {
  const count = (v: CronVerdict) => rows.filter((r) => r.verdict === v).length;
  const ok = count("ok");
  return {
    jobs: rows.length,
    ok,
    failing: count("failing"),
    stale: count("stale"),
    never_run: count("never_run"),
    needs_attention: rows.length - ok,
  };
}

/** Worst first — this table is only ever read to find what is broken. */
export function sortCronByConcern(rows: CronHealth[]): CronHealth[] {
  const rank: Record<CronVerdict, number> = { never_run: 0, stale: 1, failing: 2, ok: 3 };
  return [...rows].sort(
    (a, b) => rank[a.verdict] - rank[b.verdict] || (b.age_minutes ?? Infinity) - (a.age_minutes ?? Infinity)
  );
}
