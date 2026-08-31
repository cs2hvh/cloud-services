/**
 * Metrics parsing tests.
 *
 *   node --test lib/paas/telemetry/metrics.test.ts
 *
 * metrics-server is not installed yet, so none of this has run against the
 * real API. That is exactly why the parsing is tested against the documented
 * shapes: a quantity parsed wrong does not throw, it produces a plausible
 * number, and the decimal/binary confusion understates memory by 7% at Gi.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  byDeployment,
  formatBytes,
  formatCores,
  parseQuantity,
  podUsage,
  type PodMetricsLike,
} from "./metrics.ts";

// ── the shapes metrics-server actually emits ────────────────────────────────

test("CPU in nanocores, which is what metrics-server reports", () => {
  assert.equal(parseQuantity("123456n"), 123456e-9);
  assert.ok(Math.abs((parseQuantity("500000000n") as number) - 0.5) < 1e-12);
});

test("memory in kibibytes, which is what metrics-server reports", () => {
  assert.equal(parseQuantity("64512Ki"), 64512 * 1024);
  assert.equal(parseQuantity("1Gi"), 1024 ** 3);
});

test("millicores parse as thousandths of a core", () => {
  assert.equal(parseQuantity("100m"), 0.1);
  assert.equal(parseQuantity("1500m"), 1.5);
  assert.equal(parseQuantity("1"), 1);
  assert.equal(parseQuantity("2"), 2);
});

// ── the confusion that silently misreports ──────────────────────────────────

test("binary and decimal suffixes are NOT the same, and Mi is not M", () => {
  assert.equal(parseQuantity("1M"), 1e6);
  assert.equal(parseQuantity("1Mi"), 1024 ** 2);
  assert.notEqual(parseQuantity("1M"), parseQuantity("1Mi"));

  // At Gi the gap is 74 MB — invisible per pod, material across a fleet.
  const gap = (parseQuantity("1Gi") as number) - (parseQuantity("1G") as number);
  assert.ok(gap > 73_000_000 && gap < 75_000_000, `expected ~74MB gap, got ${gap}`);
});

test("a two-character binary suffix is not read as its first letter", () => {
  // The failure this guards: matching the decimal table on "M" first would
  // accept "Mi" as 10^6 and understate every memory figure by 4.6%.
  assert.equal(parseQuantity("512Mi"), 512 * 1024 ** 2);
  assert.notEqual(parseQuantity("512Mi"), 512 * 1e6);
});

test("scientific notation is accepted, because the API permits it", () => {
  assert.equal(parseQuantity("1e6"), 1e6);
  assert.equal(parseQuantity("1.5e3"), 1500);
});

// ── unknown is never zero ───────────────────────────────────────────────────

test("an unparseable quantity is null, never 0", () => {
  for (const bad of ["", "  ", "abc", "12Xi", "1/2", "NaN", "12 Mi", null, undefined]) {
    assert.equal(parseQuantity(bad as string), null, JSON.stringify(bad));
  }
});

test("zero is a real value and stays zero", () => {
  assert.equal(parseQuantity("0"), 0);
  assert.equal(parseQuantity("0n"), 0);
  assert.notEqual(parseQuantity("0"), null, "a genuinely idle pod is not unknown");
});

// ── pods ────────────────────────────────────────────────────────────────────

function pod(name: string, containers: Array<{ cpu?: string; memory?: string }>): PodMetricsLike {
  return {
    metadata: { name, namespace: "app-prj-x" },
    containers: containers.map((c, i) => ({ name: `c${i}`, usage: c })),
  };
}

test("a pod's usage is the sum of its containers", () => {
  const u = podUsage(pod("p1", [{ cpu: "100m", memory: "64Mi" }, { cpu: "50m", memory: "32Mi" }]));

  assert.ok(Math.abs((u.cpuCores as number) - 0.15) < 1e-12);
  assert.equal(u.memoryBytes, 96 * 1024 ** 2);
});

test("one unreadable container poisons the pod rather than being skipped", () => {
  // Summing only the containers we understood would understate the pod while
  // looking precise, which is worse than admitting we do not know.
  const u = podUsage(pod("p1", [{ cpu: "100m", memory: "64Mi" }, { cpu: "???", memory: "32Mi" }]));

  assert.equal(u.cpuCores, null);
  assert.equal(u.memoryBytes, 96 * 1024 ** 2, "memory was readable on both, so it stands");
});

test("a pod with no containers reports unknown, not zero", () => {
  const u = podUsage({ metadata: { name: "p", namespace: "n" } });
  assert.equal(u.cpuCores, null);
  assert.equal(u.memoryBytes, null);
});

// ── deployments ─────────────────────────────────────────────────────────────

const refOf = (podName: string) => podName.split("-").slice(0, -2).join("-") || podName;

test("pods group into their deployment and sum", () => {
  const [d] = byDeployment(
    [
      podUsage(pod("dpl9f6d095cc9-b8bd48788-aaaaa", [{ cpu: "100m", memory: "64Mi" }])),
      podUsage(pod("dpl9f6d095cc9-b8bd48788-bbbbb", [{ cpu: "200m", memory: "128Mi" }])),
    ],
    refOf,
  );

  assert.equal(d.deploymentRef, "dpl9f6d095cc9");
  assert.equal(d.pods, 2);
  assert.ok(Math.abs((d.cpuCores as number) - 0.3) < 1e-12);
  assert.equal(d.memoryBytes, 192 * 1024 ** 2);
  assert.equal(d.unreadable, 0);
});

test("an unreadable pod marks its deployment unknown and counts itself", () => {
  const [d] = byDeployment(
    [
      podUsage(pod("dpl_1-rs-aaaaa", [{ cpu: "100m", memory: "64Mi" }])),
      podUsage(pod("dpl_1-rs-bbbbb", [{ cpu: "bad", memory: "bad" }])),
    ],
    refOf,
  );

  assert.equal(d.cpuCores, null, "a partial sum would understate the deployment");
  assert.equal(d.unreadable, 1);
  assert.equal(d.pods, 2);
});

test("deployments in different namespaces stay separate even with the same ref", () => {
  const usage = byDeployment(
    [
      { podName: "dpl_1-rs-a", namespace: "ns-a", cpuCores: 1, memoryBytes: 100 },
      { podName: "dpl_1-rs-b", namespace: "ns-b", cpuCores: 2, memoryBytes: 200 },
    ],
    refOf,
  );

  assert.equal(usage.length, 2);
});

test("deployments sort by CPU, with unknown last", () => {
  const usage = byDeployment(
    [
      { podName: "low-rs-a", namespace: "n", cpuCores: 0.1, memoryBytes: 1 },
      { podName: "unknown-rs-a", namespace: "n", cpuCores: null, memoryBytes: null },
      { podName: "high-rs-a", namespace: "n", cpuCores: 2, memoryBytes: 1 },
    ],
    refOf,
  );

  assert.deepEqual(usage.map((d) => d.deploymentRef), ["high", "low", "unknown"]);
});

test("no pods aggregates to nothing", () => {
  assert.deepEqual(byDeployment([], refOf), []);
});

// ── formatting ──────────────────────────────────────────────────────────────

test("formatting says 'unknown' rather than showing a zero", () => {
  assert.equal(formatCores(null), "unknown");
  assert.equal(formatBytes(null), "unknown");
  assert.equal(formatCores(0), "0m", "a genuinely idle pod reads as zero, not unknown");
});

test("cores and bytes read sensibly at every scale", () => {
  assert.equal(formatCores(0.15), "150m");
  assert.equal(formatCores(2.5), "2.50");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(64 * 1024 ** 2), "64.0 MiB");
  assert.equal(formatBytes(2 * 1024 ** 3), "2.00 GiB");
});
