import { test } from "node:test";
import assert from "node:assert/strict";
import { requireTier } from "../tiers.ts";
import {
  attributeApp,
  attributeFleet,
  OUTGROWN_CPU_FRACTION,
  type AppObserved,
} from "./attribution.ts";

const MIB = 1024 ** 2;
const STARTER = requireTier("starter");
const PRO = requireTier("pro");

function app(over: Partial<AppObserved> = {}): AppObserved {
  return {
    projectRef: "prj-1",
    tier: STARTER,
    instanceCount: 1,
    runningPods: 1,
    podMemoryBytes: 512 * MIB,
    podCpuLimitCores: 1,
    usedCpuCores: 0.003,
    usedMemoryBytes: 90 * MIB,
    unreadablePods: 0,
    ...over,
  };
}

test("a healthy app produces the tier's own economics and no findings", () => {
  const a = attributeApp(app());
  assert.equal(a.priceUsd, STARTER.priceUsd);
  assert.equal(a.costUsd, STARTER.costUsd);
  assert.equal(a.marginUsd, Math.round((STARTER.priceUsd - STARTER.costUsd) * 100) / 100);
  assert.deepEqual(a.findings, []);
});

test("price and cost both scale with instance count", () => {
  const a = attributeApp(app({ instanceCount: 3, runningPods: 3 }));
  assert.equal(a.priceUsd, STARTER.priceUsd * 3);
  assert.equal(a.costUsd, Math.round(STARTER.costUsd * 3 * 100) / 100);
});

test("deployed memory that does not match the tier is drift, with a direction", () => {
  // Over-provisioned: we are giving away resources.
  const rich = attributeApp(app({ podMemoryBytes: 1024 * MIB }));
  const richFinding = rich.findings.find((f) => f.kind === "tier-drift");
  assert.ok(richFinding);
  assert.equal(richFinding.against, "platform");

  // Under-provisioned: a paying customer is running on less than they bought.
  const poor = attributeApp(app({ podMemoryBytes: 256 * MIB }));
  const poorFinding = poor.findings.find((f) => f.kind === "tier-drift");
  assert.ok(poorFinding);
  assert.equal(poorFinding.against, "customer");
});

test("the tier's expected shape comes from resourcesFor, not a second copy", () => {
  // Starter is 512Mi. If tiers.ts changes, this follows it rather than
  // asserting a number that would quietly become wrong.
  const a = attributeApp(app({ tier: PRO, podMemoryBytes: 512 * MIB }));
  assert.ok(a.findings.some((f) => f.kind === "tier-drift"), "Pro is 2048Mi, so 512Mi is drift");
});

test("running fewer pods than billed counts against the customer", () => {
  const a = attributeApp(app({ instanceCount: 3, runningPods: 1 }));
  const f = a.findings.find((x) => x.kind === "instance-drift");
  assert.ok(f);
  assert.equal(f.against, "customer");
});

test("running more pods than billed counts against the platform", () => {
  const a = attributeApp(app({ instanceCount: 1, runningPods: 3 }));
  const f = a.findings.find((x) => x.kind === "instance-drift");
  assert.ok(f);
  assert.equal(f.against, "platform");
});

test("an app living at its CPU ceiling has outgrown its tier", () => {
  // The abuse vector flat pricing creates: shared CPU reserves 50m and permits
  // 1000m, so an app at its ceiling takes twenty times what it pays to reserve.
  const a = attributeApp(app({ usedCpuCores: 0.95 }));
  const f = a.findings.find((x) => x.kind === "outgrown-tier");
  assert.ok(f);
  assert.equal(f.against, "platform");
  assert.ok(a.cpuUtilisation !== null && a.cpuUtilisation >= OUTGROWN_CPU_FRACTION);
});

test("bursting below the threshold is the product working, not a finding", () => {
  const a = attributeApp(app({ usedCpuCores: 0.5 }));
  assert.equal(a.findings.filter((f) => f.kind === "outgrown-tier").length, 0);
});

test("utilisation is per pod, so scaling out does not invent an outgrown tier", () => {
  // Three pods at 30% each is a 30% app, not a 90% one. Summing would report
  // every horizontally scaled app as having outgrown its tier.
  const a = attributeApp(app({ instanceCount: 3, runningPods: 3, usedCpuCores: 0.9 }));
  assert.ok(a.cpuUtilisation !== null && Math.abs(a.cpuUtilisation - 0.3) < 0.001);
  assert.equal(a.findings.filter((f) => f.kind === "outgrown-tier").length, 0);
});

test("memory near the reservation is the customer's problem, not a neighbour's", () => {
  // Memory is request == limit on every tier, so this cannot spill onto anyone
  // else — it OOMs the app that caused it.
  const a = attributeApp(app({ usedMemoryBytes: 500 * MIB }));
  const f = a.findings.find((x) => x.kind === "memory-pressure");
  assert.ok(f);
  assert.equal(f.against, "customer");
});

test("unread usage is a finding, never a quiet app", () => {
  // The defect this lane keeps finding, in the place where it would understate
  // a customer's consumption and make an unprofitable app look fine.
  const a = attributeApp(app({ usedCpuCores: null, usedMemoryBytes: null }));
  assert.equal(a.cpuUtilisation, null);
  assert.ok(a.findings.some((f) => f.kind === "unobserved"));
  assert.equal(a.findings.filter((f) => f.kind === "outgrown-tier").length, 0, "cannot claim it is fine either");
});

test("partially unread pods understate consumption and say so", () => {
  const a = attributeApp(app({ instanceCount: 3, runningPods: 3, unreadablePods: 2 }));
  const f = a.findings.find((x) => x.kind === "unobserved");
  assert.ok(f);
  assert.match(f.detail, /understated/);
});

test("an unreadable pod memory request cannot be read as matching the tier", () => {
  const a = attributeApp(app({ podMemoryBytes: null }));
  assert.ok(a.findings.some((f) => f.kind === "unobserved"));
  assert.equal(a.findings.filter((f) => f.kind === "tier-drift").length, 0, "unknown is not drift either");
});

test("an app whose price does not cover its cost is counted", () => {
  // Uses a real tier with a fabricated cost, since every shipped tier is
  // currently profitable — the check must work before one is not.
  const loss = { ...STARTER, costUsd: STARTER.priceUsd + 5 };
  const a = attributeApp(app({ tier: loss }));
  assert.ok(a.marginUsd < 0);
  const fleet = attributeFleet([a]);
  assert.equal(fleet.unprofitable, 1);
});

test("the fleet reports the worst margin first", () => {
  const good = attributeApp(app({ projectRef: "good" }));
  const bad = attributeApp(app({ projectRef: "bad", tier: { ...STARTER, costUsd: 99 } }));
  const fleet = attributeFleet([good, bad]);
  assert.equal(fleet.apps[0].projectRef, "bad");
  assert.equal(fleet.unprofitable, 1);
});

test("an unobserved app is not counted as having a real finding", () => {
  // Otherwise "3 apps with findings" would mostly mean "3 apps we failed to
  // read", and the number would stop meaning anything.
  const fleet = attributeFleet([attributeApp(app({ usedCpuCores: null, usedMemoryBytes: null }))]);
  assert.equal(fleet.withFindings, 0);
  assert.equal(fleet.unobserved, 1);
});
