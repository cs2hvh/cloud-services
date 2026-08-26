/**
 * Usage metering tests.
 *
 *   node --test lib/paas/telemetry/usage.test.ts
 *
 * This is billing input, so the tests are about not over-billing. Every case
 * where the meter cannot know something, it must drop time rather than guess:
 * an invoice built on a guess is indistinguishable from one built on a
 * measurement, right up until a customer checks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALWAYS_WARM_THRESHOLD,
  MAX_ATTRIBUTION_SECONDS,
  accumulate,
  buildUsage,
  deploymentRefFromPod,
  observeNamespace,
  warmFraction,
  type AppObservation,
  type PodLike,
  type UsageBucket,
} from "./usage.ts";

const T0 = new Date("2026-08-26T12:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

function app(pods: Array<{ startedAt?: string | null; restarts?: number }>): AppObservation {
  return {
    appKey: "dpl9f6d095cc9",
    projectRef: "prj-node-js-getting-started",
    deploymentRef: "dpl9f6d095cc9",
    namespace: "app-prj-node-js-getting-started",
    pods: pods.map((p, i) => ({
      podName: `dpl9f6d095cc9-b8bd48788-x${i}`,
      startedAt: p.startedAt === undefined ? T0.toISOString() : p.startedAt,
      restarts: p.restarts ?? 0,
    })),
  };
}

const one = (m: Map<string, UsageBucket>) => {
  assert.equal(m.size, 1);
  return [...m.values()][0];
};

// ── never bill unobserved time ──────────────────────────────────────────────

test("the first sample of a period attributes zero, however long the pod has been up", () => {
  const b = one(
    accumulate(new Map(), [app([{ startedAt: "2020-01-01T00:00:00Z" }])], {
      now: T0,
      previousAt: null,
    }),
  );

  assert.equal(b.podSeconds, 0, "a pod up for six years must not bill six years on first sight");
  assert.equal(b.warmSeconds, 0);
  assert.equal(b.samples, 1);
});

test("a pod running across a whole interval accrues that interval", () => {
  let m = accumulate(new Map(), [app([{}])], { now: T0, previousAt: null });
  m = accumulate(m, [app([{}])], { now: at(60), previousAt: T0 });

  const b = one(m);
  assert.equal(b.podSeconds, 60);
  assert.equal(b.warmSeconds, 60);
});

test("a pod that started mid-interval bills only from when it started", () => {
  // Interval is 60s, but the pod started 20s ago.
  const m = accumulate(new Map(), [app([{ startedAt: at(40).toISOString() }])], {
    now: at(60),
    previousAt: T0,
  });

  assert.equal(one(m).podSeconds, 20);
});

test("a restart moves startedAt forward, so time spent dead is not billed", () => {
  // The container crashed and restarted 5s before this sample; the other 55s
  // of the interval it was not running.
  const m = accumulate(new Map(), [app([{ startedAt: at(55).toISOString(), restarts: 3 }])], {
    now: at(60),
    previousAt: T0,
  });

  const b = one(m);
  assert.equal(b.podSeconds, 5);
  assert.equal(b.restarts, 3);
});

test("clock skew producing a negative interval attributes zero, not negative seconds", () => {
  const m = accumulate(new Map(), [app([{}])], { now: T0, previousAt: at(600) });
  assert.equal(one(m).podSeconds, 0);
});

test("an unparseable startedAt falls back to the interval rather than poisoning the total", () => {
  const m = accumulate(new Map(), [app([{ startedAt: "not-a-date" }])], {
    now: at(60),
    previousAt: T0,
  });

  const b = one(m);
  assert.equal(Number.isFinite(b.podSeconds), true);
  assert.equal(b.podSeconds, 60);
});

// ── pod-seconds and warm-seconds are different questions ────────────────────

test("three replicas cost three times as much but are warm exactly once", () => {
  const m = accumulate(new Map(), [app([{}, {}, {}])], { now: at(60), previousAt: T0 });

  const b = one(m);
  assert.equal(b.podSeconds, 180, "resource cost scales with replicas");
  assert.equal(b.warmSeconds, 60, "warmth does not");
  assert.equal(b.peakPods, 3);
});

test("an app with no running pods accrues nothing and is not warm", () => {
  const m = accumulate(new Map(), [{ ...app([]), pods: [] }], { now: at(60), previousAt: T0 });
  const b = one(m);
  assert.equal(b.podSeconds, 0);
  assert.equal(b.warmSeconds, 0);
  assert.equal(b.peakPods, 0);
});

// ── sampler outages under-bill, and say so ──────────────────────────────────

test("an interval longer than the attribution cap is capped, and the rest recorded as unobserved", () => {
  const gapSeconds = 3600; // sampler was down an hour
  const m = accumulate(new Map(), [app([{ startedAt: "2026-08-26T00:00:00Z" }])], {
    now: at(gapSeconds),
    previousAt: T0,
  });

  const b = one(m);
  assert.equal(b.podSeconds, MAX_ATTRIBUTION_SECONDS, "attribute what is defensible, not the whole gap");
  assert.equal(b.unobservedSeconds, gapSeconds - MAX_ATTRIBUTION_SECONDS);
  assert.ok(b.podSeconds < gapSeconds, "a sampler outage must under-bill, never over-bill");
});

test("warm fraction divides by observed time, not by the nominal period", () => {
  // Half the hour was unobserved; the app was warm for all of the half we saw.
  const bucket: UsageBucket = {
    appKey: "a",
    projectRef: "p",
    namespace: "n",
    podSeconds: 1800,
    warmSeconds: 1800,
    peakPods: 1,
    restarts: 0,
    samples: 30,
    firstSeen: T0.toISOString(),
    lastSeen: at(3600).toISOString(),
    unobservedSeconds: 1800,
  };

  const w = warmFraction(bucket, 3600);
  assert.equal(w.fraction, 1, "dividing by 3600 would report 0.5 and flatter the cost model");
  assert.equal(w.degraded, true, "but the figure is not safe to bill from, and says so");
});

// ── the number the business case rests on ───────────────────────────────────

function bucketWith(warmSeconds: number, unobserved = 0): UsageBucket {
  return {
    appKey: "dpl9f6d095cc9",
    projectRef: "prj-x",
    namespace: "n",
    podSeconds: warmSeconds,
    warmSeconds,
    peakPods: 1,
    restarts: 0,
    samples: 100,
    firstSeen: T0.toISOString(),
    lastSeen: at(86400).toISOString(),
    unobservedSeconds: unobserved,
  };
}

test("an app warm all day is flagged always-warm — the case that breaks the economics", () => {
  const w = warmFraction(bucketWith(86_400), 86_400);
  assert.equal(w.fraction, 1);
  assert.equal(w.alwaysWarm, true);
  assert.equal(w.degraded, false);
});

test("an app warm 2% of the day is the model the plan is priced on", () => {
  const w = warmFraction(bucketWith(1_728), 86_400);
  assert.ok(Math.abs(w.fraction - 0.02) < 1e-9);
  assert.equal(w.alwaysWarm, false);
});

test("the always-warm threshold is a boundary, not an approximation", () => {
  assert.equal(warmFraction(bucketWith(86_400 * ALWAYS_WARM_THRESHOLD), 86_400).alwaysWarm, true);
  assert.equal(warmFraction(bucketWith(86_400 * 0.94), 86_400).alwaysWarm, false);
});

test("fraction never exceeds 1 even if attribution overshoots", () => {
  assert.equal(warmFraction(bucketWith(999_999), 86_400).fraction, 1);
});

test("a zero-length period does not divide by zero", () => {
  const w = warmFraction(bucketWith(0), 0);
  assert.equal(Number.isFinite(w.fraction), true);
  assert.equal(w.fraction, 0);
});

// ── build minutes are exact, not sampled ────────────────────────────────────

const PERIOD_START = new Date("2026-08-26T00:00:00Z");
const PERIOD_END = new Date("2026-08-27T00:00:00Z");

test("build time comes from recorded timestamps, so it is exact", () => {
  const u = buildUsage(
    [
      {
        ref: "bvm_1",
        deployment_id: "d1",
        created_at: "2026-08-26T10:00:00Z",
        destroyed_at: "2026-08-26T10:04:30Z",
        instance_type: "g6-standard-2",
      },
      {
        ref: "bvm_2",
        deployment_id: "d2",
        created_at: "2026-08-26T11:00:00Z",
        destroyed_at: "2026-08-26T11:02:00Z",
        instance_type: "g6-standard-2",
      },
    ],
    PERIOD_START,
    PERIOD_END,
  );

  assert.equal(u.builds, 2);
  assert.equal(u.buildSeconds, 270 + 120);
  assert.equal(u.longestSeconds, 270);
  assert.equal(u.overdue, 0);
  assert.equal(u.inFlight, 0);
});

test("a VM with no destroyed_at bills nothing, because an open interval is unbounded", () => {
  const u = buildUsage(
    [
      {
        ref: "bvm_leaked",
        deployment_id: null,
        created_at: "2026-08-26T10:00:00Z",
        destroyed_at: null,
        instance_type: "g6-standard-2",
        expires_at: "2026-08-26T11:00:00Z",
      },
    ],
    PERIOD_START,
    PERIOD_END,
    new Date("2026-08-26T18:00:00Z"), // long past the deadline
  );

  assert.equal(u.builds, 1);
  assert.equal(u.buildSeconds, 0, "a leaked VM must not become an unbounded invoice");
  assert.equal(u.overdue, 1);
});

test("a build RUNNING inside its deadline is in flight, not a leak", () => {
  // Both look identical in the row — destroyed_at is null either way. Only
  // expires_at separates them, and calling this a leak fires a critical alert
  // every time anyone deploys, which is how an alert gets muted.
  const u = buildUsage(
    [
      {
        ref: "bvm_running",
        deployment_id: "d1",
        created_at: "2026-08-26T10:00:00Z",
        destroyed_at: null,
        instance_type: "g6-standard-2",
        expires_at: "2026-08-26T11:00:00Z",
      },
    ],
    PERIOD_START,
    PERIOD_END,
    new Date("2026-08-26T10:03:00Z"), // three minutes in
  );

  assert.equal(u.inFlight, 1);
  assert.equal(u.overdue, 0, "a build in progress is not a leak");
  assert.equal(u.buildSeconds, 0, "and still bills nothing until it ends");
});

test("a VM with no expires_at at all is treated as in flight, not accused", () => {
  const u = buildUsage(
    [
      {
        ref: "bvm_no_deadline",
        deployment_id: null,
        created_at: "2026-08-26T10:00:00Z",
        destroyed_at: null,
        instance_type: "g6-standard-2",
      },
    ],
    PERIOD_START,
    PERIOD_END,
    new Date("2026-08-26T18:00:00Z"),
  );

  assert.equal(u.overdue, 0, "no deadline is not evidence of a missed one");
  assert.equal(u.inFlight, 1);
});

test("builds outside the period are excluded", () => {
  const u = buildUsage(
    [
      {
        ref: "bvm_old",
        deployment_id: null,
        created_at: "2026-08-25T10:00:00Z",
        destroyed_at: "2026-08-25T10:05:00Z",
        instance_type: "g6-standard-2",
      },
    ],
    PERIOD_START,
    PERIOD_END,
  );
  assert.equal(u.builds, 0);
  assert.equal(u.buildSeconds, 0);
});

// ── turning cluster state into observations ─────────────────────────────────

function k8sPod(name: string, phase: string, startedAt?: string, labels?: Record<string, string>): PodLike {
  return {
    metadata: { name, namespace: "app-prj-x", labels },
    status: {
      phase,
      containerStatuses: [{ restartCount: 0, state: startedAt ? { running: { startedAt } } : {} }],
    },
  };
}

test("only Running pods are observed — Succeeded publisher jobs must not accrue forever", () => {
  const obs = observeNamespace(
    "app-prj-x",
    "prj-x",
    [
      k8sPod("dpl9f6d095cc9-b8bd48788-aaaaa", "Running", T0.toISOString()),
      k8sPod("pub-dpl-7c8907b1fb76-w8rrm", "Succeeded"),
      k8sPod("dpl0cf35118e9-77f5c8f77b-bbbbb", "Pending"),
    ],
    deploymentRefFromPod,
  );

  assert.equal(obs.length, 1);
  assert.equal(obs[0].deploymentRef, "dpl9f6d095cc9");
  assert.equal(obs[0].pods.length, 1);
});

test("replicas of one deployment group into a single observation", () => {
  const obs = observeNamespace(
    "app-prj-x",
    "prj-x",
    [
      k8sPod("dpl9f6d095cc9-b8bd48788-aaaaa", "Running", T0.toISOString()),
      k8sPod("dpl9f6d095cc9-b8bd48788-bbbbb", "Running", T0.toISOString()),
    ],
    deploymentRefFromPod,
  );

  assert.equal(obs.length, 1);
  assert.equal(obs[0].pods.length, 2);
});

test("two deployments in one namespace stay separate — the live cluster has exactly this", () => {
  const obs = observeNamespace(
    "app-prj-node-js-getting-started",
    "prj-node-js-getting-started",
    [
      k8sPod("dpl9f6d095cc9-b8bd48788-xjcpc", "Running", T0.toISOString()),
      k8sPod("dplc3fd691f26-7b4d45584f-8frff", "Running", T0.toISOString()),
    ],
    deploymentRefFromPod,
  );

  assert.equal(obs.length, 2);
  assert.deepEqual(obs.map((o) => o.deploymentRef).sort(), ["dpl9f6d095cc9", "dplc3fd691f26"]);
});

test("an explicit deployment label beats parsing the pod name", () => {
  assert.equal(
    deploymentRefFromPod(
      k8sPod("anything-at-all-xyz", "Running", undefined, { "ahura.cloud/deployment": "dpl_explicit" }),
    ),
    "dpl_explicit",
  );
});

test("a pod name with no replicaset suffix does not parse to an empty ref", () => {
  assert.equal(deploymentRefFromPod(k8sPod("standalone", "Running")), "standalone");
});
