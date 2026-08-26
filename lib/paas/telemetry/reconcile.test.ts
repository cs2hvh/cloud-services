/**
 * Fleet reconciliation tests.
 *
 * Runs with zero dependencies:  node --test lib/paas/telemetry/reconcile.test.ts
 * (Node 24 strips types natively; node:test and node:assert are built in.)
 *
 * The anchor case is not synthetic. `today's incident` replays the exact
 * shape of what happened on 2026-08-26: LKE cluster 647920 `ahura-v2-dev`,
 * two g6-standard-4 nodes and one NodeBalancer running in in-bom-2, with
 * paas.clusters and paas.build_vms both empty. $0.159/hr, $116.07/month,
 * recorded nowhere. If this test ever passes with `clean: true`, the module
 * has stopped doing the one job it was built for.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MONTH_HOURS,
  RESERVED_STALE_MS,
  parseNodeClusterId,
  reconcile,
  type BuildVmRecord,
  type ClusterRecord,
  type Pricing,
  type RawInstance,
  type RawLkeCluster,
  type RawNodeBalancer,
  type ReconcileInput,
} from "./reconcile.ts";

// Real Linode prices for the shapes v2 actually runs.
const HOURLY: Record<string, number> = {
  "g6-standard-4": 0.072, // 8GB/4vCPU — the dev cluster's node type
  "g6-standard-2": 0.036, // build VM
  "g6-dedicated-16": 0.432, // 32GB/16vCPU — the production shape in the plan
};

const pricing: Pricing = {
  instanceHourly: (t) => HOURLY[t],
  nodeBalancerHourly: 0.015,
  lkeHaHourly: 60 / MONTH_HOURS,
};

const NOW = new Date("2026-08-26T12:00:00Z");

function input(over: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    lkeClusters: [],
    instances: [],
    nodeBalancers: [],
    clusterRows: [],
    buildVmRows: [],
    pricing,
    now: NOW,
    v2Tag: "ahura-v2",
    buildTag: "ahura-v2-build",
    ...over,
  };
}

function cluster(over: Partial<RawLkeCluster> = {}): RawLkeCluster {
  return {
    id: 647920,
    label: "ahura-v2-dev",
    region: "in-bom-2",
    k8s_version: "1.36.3",
    tags: ["ahura-v2"],
    ha: false,
    ...over,
  };
}

function node(n: number, over: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 900000 + n,
    label: `lke647920-1234-abcdef${n}`,
    region: "in-bom-2",
    type: "g6-standard-4",
    status: "running",
    tags: [],
    ...over,
  };
}

function nb(over: Partial<RawNodeBalancer> = {}): RawNodeBalancer {
  return { id: 55501, label: "ccm-ahura-v2-dev", lkeClusterId: 647920, ...over };
}

function buildVm(over: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 700001,
    label: "ahura-v2-build-abc123",
    region: "in-bom-2",
    type: "g6-standard-2",
    status: "running",
    tags: ["ahura-v2-build"],
    ...over,
  };
}

function clusterRow(over: Partial<ClusterRecord> = {}): ClusterRecord {
  return {
    ref: "cls_live",
    name: "ahura-v2-dev",
    region: "in-bom-2",
    lke_cluster_id: 647920,
    k8s_version: "1.36.3",
    state: "ready",
    created_at: NOW.toISOString(),
    ...over,
  };
}

function vmRow(over: Partial<BuildVmRecord> = {}): BuildVmRecord {
  return {
    ref: "bvm_live",
    linode_id: 700001,
    region: "in-bom-2",
    instance_type: "g6-standard-2",
    state: "running",
    expires_at: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
    created_at: NOW.toISOString(),
    ...over,
  };
}

function closeTo(actual: number, expected: number, msg: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${msg}: expected ~${expected}, got ${actual}`,
  );
}

function only(report: ReturnType<typeof reconcile>, status: string) {
  const f = report.findings.filter((x) => x.status === status);
  assert.equal(f.length, 1, `expected exactly one '${status}' finding, got ${f.length}`);
  return f[0];
}

// ── the node-attribution convention ─────────────────────────────────────────

test("LKE node labels resolve to their cluster id", () => {
  assert.equal(parseNodeClusterId("lke647920-1234-abcdef01"), 647920);
  assert.equal(parseNodeClusterId("lke1-2-3"), 1);
});

test("a label that is not an LKE node resolves to null, never to a wrong cluster", () => {
  assert.equal(parseNodeClusterId("ahura-v2-build-abc123"), null);
  assert.equal(parseNodeClusterId("lke-no-digits-here"), null);
  assert.equal(parseNodeClusterId("my-lke647920-node"), null); // must anchor at start
  assert.equal(parseNodeClusterId(""), null);
});

// ── the incident this module exists for ─────────────────────────────────────

test("today's incident: live cluster, empty tables, $116/month recorded nowhere", () => {
  const r = reconcile(
    input({
      lkeClusters: [cluster()],
      instances: [node(1), node(2)],
      nodeBalancers: [nb()],
      clusterRows: [], // both tables sat empty while the money ran
      buildVmRows: [],
    }),
  );

  const f = only(r, "unrecorded");
  assert.equal(f.kind, "lke");
  assert.equal(f.cloudId, 647920);
  assert.equal(f.ref, null);
  assert.equal(f.unaccounted, true);
  assert.equal(f.actionable, true);

  // Nodes and the NodeBalancer are attributed to the cluster, not reported
  // as separate unrelated resources.
  assert.equal(r.findings.length, 1);
  assert.match(f.detail, /2 nodes \+ 1 nodebalancer/);

  closeTo(f.hourly as number, 0.159, "cluster hourly");
  closeTo(r.unaccountedHourly, 0.159, "unaccounted hourly");
  closeTo(r.unaccountedHourly * MONTH_HOURS, 116.07, "unaccounted monthly");
  assert.equal(r.clean, false);
});

test("once the cluster is recorded, the same infrastructure reports clean", () => {
  const r = reconcile(
    input({
      lkeClusters: [cluster()],
      instances: [node(1), node(2)],
      nodeBalancers: [nb()],
      clusterRows: [clusterRow()],
    }),
  );

  assert.equal(r.clean, true);
  assert.equal(r.unaccountedHourly, 0);
  closeTo(r.totalHourly, 0.159, "total is still charged, just accounted for");
  assert.equal(only(r, "tracked").ref, "cls_live");
});

test("HA control plane is priced; a standard control plane is free", () => {
  const std = reconcile(input({ lkeClusters: [cluster()], clusterRows: [clusterRow()] }));
  closeTo(std.totalHourly, 0, "standard control plane costs nothing on its own");

  const ha = reconcile(
    input({ lkeClusters: [cluster({ ha: true })], clusterRows: [clusterRow()] }),
  );
  closeTo(ha.totalHourly * MONTH_HOURS, 60, "HA control plane is $60/mo");
  assert.match(only(ha, "tracked").detail, /HA control plane/);
});

// ── build VMs ───────────────────────────────────────────────────────────────

test("a leased VM with no row is unrecorded — the crash-between-lease-and-record case", () => {
  const r = reconcile(input({ instances: [buildVm()], buildVmRows: [] }));

  const f = only(r, "unrecorded");
  assert.equal(f.kind, "build-vm");
  assert.equal(f.unaccounted, true);
  closeTo(r.unaccountedHourly, 0.036, "leaked build VM cost");
});

test("a row claiming 'destroyed' while the instance still bills is denied, not tracked", () => {
  const r = reconcile(
    input({
      instances: [buildVm()],
      buildVmRows: [vmRow({ state: "destroyed", destroyed_at: NOW.toISOString() })],
    }),
  );

  const f = only(r, "denied");
  assert.equal(f.unaccounted, true, "the control plane denies this exists, so it is unaccounted");
  assert.equal(f.actionable, true);
  closeTo(r.unaccountedHourly, 0.036, "denied spend counts as unaccounted");
  assert.match(f.action, /reported success it did not achieve/);
});

test("a live VM past expires_at is expired — accounted for, but the reaper missed it", () => {
  const r = reconcile(
    input({
      instances: [buildVm()],
      buildVmRows: [
        vmRow({ expires_at: new Date(NOW.getTime() - 2 * 3_600_000).toISOString() }),
      ],
    }),
  );

  const f = only(r, "expired");
  assert.equal(f.actionable, true);
  assert.equal(f.unaccounted, false, "a row exists and admits it is alive");
  assert.equal(r.unaccountedHourly, 0);
  assert.match(f.detail, /2\.0h past expires_at/);
});

test("a VM inside its deadline is tracked", () => {
  const r = reconcile(input({ instances: [buildVm()], buildVmRows: [vmRow()] }));
  assert.equal(r.clean, true);
  assert.equal(only(r, "tracked").ref, "bvm_live");
});

// ── rows with no cloud resource ─────────────────────────────────────────────

test("a row claiming a linode that Linode does not list is a phantom, and costs nothing", () => {
  const r = reconcile(input({ instances: [], buildVmRows: [vmRow()] }));

  const f = only(r, "phantom");
  assert.equal(f.hourly, 0);
  assert.equal(f.unaccounted, false);
  assert.equal(f.actionable, true);
  assert.equal(r.unaccountedHourly, 0, "a phantom is a stale record, not spend");
});

test("a phantom cluster row is flagged because placement schedules onto this table", () => {
  const r = reconcile(input({ lkeClusters: [], clusterRows: [clusterRow()] }));
  const f = only(r, "phantom");
  assert.equal(f.kind, "cluster-row");
  assert.match(f.action, /placement reads this table/);
});

test("a row correctly recording a destroyed VM is not a finding at all", () => {
  const r = reconcile(
    input({ instances: [], buildVmRows: [vmRow({ state: "destroyed" })] }),
  );
  assert.equal(r.findings.length, 0);
  assert.equal(r.clean, true);
});

test("a retired cluster row with no cluster is not a finding", () => {
  const r = reconcile(input({ lkeClusters: [], clusterRows: [clusterRow({ state: "retired" })] }));
  assert.equal(r.findings.length, 0);
  assert.equal(r.clean, true);
});

// ── reserved: benign by design, until it isn't ──────────────────────────────

test("a freshly reserved row with no cloud id is benign — that is RECORD BEFORE CREATE working", () => {
  const r = reconcile(
    input({
      buildVmRows: [vmRow({ linode_id: null, state: "requested", created_at: NOW.toISOString() })],
    }),
  );

  const f = only(r, "reserved");
  assert.equal(f.hourly, 0);
  assert.equal(f.actionable, false);
  assert.equal(r.clean, true, "a reservation in flight must not page anyone");
});

test("a reservation that never attached is evidence of a crash, and becomes actionable", () => {
  const old = new Date(NOW.getTime() - RESERVED_STALE_MS - 60_000).toISOString();
  const r = reconcile(
    input({ buildVmRows: [vmRow({ linode_id: null, state: "requested", created_at: old })] }),
  );

  const f = only(r, "reserved");
  assert.equal(f.actionable, true);
  assert.equal(f.hourly, 0, "still costs nothing — it never got an instance");
  assert.equal(r.clean, false);
  assert.match(f.action, /crashed between RESERVE and CREATE/);
});

// ── disagreement between row and reality ────────────────────────────────────

test("a row disagreeing with Linode on region or version is mismatched", () => {
  const r = reconcile(
    input({
      lkeClusters: [cluster()],
      instances: [node(1)],
      clusterRows: [clusterRow({ region: "ap-west", k8s_version: "1.35.0" })],
    }),
  );

  const f = only(r, "mismatched");
  assert.equal(f.actionable, true);
  assert.equal(f.unaccounted, false, "both agree it exists; they disagree on detail");
  assert.match(f.detail, /region ap-west != in-bom-2/);
  assert.match(f.detail, /k8s_version 1\.35\.0 != 1\.36\.3/);
});

test("a row marked retired while the cluster still bills is denied, and counts as unaccounted", () => {
  const r = reconcile(
    input({
      lkeClusters: [cluster()],
      instances: [node(1), node(2)],
      nodeBalancers: [nb()],
      clusterRows: [clusterRow({ state: "retired" })],
    }),
  );

  const f = only(r, "denied");
  assert.equal(f.unaccounted, true);
  closeTo(r.unaccountedHourly, 0.159, "a retired row does not stop the billing");
});

// ── honesty about what is not known ─────────────────────────────────────────

test("an unknown Linode type reports an unknown price, never $0", () => {
  const r = reconcile(
    input({
      instances: [buildVm({ type: "g6-standard-99" })],
      buildVmRows: [],
    }),
  );

  const f = only(r, "unrecorded");
  assert.equal(f.hourly, null, "null means unknown; 0 would be a lie");
  assert.deepEqual(r.unpriced, ["build VM ahura-v2-build-abc123 (type g6-standard-99)"]);
  assert.equal(r.clean, false, "an understated cost report is not a clean one");
  assert.equal(r.unaccountedHourly, 0, "unknown cost must not be summed as zero");
});

test("an unknown node type poisons only its own cluster's price, and says so", () => {
  const r = reconcile(
    input({
      lkeClusters: [cluster()],
      instances: [node(1), node(2, { type: "g6-future-8" })],
      nodeBalancers: [nb()],
      clusterRows: [clusterRow()],
    }),
  );

  assert.equal(only(r, "tracked").hourly, null);
  assert.equal(r.totalHourly, 0, "a partial sum would understate the bill");
  assert.equal(r.unpriced.length, 1);
  assert.equal(r.clean, false);
});

// ── resources that are not ours ─────────────────────────────────────────────

test("foreign resources are listed and priced separately, never mixed into v2 spend", () => {
  const r = reconcile(
    input({
      lkeClusters: [cluster({ id: 111, label: "someone-elses", tags: [] })],
      instances: [node(1, { label: "lke111-1-a" }), node(9, { label: "unrelated-box", tags: [] })],
      nodeBalancers: [nb({ id: 999, label: "standalone-nb", lkeClusterId: null })],
    }),
  );

  assert.equal(r.totalHourly, 0, "none of this is v2's");
  closeTo(r.foreignHourly, 0.072 + 0.072 + 0.015, "foreign spend is reported, not hidden");
  assert.equal(r.findings.every((f) => f.status === "foreign"), true);
  assert.equal(r.clean, true, "someone else's infrastructure is not our drift");
});

test("a v2-tagged instance matching no node pattern and no VM row is unrecorded", () => {
  const r = reconcile(
    input({ instances: [node(5, { label: "hand-made-box", tags: ["ahura-v2"] })] }),
  );

  const f = only(r, "unrecorded");
  assert.equal(f.kind, "instance");
  assert.equal(f.unaccounted, true);
  closeTo(r.unaccountedHourly, 0.072, "still real money");
});

test("a NodeBalancer whose cluster this token cannot list is still reported", () => {
  const r = reconcile(input({ lkeClusters: [], nodeBalancers: [nb()] }));

  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].kind, "nodebalancer");
  assert.equal(r.findings[0].actionable, true);
  assert.match(r.findings[0].detail, /which this token cannot see/);
});

// ── report shape ────────────────────────────────────────────────────────────

test("findings sort worst-first so the money is the first thing read", () => {
  const r = reconcile(
    input({
      lkeClusters: [cluster(), cluster({ id: 222, label: "recorded", tags: ["ahura-v2"] })],
      instances: [buildVm(), node(1, { label: "lke222-1-a" })],
      nodeBalancers: [],
      clusterRows: [clusterRow({ ref: "cls_two", lke_cluster_id: 222, name: "recorded" })],
      buildVmRows: [
        vmRow({ expires_at: new Date(NOW.getTime() - 3_600_000).toISOString() }),
        vmRow({ ref: "bvm_ghost", linode_id: 123456, state: "running" }),
      ],
    }),
  );

  assert.deepEqual(
    r.findings.map((f) => f.status),
    ["unrecorded", "expired", "phantom", "tracked"],
  );
});

test("build VM cost is separated from standing cost, so it is never projected to a month", () => {
  const r = reconcile(
    input({
      lkeClusters: [cluster()],
      instances: [node(1), node(2), buildVm()],
      nodeBalancers: [nb()],
      clusterRows: [clusterRow()],
      buildVmRows: [vmRow()],
    }),
  );

  closeTo(r.standingHourly, 0.159, "cluster + nodes + nodebalancer persist");
  closeTo(r.transientHourly, 0.036, "the build VM does not");
  closeTo(r.totalHourly, 0.195, "total is still the true hourly rate");

  // The point of the split: projecting the build VM would invent $26/month of
  // spend for a machine that lives for minutes.
  closeTo(r.standingHourly * MONTH_HOURS, 116.07, "only standing spend is projectable");
});

test("an empty account with empty tables is clean", () => {
  const r = reconcile(input());
  assert.equal(r.findings.length, 0);
  assert.equal(r.clean, true);
  assert.equal(r.totalHourly, 0);
  assert.equal(r.unaccountedHourly, 0);
});
