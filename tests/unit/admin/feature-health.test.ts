import { describe, it, expect } from "vitest";
import {
  CAPABILITIES,
  IDLE_AFTER_DAYS,
  judge,
  shouldMeasureFailures,
  sortByConcern,
  sortByUsage,
  summarize,
  type CapabilityCounts,
  type CapabilitySpec,
} from "@/lib/admin/feature-health";

// The platform overview: "what do customers use, and is anything broken?"
// Verified against the live database 2026-07-30.

const NOW = Date.parse("2026-07-30T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const spec = (p: Partial<CapabilitySpec> = {}): CapabilitySpec => ({
  key: "k",
  label: "Thing",
  purpose: "does a thing",
  schema: "inference",
  table: "things",
  time_column: "created_at",
  org_column: "org_id",
  status_column: "status",
  failure_statuses: ["failed"],
  admin_path: "/dashboard/admin/thing",
  degraded_above_pct: 10,
  ...p,
});

const counts = (p: Partial<CapabilityCounts> = {}): CapabilityCounts => ({
  key: "k",
  total: 100,
  recent: 50,
  failures: 0,
  failure_error: null,
  orgs: 3,
  last_activity: daysAgo(1),
  error: null,
  ...p,
});

describe("registry vs schema — the mistake this file exists to prevent", () => {
  // A previous draft listed 'error' and 'failed' for inference.usage. Neither is in
  // the enum, so Postgres rejected the whole IN() with a 400, the failure count
  // silently became null, and the platform's busiest capability was reported
  // "healthy" while actually failing 11% of requests.
  const SCHEMA: Record<string, string[]> = {
    // inference.usage_status (20260523000001)
    inference: ["success", "error_upstream", "error_rate_limit", "error_budget", "error_auth", "error_validation", "error_internal", "cancelled"],
    // inference.batch_status (20260526000002)
    batches: ["validating", "failed", "in_progress", "finalizing", "completed", "expired", "cancelling", "cancelled"],
    // inference.finetune_status (20260523000001)
    finetunes: ["queued", "preparing", "running", "completed", "failed", "cancelled"],
    // inference.deployment_status (20260523000001)
    deployments: ["building", "deploying", "active", "paused", "failed", "deleted"],
    // inference.eval_run_status (20260630000001)
    evals: ["queued", "running", "completed", "failed", "cancelled"],
    // media_jobs CHECK (20260623000001) — note the ONE-L 'canceled'
    media_jobs: ["queued", "running", "completed", "failed", "canceled"],
    // connectors CHECK (20260721000001)
    connectors: ["idle", "queued", "syncing", "error", "disabled"],
  };

  it("never references a failure status the schema cannot produce", () => {
    for (const [key, allowed] of Object.entries(SCHEMA)) {
      const cap = CAPABILITIES.find((c) => c.key === key);
      expect(cap, `no capability keyed '${key}'`).toBeDefined();
      const invented = cap!.failure_statuses.filter((s) => !allowed.includes(s));
      expect(invented, `${key} references non-existent status(es)`).toEqual([]);
    }
  });

  it("media_jobs uses one-L 'canceled' while the enum-backed tables use two", () => {
    const media = CAPABILITIES.find((c) => c.key === "media_jobs")!;
    expect(media.failure_statuses).toContain("canceled");
    expect(media.failure_statuses).not.toContain("cancelled");
    for (const key of ["finetunes", "evals", "agents", "batches"]) {
      expect(CAPABILITIES.find((c) => c.key === key)!.failure_statuses, key).toContain("cancelled");
    }
  });

  it("inference counts every error the enum defines, so none hides", () => {
    const inf = CAPABILITIES.find((c) => c.key === "inference")!;
    for (const s of ["error_upstream", "error_rate_limit", "error_budget", "error_auth", "error_validation", "error_internal"]) {
      expect(inf.failure_statuses, s).toContain(s);
    }
    // 'success' must never be counted as a failure, and 'cancelled' is a customer
    // action rather than a platform failure.
    expect(inf.failure_statuses).not.toContain("success");
  });

  it("every capability declares a table, a time column and a purpose", () => {
    for (const c of CAPABILITIES) {
      expect(c.table, c.key).toBeTruthy();
      expect(c.time_column, c.key).toBeTruthy();
      expect(c.purpose.length, c.key).toBeGreaterThan(10);
    }
    expect(new Set(CAPABILITIES.map((c) => c.key)).size).toBe(CAPABILITIES.length);
  });

  it("shouldMeasureFailures is false only when there is genuinely no status concept", () => {
    expect(shouldMeasureFailures(spec())).toBe(true);
    expect(shouldMeasureFailures(spec({ status_column: null }))).toBe(false);
    expect(shouldMeasureFailures(spec({ failure_statuses: [] }))).toBe(false);
    // Live: collections, files, prompts, guardrails and byok have no status.
    const without = CAPABILITIES.filter((c) => !shouldMeasureFailures(c)).map((c) => c.key);
    expect(without.sort()).toEqual(["byok", "files", "guardrails", "prompts", "vectors"]);
  });
});

describe("judge — 'not used' is not 'broken'", () => {
  it("a capability with no rows at all is UNUSED, not degraded", () => {
    // Live: BYO deployments and guardrail policies. Painting a never-adopted
    // feature red teaches an operator to ignore the page.
    const h = judge(spec(), counts({ total: 0, recent: 0, failures: 0, orgs: null, last_activity: null }), NOW);
    expect(h.verdict).toBe("unused");
    expect(h.detail).toMatch(/no customer has ever used it/i);
  });

  it("a capability with history but no recent activity is IDLE", () => {
    const h = judge(spec(), counts({ recent: 0, failures: 0, last_activity: daysAgo(60) }), NOW);
    expect(h.verdict).toBe("idle");
    expect(h.idle_days).toBe(60);
    expect(h.detail).toContain("60 day(s) ago");
  });

  it("failing above its own tolerance is DEGRADED", () => {
    // Live: inference at 187/1679 = 11.1% against a 5% tolerance.
    const h = judge(spec({ degraded_above_pct: 5 }), counts({ recent: 1679, failures: 187 }), NOW);
    expect(h.verdict).toBe("degraded");
    expect(h.error_rate_pct).toBeCloseTo(11.14, 1);
    expect(h.detail).toContain("above the 5% tolerance");
  });

  it("failing BELOW its tolerance is healthy, and each capability sets its own", () => {
    // Live: agents at 37/328 = 11.3% against a 20% tolerance — a long-running
    // agent loop failing is more expected than a chat completion failing.
    const h = judge(spec({ degraded_above_pct: 20 }), counts({ recent: 328, failures: 37 }), NOW);
    expect(h.verdict).toBe("healthy");
    expect(h.error_rate_pct).toBeCloseTo(11.3, 1);
  });

  it("an unreadable table is UNKNOWN, never healthy", () => {
    const h = judge(spec(), counts({ error: "permission denied" }), NOW);
    expect(h.verdict).toBe("unknown");
    expect(h.detail).toContain("permission denied");
  });

  it("a BROKEN failure count is unknown — not silently 'no status column'", () => {
    // The exact regression: a rejected IN() must not read as "healthy, failures
    // unmeasurable". We do not know whether it is failing.
    const h = judge(spec(), counts({ failures: null, failure_error: 'invalid input value for enum: "error"' }), NOW);
    expect(h.verdict).toBe("unknown");
    expect(h.detail).toMatch(/could not count failures/i);
  });

  it("a table with NO status concept is still healthy, and says why there is no rate", () => {
    const h = judge(spec({ status_column: null, failure_statuses: [] }), counts({ failures: null }), NOW);
    expect(h.verdict).toBe("healthy");
    expect(h.error_rate_pct).toBeNull();
    expect(h.detail).toMatch(/no status column/i);
  });

  it("reports adoption when it was measured", () => {
    const h = judge(spec(), counts({ orgs: 7 }), NOW);
    expect(h.detail).toContain("7 customer(s)");
  });

  it("degraded takes precedence over idle, but never over unused", () => {
    const busyAndFailing = judge(spec({ degraded_above_pct: 5 }), counts({ recent: 10, failures: 9 }), NOW);
    expect(busyAndFailing.verdict).toBe("degraded");
    const emptyTable = judge(spec({ degraded_above_pct: 5 }), counts({ total: 0, recent: 0, failures: 0 }), NOW);
    expect(emptyTable.verdict).toBe("unused");
  });

  it("idle_days is null when nothing has ever happened", () => {
    expect(judge(spec(), counts({ total: 0, last_activity: null }), NOW).idle_days).toBeNull();
  });

  it("tolerates an unparseable timestamp without throwing", () => {
    expect(judge(spec(), counts({ last_activity: "not-a-date" }), NOW).idle_days).toBeNull();
  });

  it("the idle threshold is a stated constant, not a magic number", () => {
    expect(IDLE_AFTER_DAYS).toBe(30);
  });
});

describe("summarize", () => {
  it("counts verdicts and surfaces what is unmanaged or unmeasurable", () => {
    const rows = [
      judge(spec({ key: "a", admin_path: null }), counts(), NOW),
      judge(spec({ key: "b", status_column: null, failure_statuses: [] }), counts({ failures: null }), NOW),
      judge(spec({ key: "c" }), counts({ total: 0, recent: 0 }), NOW),
    ];
    const s = summarize(rows);
    expect(s.capabilities).toBe(3);
    expect(s.unused).toBe(1);
    expect(s.unmanaged).toBe(1);
    // 'b' has rows but no status, so its failures are unmeasurable.
    expect(s.unmeasurable_failures).toBe(1);
  });

  it("sums activity across capabilities", () => {
    const rows = [
      judge(spec({ key: "a" }), counts({ recent: 100 }), NOW),
      judge(spec({ key: "b" }), counts({ recent: 25 }), NOW),
    ];
    expect(summarize(rows).recent_activity).toBe(125);
  });
});

describe("the two orderings answer the two different questions", () => {
  const rows = [
    judge(spec({ key: "quiet" }), counts({ key: "quiet", recent: 1, failures: 0 }), NOW),
    judge(spec({ key: "busy" }), counts({ key: "busy", recent: 900, failures: 0 }), NOW),
    judge(spec({ key: "broken", degraded_above_pct: 5 }), counts({ key: "broken", recent: 10, failures: 9 }), NOW),
  ];

  it("sortByUsage answers 'what do customers use most'", () => {
    expect(sortByUsage(rows).map((r) => r.key)).toEqual(["busy", "broken", "quiet"]);
  });

  it("sortByConcern answers 'what is broken' — and unused sinks to the bottom", () => {
    const withUnused = [...rows, judge(spec({ key: "never" }), counts({ key: "never", total: 0, recent: 0 }), NOW)];
    const order = sortByConcern(withUnused).map((r) => r.key);
    expect(order[0]).toBe("broken");
    expect(order[order.length - 1]).toBe("never");
  });
});
