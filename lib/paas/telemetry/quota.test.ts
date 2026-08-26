/**
 * Tenant quota tests.
 *
 *   node --test lib/paas/telemetry/quota.test.ts
 *
 * The manifests are the easy part. Every interesting test here is about
 * REFUSING to enforce — because Kubernetes accepts a quota smaller than
 * current usage, says nothing, and then rejects the next deploy. The outage
 * is delayed and lands on whoever pushes next.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_QUOTA,
  canEnforce,
  cpuCores,
  limitRangeManifest,
  measureNamespace,
  memoryBytes,
  resourceQuotaManifest,
  type PodSpecLike,
} from "./quota.ts";

function pod(name: string, containers: Array<{ cpu?: string; memory?: string; limCpu?: string; limMem?: string }>, phase = "Running"): PodSpecLike {
  return {
    name,
    phase,
    containers: containers.map((c, i) => ({
      name: `c${i}`,
      resources: {
        requests: { cpu: c.cpu, memory: c.memory },
        limits: { cpu: c.limCpu, memory: c.limMem },
      },
    })),
  };
}

/** What appDeployment actually asks for. */
const APP = { cpu: "100m", memory: "256Mi", limCpu: "1", limMem: "512Mi" };

// ── quantities ──────────────────────────────────────────────────────────────

test("CPU quantities parse in both forms Kubernetes writes", () => {
  assert.equal(cpuCores("100m"), 0.1);
  assert.equal(cpuCores("1"), 1);
  assert.equal(cpuCores("2.5"), 2.5);
  assert.equal(cpuCores("1500m"), 1.5);
});

test("memory quantities distinguish binary from decimal", () => {
  assert.equal(memoryBytes("256Mi"), 256 * 1024 ** 2);
  assert.equal(memoryBytes("1Gi"), 1024 ** 3);
  assert.notEqual(memoryBytes("1G"), memoryBytes("1Gi"));
});

test("an unreadable quantity is null, never 0", () => {
  // Zero would make every namespace look comfortably under budget, which is
  // the reading that makes an unsafe quota look safe.
  for (const bad of ["", "abc", "100x", undefined]) {
    assert.equal(cpuCores(bad as string), null, String(bad));
    assert.equal(memoryBytes(bad as string), null, String(bad));
  }
});

// ── measuring ───────────────────────────────────────────────────────────────

test("a namespace's usage is the sum of its non-terminal pods", () => {
  const u = measureNamespace([pod("a", [APP]), pod("b", [APP])]);

  assert.equal(u.pods, 2);
  assert.ok(Math.abs(u.requestsCpu - 0.2) < 1e-9);
  assert.equal(u.requestsMemory, 512 * 1024 ** 2);
  assert.equal(u.limitsCpu, 2);
});

test("Succeeded and Failed pods are not counted — Kubernetes does not charge them", () => {
  // Counting them would inflate usage and block a quota that is genuinely
  // fine. The publisher Jobs in this platform leave Succeeded pods around.
  const u = measureNamespace([
    pod("live", [APP]),
    pod("done", [APP], "Succeeded"),
    pod("dead", [APP], "Failed"),
  ]);

  assert.equal(u.pods, 1);
  assert.ok(Math.abs(u.requestsCpu - 0.1) < 1e-9);
});

// ── the refusals ────────────────────────────────────────────────────────────

test("usage under the bound is safe to enforce", () => {
  const v = canEnforce(measureNamespace([pod("a", [APP]), pod("b", [APP])]));

  assert.equal(v.safe, true);
  assert.deepEqual(v.blockers, []);
  assert.equal(v.headroom.pods, DEFAULT_QUOTA.pods - 2);
});

test("usage ALREADY over the bound refuses, and says why it would be a delayed outage", () => {
  // The case the whole module exists for. Kubernetes accepts this quota,
  // existing pods keep running, nothing errors — and the next deploy fails.
  const pods = Array.from({ length: 12 }, (_, i) => pod(`p${i}`, [APP]));
  const v = canEnforce(measureNamespace(pods));

  assert.equal(v.safe, false);
  assert.ok(v.blockers.some((b) => b.startsWith("pods:")));
  assert.match(v.blockers.join(" "), /reject the next deploy or restart/);
  assert.match(v.blockers.join(" "), /landing on whoever pushes next/);
});

test("a container with NO requests refuses — the quota would stop pod creation entirely", () => {
  // A quota on requests.cpu makes requests mandatory namespace-wide. One
  // container without them and the namespace cannot create pods at all,
  // including the replacement for one that just crashed.
  const v = canEnforce(measureNamespace([pod("a", [APP]), { name: "b", phase: "Running", containers: [{ name: "c0" }] }]));

  assert.equal(v.safe, false);
  assert.match(v.blockers[0], /declare no resource requests/);
  assert.match(v.blockers[0], /stop being able to create pods at all/);
});

test("an unreadable quantity refuses, because unknown is not 'fits'", () => {
  const v = canEnforce(measureNamespace([pod("a", [{ cpu: "banana", memory: "256Mi" }])]));

  assert.equal(v.safe, false);
  assert.match(v.blockers.join(" "), /unknown is not "fits"/);
});

test("each dimension is checked, not just pods", () => {
  // One fat pod under the pod ceiling can still exceed the CPU bound.
  const v = canEnforce(measureNamespace([pod("fat", [{ cpu: "4", memory: "256Mi" }])]));

  assert.equal(v.safe, false);
  assert.ok(v.blockers.some((b) => b.startsWith("requests.cpu:")));
  assert.equal(v.blockers.some((b) => b.startsWith("pods:")), false, "one pod is under the pod ceiling");
});

test("a malformed policy value refuses rather than silently comparing against nothing", () => {
  const v = canEnforce(measureNamespace([pod("a", [APP])]), {
    ...DEFAULT_QUOTA,
    requestsCpu: "one core",
  });

  assert.equal(v.safe, false);
  assert.match(v.blockers.join(" "), /not a valid quantity/);
});

test("an empty namespace is safe and reports full headroom", () => {
  const v = canEnforce(measureNamespace([]));

  assert.equal(v.safe, true);
  assert.equal(v.headroom.pods, DEFAULT_QUOTA.pods);
});

// ── the manifests ───────────────────────────────────────────────────────────

test("the ResourceQuota bounds every dimension the policy names", () => {
  const q = resourceQuotaManifest("app-prj-x");

  assert.equal(q.metadata.namespace, "app-prj-x");
  assert.deepEqual(Object.keys(q.spec.hard).sort(), [
    "limits.cpu",
    "limits.memory",
    "pods",
    "requests.cpu",
    "requests.memory",
  ]);
  assert.equal(q.spec.hard.pods, "8");
});

test("the LimitRange sets defaults as well as maxima", () => {
  // The defaults are what remove the sharpest edge of enforcing a quota: a
  // container declaring nothing gets values rather than being rejected.
  const lr = limitRangeManifest("app-prj-x");
  const rule = lr.spec.limits[0];

  assert.equal(rule.type, "Container");
  assert.ok(rule.defaultRequest.cpu, "a container declaring nothing still gets a request");
  assert.ok(rule.default.cpu);
  assert.equal(rule.max.cpu, DEFAULT_QUOTA.maxContainerCpu);
});

test("the LimitRange defaults match what appDeployment already asks for", () => {
  // If they diverged, enforcing the LimitRange would silently change the
  // resources of every pod that relies on the manifest default.
  const rule = limitRangeManifest("ns").spec.limits[0];

  assert.equal(rule.defaultRequest.cpu, "100m");
  assert.equal(rule.defaultRequest.memory, "256Mi");
});

test("the per-container ceiling is below the namespace bound", () => {
  // Otherwise one container could consume the entire namespace budget and the
  // per-container limit would be decoration.
  const perContainer = cpuCores(DEFAULT_QUOTA.maxContainerCpu) as number;
  const namespaceLimit = cpuCores(DEFAULT_QUOTA.limitsCpu) as number;

  assert.ok(perContainer < namespaceLimit, `${perContainer} must be under ${namespaceLimit}`);
});

test("the default budget is internally consistent — requests fit inside limits", () => {
  assert.ok((cpuCores(DEFAULT_QUOTA.requestsCpu) as number) <= (cpuCores(DEFAULT_QUOTA.limitsCpu) as number));
  assert.ok(
    (memoryBytes(DEFAULT_QUOTA.requestsMemory) as number) <=
      (memoryBytes(DEFAULT_QUOTA.limitsMemory) as number),
  );
});

test("the pod ceiling admits a full rolling deploy of the default app", () => {
  // A namespace at its pod ceiling cannot surge, so a rolling update deadlocks.
  // The bound has to leave room for the surge or enforcing it breaks deploys
  // at exactly the moment a tenant is trying to fix something.
  const perPodCpu = cpuCores(APP.cpu) as number;
  const budget = cpuCores(DEFAULT_QUOTA.requestsCpu) as number;

  assert.ok(DEFAULT_QUOTA.pods * perPodCpu <= budget, "CPU must not bind before the pod ceiling");
  assert.ok(DEFAULT_QUOTA.pods >= 4, "room for replicas plus a rolling surge");
});
