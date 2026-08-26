/**
 * Runtime log request tests.
 *
 *   node --test lib/paas/telemetry/runtime-logs.test.ts
 *
 * The two that matter most: a crash-looping pod must resolve to the PREVIOUS
 * container's logs, because that is the only place the failure exists; and
 * nothing caller-supplied may reach a Kubernetes API path unvalidated.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TAIL_LINES,
  InvalidTargetError,
  MAX_LOG_BYTES,
  MAX_SINCE_SECONDS,
  MAX_TAIL_LINES,
  buildLogPath,
  clampLogRequest,
  decidePrevious,
  explainEmptyLog,
  isValidK8sName,
  type PodLike,
} from "./runtime-logs.ts";

const TARGET = { namespace: "app-prj-welcome-to-docker", pod: "dpl5e2ba35124-66d897fd8-qmqrt" };

function pod(over: Partial<PodLike["status"]> = {}): PodLike {
  return {
    metadata: { name: TARGET.pod, namespace: TARGET.namespace },
    status: { phase: "Running", containerStatuses: [], ...over },
  };
}

// ── path injection ──────────────────────────────────────────────────────────

test("real namespace and pod names from the live cluster are accepted", () => {
  assert.equal(isValidK8sName("app-prj-node-js-getting-started"), true);
  assert.equal(isValidK8sName("dpl9f6d095cc9-b8bd48788-xjcpc"), true);
  assert.equal(isValidK8sName("a"), true);
});

test("anything that could escape the API path is refused", () => {
  for (const bad of [
    "../../../apis/rbac.authorization.k8s.io/v1/clusterroles",
    "..",
    "kube-system/pods/x/exec",
    "ns%2f..%2fsecrets",
    "UPPER",
    "trailing-",
    "-leading",
    "has_underscore",
    "has space",
    "nul\0byte",
    "new\nline",
    "",
    "x".repeat(64),
  ]) {
    assert.equal(isValidK8sName(bad), false, `${JSON.stringify(bad)} must be rejected`);
  }
});

test("clampLogRequest throws rather than building a path from an invalid name", () => {
  assert.throws(
    () => clampLogRequest({ namespace: "../kube-system", pod: TARGET.pod }),
    InvalidTargetError,
  );
  assert.throws(() => clampLogRequest({ ...TARGET, pod: "x/../../y" }), InvalidTargetError);
  assert.throws(
    () => clampLogRequest({ ...TARGET, container: "bad name" }),
    InvalidTargetError,
  );
});

test("the built path contains only validated segments", () => {
  const path = buildLogPath(clampLogRequest(TARGET));
  assert.match(path, /^\/api\/v1\/namespaces\/app-prj-welcome-to-docker\/pods\/dpl5e2ba35124-66d897fd8-qmqrt\/log\?/);
  assert.equal(path.includes(".."), false);
});

// ── server-side clamping ────────────────────────────────────────────────────

test("an absurd tailLines is clamped, not honoured and not rejected", () => {
  const r = clampLogRequest({ ...TARGET, tailLines: 50_000_000 });
  assert.equal(r.tailLines, MAX_TAIL_LINES);
  assert.deepEqual(r.clamped, [`tailLines reduced to ${MAX_TAIL_LINES}`]);
});

test("junk and hostile tailLines values fall back to the default", () => {
  for (const v of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(clampLogRequest({ ...TARGET, tailLines: v }).tailLines, DEFAULT_TAIL_LINES, `${v}`);
  }
  // A string arriving from a query string must not become a huge number or NaN.
  assert.equal(
    clampLogRequest({ ...TARGET, tailLines: "1e9" as unknown as number }).tailLines,
    MAX_TAIL_LINES,
  );
  assert.equal(
    clampLogRequest({ ...TARGET, tailLines: "abc" as unknown as number }).tailLines,
    DEFAULT_TAIL_LINES,
  );
});

test("sinceSeconds is clamped to a week and dropped when nonsensical", () => {
  assert.equal(clampLogRequest({ ...TARGET, sinceSeconds: 10 }).sinceSeconds, 10);
  assert.equal(
    clampLogRequest({ ...TARGET, sinceSeconds: 99_999_999 }).sinceSeconds,
    MAX_SINCE_SECONDS,
  );
  assert.equal(clampLogRequest({ ...TARGET, sinceSeconds: -5 }).sinceSeconds, undefined);
  assert.equal(clampLogRequest({ ...TARGET, sinceSeconds: NaN }).sinceSeconds, undefined);
});

test("limitBytes is always sent, because a line count cannot bound a megabyte line", () => {
  const path = buildLogPath(clampLogRequest({ ...TARGET, tailLines: 1 }));
  assert.match(path, new RegExp(`limitBytes=${MAX_LOG_BYTES}`));
});

test("timestamps default on, and can be turned off explicitly", () => {
  assert.match(buildLogPath(clampLogRequest(TARGET)), /timestamps=true/);
  assert.match(buildLogPath(clampLogRequest({ ...TARGET, timestamps: false })), /timestamps=false/);
});

// ── crash loops: the case that made this worth building ─────────────────────

test("a CrashLoopBackOff pod resolves to the previous container's logs", () => {
  const d = decidePrevious(
    pod({
      containerStatuses: [
        {
          name: "app",
          ready: false,
          restartCount: 7,
          state: { waiting: { reason: "CrashLoopBackOff" } },
          lastState: { terminated: { reason: "Error", exitCode: 1 } },
        },
      ],
    }),
  );

  assert.equal(d.previous, true);
  assert.equal(d.crashLooping, true);
  assert.equal(d.restarts, 7);
  assert.match(d.reason, /previous instance/);
});

test("an OOM-killed restart says so, since the fix is different from a crash", () => {
  const d = decidePrevious(
    pod({
      containerStatuses: [
        {
          name: "app",
          ready: true,
          restartCount: 2,
          state: { running: { startedAt: "2026-08-26T12:00:00Z" } },
          lastState: { terminated: { reason: "OOMKilled", exitCode: 137 } },
        },
      ],
    }),
  );

  assert.equal(d.previous, true);
  assert.equal(d.crashLooping, false);
  assert.match(d.reason, /OOM-killed/);
});

test("a healthy pod that has never restarted reads its current logs", () => {
  const d = decidePrevious(
    pod({ containerStatuses: [{ name: "app", ready: true, restartCount: 0, state: { running: {} } }] }),
  );

  assert.equal(d.previous, false);
  assert.equal(d.reason, "");
  assert.equal(d.restarts, 0);
});

test("restarts are summed across containers, not taken from the first", () => {
  const d = decidePrevious(
    pod({
      containerStatuses: [
        { name: "a", restartCount: 0, state: { running: {} } },
        { name: "b", restartCount: 5, state: { running: {} } },
      ],
    }),
  );
  assert.equal(d.restarts, 5);
  assert.equal(d.previous, true);
});

test("a pod with no status at all does not throw", () => {
  const d = decidePrevious({ metadata: { name: "x" } });
  assert.equal(d.previous, false);
  assert.equal(d.restarts, 0);
});

// ── empty logs that are not really empty ────────────────────────────────────

test("an image that will not pull is explained, not reported as 'no logs'", () => {
  const msg = explainEmptyLog(
    pod({
      phase: "Pending",
      containerStatuses: [{ name: "app", ready: false, state: { waiting: { reason: "ImagePullBackOff" } } }],
    }),
  );
  assert.match(msg as string, /ImagePullBackOff/);
  assert.match(msg as string, /build may not have published it/);
});

test("a missing env var is named as a config error, not a crash", () => {
  const msg = explainEmptyLog(
    pod({
      containerStatuses: [
        { name: "app", ready: false, state: { waiting: { reason: "CreateContainerConfigError" } } },
      ],
    }),
  );
  assert.match(msg as string, /environment variable or secret/);
});

test("an unscheduled pod says so", () => {
  assert.match(explainEmptyLog(pod({ phase: "Pending" })) as string, /not been scheduled/);
});

test("a healthy running pod needs no explanation", () => {
  assert.equal(
    explainEmptyLog(pod({ containerStatuses: [{ name: "app", ready: true, state: { running: {} } }] })),
    null,
  );
});

test("an unrecognised waiting reason is still surfaced verbatim", () => {
  const msg = explainEmptyLog(
    pod({ containerStatuses: [{ name: "app", state: { waiting: { reason: "SomethingNewFromUpstream" } } }] }),
  );
  assert.equal(msg, "SomethingNewFromUpstream");
});
