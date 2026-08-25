import { describe, it, expect } from "vitest";
import {
  CRON_JOBS,
  judgeCron,
  sortCronByConcern,
  staleAfterMinutes,
  summarizeCron,
  type CronRunRow,
  type CronSpec,
} from "@/lib/admin/cron-registry";

// "Are the sweeps that recover stuck work still running?" — the question nothing
// in the admin could answer, while six of these endpoints 404'd in production
// for two months and the AI Overview reported the platform healthy.

const NOW = Date.parse("2026-08-04T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const spec = (p: Partial<CronSpec> = {}): CronSpec => ({
  job: "j",
  label: "Job",
  protects: "something",
  path: "/api/x",
  interval_minutes: 5,
  ...p,
});

const row = (p: Partial<CronRunRow> = {}): CronRunRow => ({
  job: "j",
  last_run_at: minutesAgo(1),
  last_status: "ok",
  last_ok_at: minutesAgo(1),
  last_error: null,
  last_duration_ms: 120,
  last_result: { scanned: 3, reaped: 1 },
  consecutive_failures: 0,
  runs_total: 900,
  ...p,
});

describe("registry vs the Worker's cron dispatch", () => {
  // These nine strings are the contract between workers/inference/src/index.ts's
  // scheduled() dispatch and the control-plane routes. A typo means a job that
  // heartbeats under one name and is judged under another — permanently "never
  // ran" while working perfectly.
  const DISPATCHED = [
    ["serving-pod-watchdog", "/api/inference/internal/serving-pod-watchdog", 1],
    ["media-job-watchdog", "/api/inference/internal/media-job-watchdog", 1],
    ["finetune-watchdog", "/api/inference/internal/finetune-watchdog", 5],
    ["eval-watchdog", "/api/inference/internal/eval-watchdog", 5],
    ["agent-run-reaper", "/api/agents/internal/run-reaper", 5],
    ["agent-session-reaper", "/api/agents/internal/session-reaper", 5],
    ["connector-scheduler", "/api/inference/internal/connector-scheduler", 5],
    ["ingest-watchdog", "/api/inference/internal/ingest-watchdog", 5],
    ["deployment-meter", "/api/inference/internal/deployment-meter", 5],
  ] as const;

  it("covers every dispatched sweep, with the interval it is actually fired at", () => {
    for (const [job, path, interval] of DISPATCHED) {
      const found = CRON_JOBS.find((c) => c.job === job);
      expect(found, `no registry entry for '${job}'`).toBeDefined();
      expect(found!.path, job).toBe(path);
      expect(found!.interval_minutes, job).toBe(interval);
    }
    expect(CRON_JOBS).toHaveLength(DISPATCHED.length);
  });

  it("gives every job a consequence written for an operator", () => {
    for (const c of CRON_JOBS) {
      expect(c.protects.length, c.job).toBeGreaterThan(20);
      expect(c.label, c.job).toBeTruthy();
    }
  });

  it("has no duplicate job keys — a collision would silently share a heartbeat row", () => {
    expect(new Set(CRON_JOBS.map((c) => c.job)).size).toBe(CRON_JOBS.length);
  });
});

describe("staleness threshold", () => {
  it("allows four missed firings plus slack, so jitter never cries wolf", () => {
    expect(staleAfterMinutes(spec({ interval_minutes: 1 }))).toBe(6);
    expect(staleAfterMinutes(spec({ interval_minutes: 5 }))).toBe(22);
  });

  it("a one-minute job that ran 5 minutes ago is still healthy", () => {
    const h = judgeCron(spec({ interval_minutes: 1 }), row({ last_run_at: minutesAgo(5) }), NOW);
    expect(h.verdict).toBe("ok");
  });
});

describe("judgeCron", () => {
  it("no heartbeat at all is 'never_run' and names the endpoint to check", () => {
    const h = judgeCron(spec({ path: "/api/inference/internal/eval-watchdog" }), undefined, NOW);
    expect(h.verdict).toBe("never_run");
    expect(h.detail).toContain("/api/inference/internal/eval-watchdog");
    expect(h.age_minutes).toBeNull();
  });

  it("an old heartbeat is 'stale' — the 404-for-two-months case", () => {
    const h = judgeCron(spec({ interval_minutes: 5 }), row({ last_run_at: minutesAgo(60 * 24 * 30) }), NOW);
    expect(h.verdict).toBe("stale");
    expect(h.detail).toContain("day(s) ago");
  });

  it("NOT RUNNING outranks reporting an error", () => {
    // A job that errors is still being fired — someone is trying. A job with no
    // recent heartbeat is the silent case, and it is the expensive one.
    const h = judgeCron(
      spec({ interval_minutes: 1 }),
      row({ last_run_at: minutesAgo(500), last_status: "error", last_error: "boom" }),
      NOW
    );
    expect(h.verdict).toBe("stale");
  });

  it("a recent failure is 'failing' and carries the error text", () => {
    const h = judgeCron(spec(), row({ last_status: "error", last_error: "HTTP 401", consecutive_failures: 12 }), NOW);
    expect(h.verdict).toBe("failing");
    expect(h.detail).toContain("HTTP 401");
    expect(h.detail).toContain("12 times in a row");
  });

  it("keeps last_ok_at through a run of failures, so 'when did it last work' survives", () => {
    const h = judgeCron(spec(), row({ last_status: "error", last_ok_at: minutesAgo(300) }), NOW);
    expect(h.last_ok_at).toBe(minutesAgo(300));
  });

  it("a fresh success is 'ok' and passes the sweep's own counts through", () => {
    const h = judgeCron(spec(), row(), NOW);
    expect(h.verdict).toBe("ok");
    expect(h.last_result).toEqual({ scanned: 3, reaped: 1 });
  });
});

describe("summary and ordering", () => {
  const rows = [
    judgeCron(spec({ job: "a" }), row(), NOW),
    judgeCron(spec({ job: "b" }), row({ last_status: "error" }), NOW),
    judgeCron(spec({ job: "c" }), row({ last_run_at: minutesAgo(9999) }), NOW),
    judgeCron(spec({ job: "d" }), undefined, NOW),
  ];

  it("counts what an operator must act on", () => {
    const s = summarizeCron(rows);
    expect(s).toMatchObject({ jobs: 4, ok: 1, failing: 1, stale: 1, never_run: 1, needs_attention: 3 });
  });

  it("puts silence first, then staleness, then errors, then healthy", () => {
    expect(sortCronByConcern(rows).map((r) => r.verdict)).toEqual(["never_run", "stale", "failing", "ok"]);
  });
});
