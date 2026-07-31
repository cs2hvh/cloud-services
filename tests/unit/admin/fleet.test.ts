import { describe, it, expect } from "vitest";
import {
  CLAIM_TICK_STALE_MS,
  RECENT_HOURS,
  STUCK_AFTER_MS,
  snapshotOf,
  sortByUrgency,
  summarize,
  verdictFor,
  type ProbeResult,
  type QueueSnapshot,
} from "@/lib/admin/fleet";
import { RUNNERS, probeTargetFor } from "@/lib/admin/runner-registry";

// Doc: nextstespsAI/21-admin-platform.md (§4, A4 — Jobs & runners).
//
// On-demand probe of each runner's existing /health, combined with queue state.
// A continuous DB check-in was considered and rejected: Kubernetes already
// probes /health every 30s, so a heartbeat table re-implements the platform's
// own job at the cost of a write every few seconds per pod, forever.

function probe(p: Partial<ProbeResult> & Pick<ProbeResult, "service">): ProbeResult {
  return {
    url: "http://ahura-x-health.ahura.svc.cluster.local:8080/health",
    outcome: "ok",
    latency_ms: 12,
    status_code: 200,
    body: { ok: true, ready: true, last_claim_tick_ms_ago: 1500, last_worker_activity_ms_ago: 30_000 },
    error: null,
    ...p,
  };
}

function queue(p: Partial<QueueSnapshot> & Pick<QueueSnapshot, "service">): QueueSnapshot {
  return {
    queued: 0,
    in_flight: 0,
    stuck: 0,
    completed_recent: 0,
    failed_recent: 0,
    last_job_activity: null,
    ...p,
  };
}

describe("verdictFor — reachable states", () => {
  it("IDLE: responding, claimer ticking, nothing to do — healthy", () => {
    const v = verdictFor("ft-runner", probe({ service: "ft-runner" }), queue({ service: "ft-runner" }));
    expect(v.status).toBe("idle");
    expect(v.reachable).toBe(true);
    expect(v.detail).toContain("no work waiting");
  });

  it("WORKING: jobs in flight", () => {
    const v = verdictFor("dr", probe({ service: "dr" }), queue({ service: "dr", in_flight: 2 }));
    expect(v.status).toBe("working");
  });

  it("BACKED_UP: work queued but nothing picked up", () => {
    const v = verdictFor("dr", probe({ service: "dr" }), queue({ service: "dr", queued: 5 }));
    expect(v.status).toBe("backed_up");
    expect(v.detail).toContain("none picked up");
  });

  it("DEGRADED outranks WORKING — stuck jobs never finish on their own", () => {
    const v = verdictFor("mj", probe({ service: "mj" }), queue({ service: "mj", in_flight: 4, stuck: 3 }));
    expect(v.status).toBe("degraded");
    expect(v.stuck).toBe(3);
  });

  it("surfaces probe telemetry the endpoint already provides", () => {
    const v = verdictFor("ar", probe({ service: "ar", latency_ms: 8 }), queue({ service: "ar" }));
    expect(v.latency_ms).toBe(8);
    expect(v.ready).toBe(true);
    expect(v.claim_tick_ms_ago).toBe(1500);
    expect(v.worker_idle_ms_ago).toBe(30_000);
  });
});

describe("verdictFor — NOT_TICKING, the failure a liveness probe misses", () => {
  it("flags a process that answers HTTP but stopped polling Postgres", () => {
    // k8s livenessProbe would call this healthy and never restart it. The work
    // silently stops moving.
    const v = verdictFor(
      "ft",
      probe({ service: "ft", body: { ok: true, ready: true, last_claim_tick_ms_ago: CLAIM_TICK_STALE_MS + 1000 } }),
      queue({ service: "ft", queued: 4 })
    );
    expect(v.status).toBe("not_ticking");
    expect(v.detail).toContain("claimer last ticked");
  });

  it("outranks stuck jobs — a stalled claimer is the bigger fact", () => {
    const v = verdictFor(
      "ft",
      probe({ service: "ft", body: { ok: true, ready: true, last_claim_tick_ms_ago: 999_999 } }),
      queue({ service: "ft", in_flight: 2, stuck: 2 })
    );
    expect(v.status).toBe("not_ticking");
  });

  it("a fresh tick is not stale", () => {
    const v = verdictFor(
      "ft",
      probe({ service: "ft", body: { ok: true, ready: true, last_claim_tick_ms_ago: CLAIM_TICK_STALE_MS - 1 } }),
      queue({ service: "ft" })
    );
    expect(v.status).toBe("idle");
  });

  it("a null tick (booted, not yet ticked) is not treated as stale", () => {
    const v = verdictFor(
      "ft",
      probe({ service: "ft", body: { ok: true, ready: true, last_claim_tick_ms_ago: null } }),
      queue({ service: "ft" })
    );
    expect(v.status).toBe("idle");
    expect(v.claim_tick_ms_ago).toBeNull();
  });
});

describe("verdictFor — unreachable states", () => {
  it("DOWN: unreachable AND it has job history", () => {
    const v = verdictFor(
      "mj",
      probe({ service: "mj", outcome: "unreachable", body: null, status_code: null, error: "connect ECONNREFUSED" }),
      queue({ service: "mj", in_flight: 3, stuck: 3 })
    );
    expect(v.status).toBe("down");
    expect(v.detail).toContain("ECONNREFUSED");
  });

  it("NOT_DEPLOYED: unreachable and no trace of it ever running", () => {
    // The real state on 2026-07-30 — the `ahura` namespace did not exist. A
    // different action from investigating an outage.
    const v = verdictFor(
      "deploy-runner",
      probe({ service: "deploy-runner", outcome: "unreachable", body: null, error: "getaddrinfo ENOTFOUND" }),
      queue({ service: "deploy-runner" })
    );
    expect(v.status).toBe("not_deployed");
    expect(v.detail).toContain("not deployed");
  });

  it("history from ANY source counts as 'it ran once'", () => {
    for (const q of [
      queue({ service: "s", completed_recent: 1 }),
      queue({ service: "s", failed_recent: 1 }),
      queue({ service: "s", last_job_activity: "2026-06-01T00:00:00Z" }),
    ]) {
      expect(verdictFor("s", probe({ service: "s", outcome: "unreachable", body: null }), q).status).toBe("down");
    }
  });

  it("an unhealthy (non-200) response is not treated as reachable", () => {
    const v = verdictFor(
      "s",
      probe({ service: "s", outcome: "unhealthy", status_code: 503, body: { ok: false, ready: false } }),
      queue({ service: "s", queued: 1 })
    );
    expect(v.status).toBe("down");
    expect(v.reachable).toBe(false);
  });

  it("no probe at all means DERIVED-ONLY, not 'not deployed'", () => {
    // "not_deployed" is a claim that requires having probed and failed. With no
    // probe we simply don't know, and must not assert an outage.
    const v = verdictFor("ghost", undefined, undefined);
    expect(v.status).toBe("unknown");
    expect(v.queued).toBe(0);
  });
});

describe("verdictFor — derived-only mode (probing off)", () => {
  // The live topology: runners deploy to an outbound-only LKE cluster, so
  // /health is unreachable from the app and the page must still be useful.
  const notProbed = (service: string): ProbeResult =>
    probe({ service, outcome: "not_probed", body: null, status_code: null, latency_ms: null });

  it("UNKNOWN when nothing is queued or in flight — says so plainly", () => {
    const v = verdictFor("ft", notProbed("ft"), queue({ service: "ft" }));
    expect(v.status).toBe("unknown");
    expect(v.detail).toContain("without probing");
    expect(v.reachable).toBe(false);
  });

  it("WORKING is inferred from a fresh in-flight heartbeat — real liveness for free", () => {
    // A job in flight whose heartbeat is fresh means a worker claimed it and is
    // still touching it. That IS proof of life, without any probe.
    const v = verdictFor("dr", notProbed("dr"), queue({ service: "dr", in_flight: 2, stuck: 0 }));
    expect(v.status).toBe("working");
    expect(v.detail).toContain("a worker is running");
  });

  it("DEGRADED when in-flight jobs have gone stale", () => {
    const v = verdictFor("mj", notProbed("mj"), queue({ service: "mj", in_flight: 3, stuck: 3 }));
    expect(v.status).toBe("degraded");
  });

  it("all in-flight jobs stuck does NOT count as proof of life", () => {
    // in_flight === stuck means nothing is being touched.
    const v = verdictFor("mj", notProbed("mj"), queue({ service: "mj", in_flight: 3, stuck: 3 }));
    expect(v.status).not.toBe("working");
  });

  it("BACKED_UP when work is queued and nothing has claimed it", () => {
    const v = verdictFor("ev", notProbed("ev"), queue({ service: "ev", queued: 4 }));
    expect(v.status).toBe("backed_up");
    expect(v.detail).toContain("nothing has claimed them");
  });

  it("never claims 'down' or 'not_deployed' without having probed", () => {
    // The whole point: five red rows for an un-probeable fleet would be a lie.
    for (const q of [
      queue({ service: "s" }),
      queue({ service: "s", queued: 3 }),
      queue({ service: "s", in_flight: 1 }),
      queue({ service: "s", completed_recent: 9 }),
    ]) {
      const v = verdictFor("s", notProbed("s"), q);
      expect(["down", "not_deployed", "not_ticking"]).not.toContain(v.status);
    }
  });
});

describe("snapshotOf — reducing a real job table", () => {
  // Verified against the live DB on 2026-07-30: a real data-runner sync moved
  // inference.connectors 'queued' → 'syncing' → 'idle', and the admin endpoint
  // reported backed_up → working → idle off these counts.
  const dataRunner = {
    service: "data-runner",
    claimable: ["queued"],
    in_flight: ["syncing"],
    done: ["idle"],
    failed: ["error"],
    heartbeat_column: "heartbeat_at",
    time_column: "updated_at",
  };
  const NOW = Date.parse("2026-07-30T06:00:00Z");
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  it("counts claimable, in-flight and terminal rows by the runner's own vocabulary", () => {
    const s = snapshotOf(
      dataRunner,
      [
        { status: "queued", updated_at: ago(1000), heartbeat_at: null },
        { status: "syncing", updated_at: ago(2000), heartbeat_at: ago(2000) },
        { status: "idle", updated_at: ago(3000), heartbeat_at: null },
        { status: "error", updated_at: ago(4000), heartbeat_at: null },
      ],
      NOW
    );
    expect(s).toMatchObject({ queued: 1, in_flight: 1, stuck: 0, completed_recent: 1, failed_recent: 1 });
  });

  it("an in-flight row with a stale heartbeat is stuck — the media_jobs case", () => {
    const s = snapshotOf(
      dataRunner,
      [{ status: "syncing", updated_at: ago(STUCK_AFTER_MS + 60_000), heartbeat_at: ago(STUCK_AFTER_MS + 60_000) }],
      NOW
    );
    expect(s.in_flight).toBe(1);
    expect(s.stuck).toBe(1);
  });

  it("a table with NO heartbeat column never reports stuck — deployments", () => {
    // Inventing staleness from created_at would mark every long-running build as
    // dead. Better to under-report than to raise a false alarm.
    const s = snapshotOf(
      { ...dataRunner, service: "deploy-runner", in_flight: ["deploying"], heartbeat_column: null, time_column: "created_at" },
      [{ status: "deploying", created_at: ago(30 * 24 * 3_600_000) }],
      NOW
    );
    expect(s.in_flight).toBe(1);
    expect(s.stuck).toBe(0);
  });

  it("throughput is windowed but last_job_activity is not", () => {
    const s = snapshotOf(
      dataRunner,
      [
        { status: "idle", updated_at: ago(RECENT_HOURS * 3_600_000 + 60_000), heartbeat_at: null },
        { status: "error", updated_at: ago(60_000), heartbeat_at: null },
      ],
      NOW
    );
    expect(s.completed_recent).toBe(0); // outside the 24h window
    expect(s.failed_recent).toBe(1);
    expect(s.last_job_activity).toBe(ago(60_000)); // still the newest row overall
  });

  it("an unrecognised status is counted as nothing rather than guessed at", () => {
    const s = snapshotOf(dataRunner, [{ status: "paused_by_admin", updated_at: ago(1000) }], NOW);
    expect(s).toMatchObject({ queued: 0, in_flight: 0, completed_recent: 0, failed_recent: 0 });
    expect(s.last_job_activity).not.toBeNull(); // it still counts as activity
  });

  it("tolerates null and unparseable timestamps", () => {
    const s = snapshotOf(
      dataRunner,
      [{ status: "syncing", updated_at: null, heartbeat_at: "not-a-date" }, { status: "idle", updated_at: "" }],
      NOW
    );
    expect(s.in_flight).toBe(1);
    expect(s.stuck).toBe(0);
    expect(s.last_job_activity).toBeNull();
  });
});

describe("registry vocabularies must match the SCHEMA, not just live data", () => {
  // Why this exists: the first version of runner-registry.ts was "verified" by
  // checking every status present in the live tables was covered. That passed
  // while being wrong — the live data had no `preparing` finetune and no `active`
  // deployment, so invented statuses went unnoticed and real ones were missing.
  // These lists come from the migrations and are the actual source of truth:
  //   inference.finetune_status   (20260523000001)
  //   inference.deployment_status (20260523000001)
  //   inference.eval_run_status   (20260630000001)
  //   media_jobs / connectors CHECK constraints
  const SCHEMA: Record<string, string[]> = {
    "ft-runner": ["queued", "preparing", "running", "completed", "failed", "cancelled"],
    "deploy-runner": ["building", "deploying", "active", "paused", "failed", "deleted"],
    "eval-runner": ["queued", "running", "completed", "failed", "cancelled"],
    "data-runner": ["idle", "queued", "syncing", "error", "disabled"],
    "media": ["queued", "running", "completed", "failed", "canceled"],
  };

  it("never references a status the schema cannot produce", () => {
    for (const [service, allowed] of Object.entries(SCHEMA)) {
      const spec = RUNNERS.find((r) => r.service === service)!;
      const used = [...spec.claimable, ...spec.in_flight, ...spec.done, ...spec.failed];
      const invented = used.filter((s) => !allowed.includes(s));
      expect(invented, `${service} references non-existent status(es)`).toEqual([]);
    }
  });

  it("classifies every schema status, or leaves it deliberately at rest", () => {
    // Statuses intentionally counted as neither work nor throughput.
    const RESTING: Record<string, string[]> = {
      "data-runner": ["disabled"], // operator-disabled, not waiting
      "deploy-runner": [],
      "ft-runner": [],
      "eval-runner": [],
      media: [],
    };
    for (const [service, allowed] of Object.entries(SCHEMA)) {
      const spec = RUNNERS.find((r) => r.service === service)!;
      const used = new Set([...spec.claimable, ...spec.in_flight, ...spec.done, ...spec.failed]);
      const unclassified = allowed.filter((s) => !used.has(s) && !RESTING[service].includes(s));
      expect(unclassified, `${service} ignores schema status(es)`).toEqual([]);
    }
  });

  it("media uses the one-L 'canceled' its CHECK constraint requires", () => {
    const media = RUNNERS.find((r) => r.service === "media")!;
    expect(media.failed).toContain("canceled");
    expect(media.failed).not.toContain("cancelled");
  });

  it("every other table uses the two-L 'cancelled' from its enum", () => {
    for (const service of ["ft-runner", "eval-runner", "agent-runner"]) {
      const spec = RUNNERS.find((r) => r.service === service)!;
      expect(spec.failed, service).toContain("cancelled");
    }
  });
});

describe("claimable_when — a claimable status is not always waiting", () => {
  const deploy = RUNNERS.find((r) => r.service === "deploy-runner")!;
  const NOW = Date.parse("2026-07-30T12:00:00Z");
  const at = new Date(NOW - 1000).toISOString();

  it("counts a paused deployment WITH an endpoint as queued — it needs tearing down", () => {
    const s = snapshotOf(deploy, [{ status: "paused", created_at: at, runpod_endpoint_id: "ep-1" }], NOW);
    expect(s.queued).toBe(1);
  });

  it("does NOT count a paused deployment with no endpoint — it is resting", () => {
    // The scan skips these, so calling them "backed up" would be a permanent
    // false alarm on the operator's screen.
    const s = snapshotOf(deploy, [{ status: "paused", created_at: at, runpod_endpoint_id: null }], NOW);
    expect(s.queued).toBe(0);
    expect(s.in_flight).toBe(0);
  });

  it("the gate does not affect other claimable statuses", () => {
    const s = snapshotOf(deploy, [{ status: "building", created_at: at, runpod_endpoint_id: null }], NOW);
    expect(s.queued).toBe(1);
  });

  it("'active' counts as a completed deployment — it was missing entirely before", () => {
    const s = snapshotOf(deploy, [{ status: "active", created_at: at, runpod_endpoint_id: "ep-1" }], NOW);
    expect(s.completed_recent).toBe(1);
  });

  it("a 'preparing' finetune counts as in flight, not as nothing", () => {
    const ft = RUNNERS.find((r) => r.service === "ft-runner")!;
    const s = snapshotOf(ft, [{ status: "preparing", created_at: at, last_heartbeat_at: at }], NOW);
    expect(s.in_flight).toBe(1);
    expect(s.queued).toBe(0);
  });

  it("the query fetches whatever columns the gate needs", () => {
    // A gate reading a column the route never selected would silently evaluate
    // against undefined and mis-count every row.
    expect(deploy.extra_columns).toContain("runpod_endpoint_id");
  });
});

describe("probeTargetFor — what may be probed at all", () => {
  const media = RUNNERS.find((r) => r.service === "media")!;
  const dataRunner = RUNNERS.find((r) => r.service === "data-runner")!;

  it("a runner with no /health service yields null, NOT a probe attempt", () => {
    // The bug this exists to prevent: treating "no URL" as unreachable made
    // enabling probing flip media from an accurate 'degraded' to a false 'down'.
    expect(probeTargetFor(media, {})).toBeNull();
  });

  it("null feeds not_probed, which can never be reported as down", () => {
    const p: ProbeResult = { service: "media", url: "", outcome: "not_probed", latency_ms: null, status_code: null, body: null, error: null };
    const v = verdictFor("media", p, queue({ service: "media", in_flight: 3, stuck: 3 }));
    expect(v.status).toBe("degraded");
  });

  it("an env override wins — this is how a local runner gets probed", () => {
    expect(probeTargetFor(dataRunner, { RUNNER_HEALTH_URL_DATA_RUNNER: "http://localhost:8091/health" }))
      .toBe("http://localhost:8091/health");
  });

  it("falls back to the in-cluster Service when no override is set", () => {
    expect(probeTargetFor(dataRunner, {})).toBe(dataRunner.health_url);
  });

  it("every registry entry either has a health URL or is documented as unprobeable", () => {
    const unprobeable = RUNNERS.filter((r) => probeTargetFor(r, {}) === null).map((r) => r.service);
    expect(unprobeable).toEqual(["media"]);
  });
});

describe("summarize", () => {
  it("rolls the fleet up for the header", () => {
    const vs = [
      verdictFor("a", probe({ service: "a" }), queue({ service: "a", in_flight: 1 })), // working
      verdictFor("b", probe({ service: "b" }), queue({ service: "b" })), // idle
      verdictFor("c", probe({ service: "c", outcome: "unreachable", body: null }), queue({ service: "c", queued: 2 })), // down
      verdictFor("d", probe({ service: "d" }), queue({ service: "d", in_flight: 2, stuck: 2 })), // degraded
      verdictFor("e", probe({ service: "e", outcome: "unreachable", body: null }), queue({ service: "e" })), // not_deployed
    ];
    const s = summarize(vs);
    expect(s.services).toBe(5);
    expect(s.healthy).toBe(2);
    expect(s.down).toBe(1);
    expect(s.degraded).toBe(1);
    expect(s.not_deployed).toBe(1);
    expect(s.total_stuck).toBe(2);
    expect(s.total_queued).toBe(2);
  });

  it("counts a stalled claimer as down, not healthy", () => {
    const vs = [
      verdictFor("x", probe({ service: "x", body: { ok: true, ready: true, last_claim_tick_ms_ago: 999_999 } }), queue({ service: "x" })),
    ];
    expect(summarize(vs).down).toBe(1);
    expect(summarize(vs).healthy).toBe(0);
  });
});

describe("sortByUrgency", () => {
  it("puts what needs attention first", () => {
    const vs = [
      verdictFor("idle", probe({ service: "idle" }), queue({ service: "idle" })),
      verdictFor("notdep", probe({ service: "notdep", outcome: "unreachable", body: null }), queue({ service: "notdep" })),
      verdictFor("down", probe({ service: "down", outcome: "unreachable", body: null }), queue({ service: "down", queued: 1 })),
      verdictFor("degraded", probe({ service: "degraded" }), queue({ service: "degraded", in_flight: 1, stuck: 1 })),
      verdictFor("stalled", probe({ service: "stalled", body: { ok: true, ready: true, last_claim_tick_ms_ago: 999_999 } }), queue({ service: "stalled" })),
    ];
    expect(sortByUrgency(vs).map((v) => v.service)).toEqual(["down", "stalled", "degraded", "notdep", "idle"]);
  });
});
