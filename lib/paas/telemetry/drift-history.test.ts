/**
 * Drift history mapping tests.
 *
 *   node --test lib/paas/telemetry/drift-history.test.ts
 *
 * The important case is the resolve scope. Getting it wrong does not lose
 * data — it silently marks live, money-costing drift as fixed, which is worse
 * than not recording it at all.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLEET_SCOPE,
  HOSTNAME_SCOPE,
  R2_SCOPE,
  fleetResourceType,
  groupForResolve,
  identityOf,
  observationsFromFleet,
  observationsFromHostnames,
  observationsFromR2,
  type Observation,
} from "./drift-history.ts";
import type { Finding } from "./reconcile.ts";
import type { HostnameFinding } from "./dns-drift.ts";
import type { R2Finding } from "./r2-drift.ts";

function fleet(over: Partial<Finding> = {}): Finding {
  return {
    status: "unrecorded",
    kind: "lke",
    label: "ahura-v2-dev",
    cloudId: 647920,
    ref: null,
    hourly: 0.159,
    detail: "2 nodes + 1 nodebalancer",
    action: "",
    unaccounted: true,
    actionable: true,
    ...over,
  };
}

function host(over: Partial<HostnameFinding> = {}): HostnameFinding {
  return {
    status: "unrecorded",
    hostname: "v2-express.ahurasense.com",
    recordId: "rec_1",
    ingress: "app-prj-x/als-1",
    ref: null,
    detail: "serving with no alias row",
    action: "",
    actionable: true,
    live: true,
    ...over,
  };
}

// ── mapping ─────────────────────────────────────────────────────────────────

test("fleet statuses map to the four drift kinds", () => {
  const cases: Array<[Finding["status"], string]> = [
    ["unrecorded", "unrecorded"],
    ["denied", "denied"],
    ["phantom", "stale"],
    ["mismatched", "stale"],
  ];

  for (const [status, expected] of cases) {
    const o = observationsFromFleet([fleet({ status })], []);
    assert.equal(o.length, 1, status);
    assert.equal(o[0].kind, expected, status);
  }
});

test("statuses with no honest kind are skipped, not approximated", () => {
  // expired: the row is CORRECT and the reaper failed. Calling it `stale` would
  // say the control plane is lying when it is telling the truth.
  for (const status of ["expired", "reserved", "foreign", "tracked"] as const) {
    assert.deepEqual(observationsFromFleet([fleet({ status })], []), [], status);
  }
});

test("an unpriced resource is its own observation", () => {
  const o = observationsFromFleet([], ["node lke1-2-a (type g6-future-8)"]);
  assert.equal(o.length, 1);
  assert.equal(o[0].kind, "unpriced");
  assert.equal(o[0].hourlyUsd, null, "never 0 for unknown");
});

test("an unknown hourly stays null through the mapping", () => {
  const o = observationsFromFleet([fleet({ hourly: null })], []);
  assert.equal(o[0].hourlyUsd, null);
});

test("resource types are stable and schema-legal", () => {
  const shape = /^[a-z][a-z0-9_-]{0,40}$/;
  for (const k of ["lke", "cluster-row", "build-vm", "build-vm-row", "nodebalancer", "instance"] as const) {
    assert.match(fleetResourceType(k as Finding["kind"]), shape, k);
  }
  assert.equal(fleetResourceType("lke"), fleetResourceType("cluster-row"), "both describe a cluster");
  assert.equal(fleetResourceType("build-vm"), fleetResourceType("build-vm-row"));
});

test("hostname findings map, and claimable is deliberately not recorded", () => {
  assert.equal(observationsFromHostnames([host({ status: "unrecorded" })])[0].kind, "unrecorded");
  assert.equal(observationsFromHostnames([host({ status: "phantom" })])[0].kind, "stale");

  // Filing a security finding under the heading used for untracked spend would
  // bury it. It is still reported, with its own exit code — just not here.
  assert.deepEqual(observationsFromHostnames([host({ status: "claimable" })]), []);
  assert.deepEqual(observationsFromHostnames([host({ status: "healthy" })]), []);
  assert.deepEqual(observationsFromHostnames([host({ status: "foreign" })]), []);
});

test("only orphaned R2 objects are recorded, never merely redundant ones", () => {
  const obj = (disposition: R2Finding["disposition"]): R2Finding => ({
    key: "builds/dpl_1/image.tar",
    disposition,
    bytes: 1024,
    deploymentRef: "dpl_1",
    reclaimable: true,
    detail: "d",
    lastModified: "2026-08-26T10:00:00Z",
  });

  assert.equal(observationsFromR2([obj("orphan")]).length, 1);
  // Redundant is expected steady-state behaviour, not drift: every successful
  // build produces one. Recording it would fill the history with noise.
  assert.deepEqual(observationsFromR2([obj("redundant")]), []);
  assert.deepEqual(observationsFromR2([obj("retain")]), []);
  assert.deepEqual(observationsFromR2([obj("in-flight")]), []);
});

// ── the resolve scope ───────────────────────────────────────────────────────

test("every scoped pair is emitted even when nothing was found for it", () => {
  // The bug this guards: deriving groups from findings means a clean sweep
  // produces no groups, so nothing is ever resolved and every past problem
  // stays open forever.
  const groups = groupForResolve([], FLEET_SCOPE);

  assert.equal(groups.length, FLEET_SCOPE.length);
  assert.equal(groups.every((g) => g.stillOpen.length === 0), true);
});

test("a cleared finding leaves its group present with an empty open set", () => {
  const groups = groupForResolve(observationsFromFleet([], []), FLEET_SCOPE);
  const clusters = groups.find((g) => g.kind === "unrecorded" && g.resourceType === "lke_cluster");

  assert.ok(clusters, "the group must exist so the RPC can close what it holds");
  assert.deepEqual(clusters.stillOpen, []);
});

test("resolution is scoped by resource type, so hostnames cannot close clusters", () => {
  // Both are kind `unrecorded`. Scoping only by kind would let a hostname
  // sweep mark a live unrecorded cluster as resolved.
  const observations: Observation[] = [
    ...observationsFromFleet([fleet()], []),
    ...observationsFromHostnames([host()]),
  ];

  const hostnameGroups = groupForResolve(observations, HOSTNAME_SCOPE);
  const g = hostnameGroups.find((x) => x.kind === "unrecorded");

  assert.deepEqual(g?.stillOpen, ["rec_1"], "only the hostname, never the cluster id");
  assert.equal(g?.stillOpen.includes("647920"), false);
});

test("identity matches what the RPC compares against: coalesce(cloud_id, ref)", () => {
  assert.equal(identityOf({ kind: "unrecorded", resourceType: "x", cloudId: "42", ref: "cls_1", hourlyUsd: null, detail: "" }), "42");
  assert.equal(identityOf({ kind: "stale", resourceType: "x", cloudId: null, ref: "cls_1", hourlyUsd: null, detail: "" }), "cls_1");
});

test("each sweep's scope is disjoint from the others by resource type", () => {
  const types = (s: typeof FLEET_SCOPE) => new Set(s.map((x) => x.resourceType));
  const fleetTypes = types(FLEET_SCOPE);

  for (const s of [...HOSTNAME_SCOPE, ...R2_SCOPE]) {
    assert.equal(
      fleetTypes.has(s.resourceType),
      false,
      `${s.resourceType} appears in two sweeps; one would resolve the other's findings`,
    );
  }
});

test("the fleet scope covers every kind the fleet mapper can produce", () => {
  const produced = new Set(
    [
      ...observationsFromFleet(
        [
          fleet({ status: "unrecorded" }),
          fleet({ status: "denied" }),
          fleet({ status: "phantom" }),
          fleet({ status: "mismatched" }),
        ],
        ["x (type y)"],
      ),
    ].map((o) => `${o.kind} ${o.resourceType}`),
  );

  const scoped = new Set(FLEET_SCOPE.map((s) => `${s.kind} ${s.resourceType}`));
  for (const p of produced) {
    assert.ok(scoped.has(p), `${p} is recorded but never resolved — it would stay open forever`);
  }
});
