import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  kubeletReservedBytes,
  nodeDensity,
  costPerPod,
  compareDensity,
  parseDensityTable,
  parseNodePrice,
} from "./density.ts";

const DOC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "v2", "05-pricing.md");

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

test("the real pricing doc parses — this is the check that it still can", () => {
  // Reads the actual file. If someone reformats the table, this fails and says
  // so, rather than the checker silently comparing against a stale copy.
  const claim = parseDensityTable(readFileSync(DOC, "utf8"));
  assert.ok(claim !== null, "could not find the pod-density table in 05-pricing.md");
  assert.ok(claim.rows.length >= 4, `expected at least 4 tier rows, got ${claim.rows.length}`);
  assert.match(claim.nodeType, /^g6-/);
  assert.ok(claim.usableClaimBytes > 0);

  // Every row must carry all three facts. A row that parsed to a zero pod count
  // would compare clean against any density at all.
  for (const r of claim.rows) {
    assert.ok(r.podBytes > 0, `${r.podLabel} parsed to zero bytes`);
    assert.ok(r.pods > 0, `${r.podLabel} parsed to zero pods`);
    assert.ok(r.costUsd > 0, `${r.podLabel} parsed to zero cost`);
  }
});

test("the node price is read from the doc, not assumed", () => {
  const md = readFileSync(DOC, "utf8");
  const claim = parseDensityTable(md);
  assert.ok(claim !== null);
  const price = parseNodePrice(md, claim.nodeType);
  assert.ok(price !== null && price > 0, `no price found for ${claim.nodeType}`);

  // The doc's own arithmetic must be self-consistent: price / pods = $/pod.
  // If it is not, the table was edited in one place and not the other.
  for (const r of claim.rows) {
    const implied = price / r.pods;
    assert.ok(
      Math.abs(implied - r.costUsd) / r.costUsd < 0.02,
      `${r.podLabel}: table says $${r.costUsd} but $${price}/${r.pods} = $${implied.toFixed(2)}`,
    );
  }
});

test("an unreadable table is null, never an empty claim list", () => {
  // The dangerous failure: zero rows compare clean against any measurement, so
  // a doc this cannot read would be reported as verified.
  assert.equal(parseDensityTable("# no table here"), null);
  assert.equal(parseDensityTable(""), null);
  assert.equal(parseDensityTable("| Pod RAM | On `g6-standard-16` (60 GB usable) | $/pod/mo |"), null);
});

test("a row that does not parse aborts the read rather than being skipped", () => {
  const md = [
    "| Pod RAM | On `g6-standard-16` (60 GB usable) | $/pod/mo |",
    "|---|---|---|",
    "| 512 MB | 110 | **$3.49** |",
    "| 1 GB | who knows | **$6.86** |",
  ].join("\n");
  // Silently dropping the bad row would leave a claim that looks complete and
  // has quietly stopped checking one of the tiers.
  assert.equal(parseDensityTable(md), null);
});

test("an italic annotation on the pod count does not defeat the parse", () => {
  const md = [
    "| Pod RAM | On `g6-standard-16` (60 GB usable) | $/pod/mo |",
    "|---|---|---|",
    "| 512 MB | 110 *(kubelet cap binds, not RAM)* | **$3.49** |",
  ].join("\n");
  const claim = parseDensityTable(md);
  assert.equal(claim?.rows[0].pods, 110);
  assert.equal(claim?.rows[0].podBytes, 512 * 1024 ** 2);
});

test("an unknown node type has no price, rather than a plausible one", () => {
  const md = "| `g6-standard-16` | 16 | 64 GB | **$384** | 20 TB |";
  assert.equal(parseNodePrice(md, "g6-standard-16"), 384);
  assert.equal(parseNodePrice(md, "g6-standard-32"), null);
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
