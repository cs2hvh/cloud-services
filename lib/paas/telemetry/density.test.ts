import { test } from "node:test";
import assert from "node:assert/strict";
import { kubeletReservedBytes, nodeDensity, costPerPod, compareDensity } from "./density.ts";

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

// The live g6-standard-4, read from the API on 2026-08-26. Every extrapolation
// in this module is anchored to this one real observation, so it is a fixture.
const OBSERVED_CAPACITY = 8138636 * 1024;
const OBSERVED_ALLOCATABLE = 6147980 * 1024;

test("the tiered formula reproduces a real node's reservation", () => {
  const predicted = kubeletReservedBytes(OBSERVED_CAPACITY);
  const actual = OBSERVED_CAPACITY - OBSERVED_ALLOCATABLE;

  // Within the eviction threshold. Not exact — LKE reserves ~50 MiB beyond the
  // formula — and the gap is asserted rather than smoothed away, because a
  // formula that silently drifted from the machine would be worse than no
  // formula at all.
  const gap = actual - predicted;
  assert.ok(gap > 0, "LKE should reserve at least what the formula predicts");
  assert.ok(gap < 100 * MIB, `formula is ${(gap / MIB).toFixed(0)} MiB under, expected < 100`);
});

test("reservation is proportionally brutal on small nodes and still material on large", () => {
  const small = kubeletReservedBytes(8 * GIB) / (8 * GIB);
  const large = kubeletReservedBytes(64 * GIB) / (64 * GIB);
  assert.ok(small > 0.22, `8 GB node should lose >22%, lost ${(small * 100).toFixed(1)}%`);
  assert.ok(large > 0.08, `64 GB node should still lose >8%, lost ${(large * 100).toFixed(1)}%`);
  assert.ok(large < small, "the reservation should be proportionally smaller on bigger nodes");
});

test("measured allocatable is used verbatim, never recomputed", () => {
  // If a real node reports allocatable, that number IS the answer. Recomputing
  // it from the formula would replace an observation with an estimate.
  const d = nodeDensity({
    node: { capacityBytes: OBSERVED_CAPACITY, allocatableBytes: OBSERVED_ALLOCATABLE, maxPods: 110 },
    podBytes: 512 * MIB,
    sentryBytes: 128 * MIB,
    systemPodBytes: 456 * MIB,
  });
  assert.equal(d.measured, true);
  assert.equal(d.usableBytes, OBSERVED_ALLOCATABLE - 456 * MIB);
});

test("a node with no measured allocatable is marked derived", () => {
  const d = nodeDensity({
    node: { capacityBytes: 64 * GIB, allocatableBytes: null, maxPods: 110 },
    podBytes: 512 * MIB,
    sentryBytes: 128 * MIB,
    systemPodBytes: 456 * MIB,
  });
  assert.equal(d.measured, false);
});

test("sandbox overhead is charged per pod, and it decides the small tiers", () => {
  const node = { capacityBytes: 64 * GIB, allocatableBytes: 56 * GIB, maxPods: 110 };
  const at = (sentry: number) =>
    nodeDensity({ node, podBytes: 512 * MIB, sentryBytes: sentry, systemPodBytes: 456 * MIB }).pods;

  // The pricing table allows 30 MB; the cluster's own RuntimeClass declares
  // 128Mi. At 512Mi that difference is the whole margin.
  assert.ok(at(128 * MIB) < at(30 * MIB), "a bigger sandbox charge must fit fewer pods");
});

test("boundBy distinguishes the kubelet cap from RAM", () => {
  const node = { capacityBytes: 64 * GIB, allocatableBytes: 56 * GIB, maxPods: 110 };

  const tiny = nodeDensity({ node, podBytes: 64 * MIB, sentryBytes: 0, systemPodBytes: 0 });
  assert.equal(tiny.boundBy, "kubelet-cap");
  assert.equal(tiny.pods, 110);

  const fat = nodeDensity({ node, podBytes: 4 * GIB, sentryBytes: 128 * MIB, systemPodBytes: 0 });
  assert.equal(fat.boundBy, "memory");
  assert.ok(fat.pods < 110);
});

test("a node too small for a single pod reports zero, not a negative", () => {
  const d = nodeDensity({
    node: { capacityBytes: 1 * GIB, allocatableBytes: 512 * MIB, maxPods: 110 },
    podBytes: 4 * GIB,
    sentryBytes: 128 * MIB,
    systemPodBytes: 900 * MIB, // system pods alone exceed allocatable
  });
  assert.equal(d.usableBytes, 0);
  assert.equal(d.pods, 0);
  assert.equal(costPerPod(384, d.pods), null, "cost per pod is undefined at zero density, not Infinity");
});

test("comparison reports the direction that costs money", () => {
  const node = { capacityBytes: 64 * GIB, allocatableBytes: 56 * GIB, maxPods: 110 };
  const d = nodeDensity({ node, podBytes: 512 * MIB, sentryBytes: 128 * MIB, systemPodBytes: 456 * MIB });

  const c = compareDensity({ podLabel: "512Mi", podBytes: 512 * MIB, pods: 110, costUsd: 3.49 }, d, 384);

  assert.ok(c.shortfall > 0, "fewer pods fit than claimed");
  assert.ok(c.costErrorPct !== null && c.costErrorPct > 0, "so the claimed cost is an understatement");
  assert.ok(c.actualCostUsd !== null && c.actualCostUsd > c.claimedCostUsd);
});

test("a table that understates density reports a negative shortfall", () => {
  // The harmless direction, and it must be distinguishable from the harmful
  // one rather than collapsed into an absolute difference.
  const node = { capacityBytes: 64 * GIB, allocatableBytes: 56 * GIB, maxPods: 110 };
  const d = nodeDensity({ node, podBytes: 512 * MIB, sentryBytes: 0, systemPodBytes: 0 });
  const c = compareDensity({ podLabel: "512Mi", podBytes: 512 * MIB, pods: 50, costUsd: 7.68 }, d, 384);
  assert.ok(c.shortfall < 0);
  assert.ok(c.costErrorPct !== null && c.costErrorPct < 0);
});
