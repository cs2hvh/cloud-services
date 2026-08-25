import { describe, it, expect } from "vitest";
import {
  cancellableFrom,
  planAction,
  retryableFrom,
  STUCK_AFTER_MS,
  summarizeJobs,
  toJobView,
  type JobRow,
} from "@/lib/admin/jobs-ops";
import { RUNNERS, findRunner } from "@/lib/admin/runner-registry";

// Doc 21 §4 (A4) promised retry / cancel; §8.11 recorded that neither was built,
// so recovering 17 failed fine-tunes and 3 media jobs stuck for 31 days meant
// hand-written SQL.

const NOW = Date.parse("2026-08-04T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const ORGS = new Map([["org-1", "Acme"]]);

describe("registry vs the migrations — the mistake this file exists to prevent", () => {
  // Every status a plan writes must be one Postgres will accept. `media_jobs`
  // spells it 'canceled' with ONE L while every other table uses two; writing
  // the wrong one does not error, it matches no rows.
  const ALLOWED: Record<string, string[]> = {
    // inference.finetune_status (20260523000001)
    "ft-runner": ["queued", "preparing", "running", "completed", "failed", "cancelled"],
    // connectors CHECK (20260721000001)
    "data-runner": ["idle", "queued", "syncing", "error", "disabled"],
    // inference.eval_run_status (20260630000001)
    "eval-runner": ["queued", "running", "completed", "failed", "cancelled"],
    // inference.deployment_status (20260523000001) — note: no 'cancelled', no 'queued'
    "deploy-runner": ["building", "deploying", "active", "paused", "failed", "deleted"],
    // agentcore.run_status (20260701000001)
    "agent-runner": ["queued", "running", "requires_action", "completed", "failed", "cancelled", "expired"],
    // media_jobs CHECK (20260623000001) — ONE-L 'canceled'
    media: ["queued", "running", "completed", "failed", "canceled"],
  };

  it("never writes a status the schema cannot store", () => {
    for (const spec of RUNNERS) {
      const allowed = ALLOWED[spec.service];
      expect(allowed, `no schema list for '${spec.service}'`).toBeDefined();
      for (const target of [spec.jobs.retry_to, spec.jobs.cancel_to]) {
        if (target === null) continue;
        expect(allowed, `${spec.service} → ${target}`).toContain(target);
      }
    }
  });

  it("deployments retry to 'building', because deployment_status has no 'queued'", () => {
    expect(findRunner("deploy-runner")!.jobs.retry_to).toBe("building");
  });

  it("media cancels to the one-L 'canceled' while the enum tables use two", () => {
    expect(findRunner("media")!.jobs.cancel_to).toBe("canceled");
    for (const s of ["ft-runner", "eval-runner", "agent-runner"]) {
      expect(findRunner(s)!.jobs.cancel_to, s).toBe("cancelled");
    }
  });

  it("states a reason wherever an action is unavailable, and none where it is", () => {
    for (const spec of RUNNERS) {
      if (spec.jobs.retry_to === null) expect(spec.jobs.retry_unavailable_reason, spec.service).toBeTruthy();
      else expect(spec.jobs.retry_unavailable_reason, spec.service).toBeNull();
      if (spec.jobs.cancel_to === null) expect(spec.jobs.cancel_unavailable_reason, spec.service).toBeTruthy();
      else expect(spec.jobs.cancel_unavailable_reason, spec.service).toBeNull();
    }
  });

  it("warns about cost on every retry that re-bills a customer", () => {
    for (const spec of RUNNERS) {
      if (spec.jobs.retry_to === null) continue;
      expect(spec.jobs.retry_warning, spec.service).toBeTruthy();
    }
  });
});

describe("media has no retry, and says so", () => {
  // Nothing claims `media_jobs` — the gateway settles them inline. A retry that
  // only flipped the row to 'queued' would report success and strand the job
  // forever, which is strictly worse than no button.
  const media = findRunner("media")!;

  it("refuses retry with an explanation, not a silent no-op", () => {
    const plan = planAction(media, "retry", "failed", NOW);
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toContain("/v1/videos/{id}/retry");
      expect(plan.reason).toContain("inline");
    }
  });

  it("still allows cancel, which is what unsticks a 31-day-old job", () => {
    const plan = planAction(media, "cancel", "running", NOW);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.update.status).toBe("canceled");
      expect(plan.from).toEqual(["queued", "running"]);
    }
  });

  it("retryableFrom is empty when the kind has no retry at all", () => {
    expect(retryableFrom(media)).toEqual([]);
    expect(cancellableFrom(media)).toEqual(["queued", "running"]);
  });
});

describe("planAction", () => {
  const ft = findRunner("ft-runner")!;

  it("retries only from a failure status — never re-runs completed paid work", () => {
    expect(planAction(ft, "retry", "completed", NOW).ok).toBe(false);
    expect(planAction(ft, "retry", "running", NOW).ok).toBe(false);
    expect(planAction(ft, "retry", "failed", NOW).ok).toBe(true);
    expect(planAction(ft, "retry", "cancelled", NOW).ok).toBe(true);
  });

  it("cancels only what is still open", () => {
    expect(planAction(ft, "cancel", "completed", NOW).ok).toBe(false);
    expect(planAction(ft, "cancel", "running", NOW).ok).toBe(true);
    expect(planAction(ft, "cancel", "preparing", NOW).ok).toBe(true);
  });

  it("clears the claim and error columns so the row is claimable again", () => {
    const plan = planAction(ft, "retry", "failed", NOW);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.update).toMatchObject({ status: "queued", error_message: null, runpod_job_id: null });
    }
  });

  it("returns the statuses to make the write conditional on", () => {
    // This is what stops an admin yanking a job a runner picked up between the
    // page load and the click.
    const plan = planAction(ft, "cancel", "running", NOW);
    if (plan.ok) expect(plan.from).toEqual(["queued", "preparing", "running"]);
  });

  it("pushes an agent run's expires_at forward, or the reaper would undo the retry", () => {
    const agents = findRunner("agent-runner")!;
    const plan = planAction(agents, "retry", "failed", NOW);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(Date.parse(String(plan.update.expires_at))).toBeGreaterThan(NOW);
      expect(plan.update.claimed_by).toBeNull();
    }
  });

  it("does NOT touch expires_at for job kinds that have no such column", () => {
    const plan = planAction(ft, "retry", "failed", NOW);
    if (plan.ok) expect(plan.update).not.toHaveProperty("expires_at");
  });

  it("refuses an unavailable action with the KIND's reason, not a state message", () => {
    const plan = planAction(findRunner("media")!, "retry", "queued", NOW);
    expect(plan.ok).toBe(false);
    // Kind-level refusal takes precedence: telling an operator "only failed jobs
    // can be retried" would imply retry works once the job fails. It never does.
    if (!plan.ok) expect(plan.reason).not.toContain("Only failed jobs");
  });
});

describe("toJobView", () => {
  const media = findRunner("media")!;
  const jobRow = (p: Partial<JobRow> = {}): JobRow => ({
    id: "job-1",
    org_id: "org-1",
    status: "running",
    created_at: minutesAgo(60),
    heartbeat_at: minutesAgo(1),
    model_id: "ahura/video-gen",
    error_code: null,
    modality: "video",
    ...p,
  });

  it("resolves the customer name so the table is not a wall of UUIDs", () => {
    expect(toJobView(media, jobRow(), ORGS, NOW).org_name).toBe("Acme");
    expect(toJobView(media, jobRow({ org_id: "other" }), ORGS, NOW).org_name).toBeNull();
  });

  it("a fresh heartbeat is not stuck", () => {
    expect(toJobView(media, jobRow(), ORGS, NOW).stuck).toBe(false);
  });

  it("in flight with a stale heartbeat is stuck", () => {
    const v = toJobView(media, jobRow({ heartbeat_at: minutesAgo(STUCK_AFTER_MS / 60_000 + 5) }), ORGS, NOW);
    expect(v.stuck).toBe(true);
    expect(v.open).toBe(true);
  });

  it("claimed with NO heartbeat at all is judged on its own age", () => {
    // The runner died before its first beat. Treating a null heartbeat as fresh
    // would hide exactly this case.
    const v = toJobView(media, jobRow({ heartbeat_at: null, created_at: minutesAgo(60 * 24 * 31) }), ORGS, NOW);
    expect(v.stuck).toBe(true);
  });

  it("a terminal row is never stuck, however old", () => {
    const v = toJobView(media, jobRow({ status: "failed", created_at: minutesAgo(99999), heartbeat_at: null }), ORGS, NOW);
    expect(v.stuck).toBe(false);
    expect(v.open).toBe(false);
  });

  it("carries the per-kind action availability onto every row", () => {
    const v = toJobView(media, jobRow({ status: "failed" }), ORGS, NOW);
    expect(v.actions.retry.allowed).toBe(false);
    expect(v.actions.retry.reason).toBeTruthy();
    expect(v.actions.cancel.allowed).toBe(false); // failed is not open
  });

  it("passes an allowed action's warning through for the confirmation dialog", () => {
    const ft = findRunner("ft-runner")!;
    const v = toJobView(ft, { id: "f", org_id: "org-1", status: "failed", created_at: minutesAgo(10) }, ORGS, NOW);
    expect(v.actions.retry.allowed).toBe(true);
    expect(v.actions.retry.warning).toContain("charged");
  });
});

describe("summarizeJobs", () => {
  const media = findRunner("media")!;
  const rows: JobRow[] = [
    { id: "1", org_id: "org-1", status: "queued", created_at: minutesAgo(5) },
    { id: "2", org_id: "org-1", status: "running", created_at: minutesAgo(5), heartbeat_at: minutesAgo(1) },
    { id: "3", org_id: "org-1", status: "running", created_at: minutesAgo(99999), heartbeat_at: null },
    { id: "4", org_id: "org-1", status: "failed", created_at: minutesAgo(5) },
    { id: "5", org_id: "org-1", status: "canceled", created_at: minutesAgo(5) },
    { id: "6", org_id: "org-1", status: "completed", created_at: minutesAgo(5) },
  ];

  it("counts by the kind's own vocabulary, one-L 'canceled' included", () => {
    const views = rows.map((r) => toJobView(media, r, ORGS, NOW));
    expect(summarizeJobs(media, views)).toEqual({
      total: 6,
      queued: 1,
      in_flight: 2,
      stuck: 1,
      failed: 2, // 'failed' + one-L 'canceled'
      completed: 1,
    });
  });
});

describe("state filter — the bug live testing caught", () => {
  // `state=all` maps to null MEANING "do not filter". The route wrote
  // `statusesFor[state] ?? statusesFor.open`, and `??` treats that deliberate
  // null exactly like an unknown key — so "all" silently became "open" and the
  // media page reported 0 rows against a table holding 33.
  //
  // This asserts the lookup shape the route must use. Whether a key EXISTS and
  // what its value IS are different questions.
  const statusesFor: Record<string, string[] | null> = {
    open: ["queued", "running"],
    failed: ["failed", "canceled"],
    completed: ["completed"],
    all: null,
  };
  const resolve = (state: string) => (state in statusesFor ? statusesFor[state] : statusesFor.open);

  it("'all' resolves to no filter, not to 'open'", () => {
    expect(resolve("all")).toBeNull();
  });

  it("an unknown state still falls back to 'open' — the safe default", () => {
    expect(resolve("bogus")).toEqual(["queued", "running"]);
    expect(resolve("")).toEqual(["queued", "running"]);
  });

  it("the ?? form this replaced would have been wrong", () => {
    expect(statusesFor["all"] ?? statusesFor.open).toEqual(["queued", "running"]); // the bug
    expect(resolve("all")).toBeNull();                                            // the fix
  });
});

describe("detail columns must not show a value nothing writes", () => {
  // Verified against the live database 2026-08-06:
  //   media_jobs      20 completed,   0 with cost_cents > 0   ← never written
  //   finetunes        7 completed,   6 with cost_cents > 0   ← written
  //   agentcore.runs 292 completed, 315 with cost_cents > 0   ← written
  //
  // Media bills through inference.usage, not the job row, so the column put a
  // permanent "0" in front of an operator asking what a video cost.
  it("media does NOT offer cost_cents, because media_jobs never records it", () => {
    expect(findRunner("media")!.jobs.detail_columns).not.toContain("cost_cents");
  });

  it("media still shows the billable QUANTITY, which the row does record", () => {
    const cols = findRunner("media")!.jobs.detail_columns;
    expect(cols).toContain("num_units");
    expect(cols).toContain("unit_label");
  });

  it("the kinds that DO record cost keep showing it", () => {
    expect(findRunner("ft-runner")!.jobs.detail_columns).toContain("cost_cents");
    expect(findRunner("agent-runner")!.jobs.detail_columns).toContain("cost_cents");
  });
});
