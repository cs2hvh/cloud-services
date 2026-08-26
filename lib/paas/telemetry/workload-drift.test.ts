/**
 * Workload reconciliation tests.
 *
 *   node --test lib/paas/telemetry/workload-drift.test.ts
 *
 * The anchor is the real defect: every deploy used to leave the previous
 * Deployment at full replicas, doubling the pod count per deploy, and no
 * reconciler could see it because the node and the cluster were both recorded.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capacityDrift,
  reconcileWorkloads,
  workloadFrom,
  type DeploymentRowLike,
  type WorkloadLike,
} from "./workload-drift.ts";

const PROJECT = "prj-node-js-getting-started";

function wl(over: Partial<WorkloadLike> = {}): WorkloadLike {
  return {
    name: "dpl9f6d095cc9",
    namespace: "app-prj-node-js-getting-started",
    deploymentRef: "dpl9f6d095cc9",
    projectRef: PROJECT,
    desiredReplicas: 1,
    readyReplicas: 1,
    ...over,
  };
}

function row(over: Partial<DeploymentRowLike> = {}): DeploymentRowLike {
  return {
    ref: "dpl9f6d095cc9",
    state: "ready",
    project_id: "p1",
    created_at: "2026-08-26T10:00:00Z",
    ...over,
  };
}

function run(over: Partial<Parameters<typeof reconcileWorkloads>[0]> = {}) {
  return reconcileWorkloads({ workloads: [], deployments: [], placements: [], ...over });
}

const only = (r: ReturnType<typeof reconcileWorkloads>) => {
  assert.equal(r.findings.length, 1);
  return r.findings[0];
};

// ── the defect fleet drift cannot see ───────────────────────────────────────

test("a workload with no deployment row is unrecorded, and its pods are unaccounted", () => {
  const r = run({ workloads: [wl({ readyReplicas: 2 })] });

  const f = only(r);
  assert.equal(f.status, "unrecorded");
  assert.equal(f.pods, 2);
  assert.equal(r.unaccountedPods, 2);
  assert.match(f.action, /placement believes is free/);
  assert.equal(r.clean, false);
});

test("a superseded deployment still at full replicas is flagged — the real cost multiplier", () => {
  const r = run({
    workloads: [wl({ deploymentRef: "dpl_old" }), wl({ deploymentRef: "dpl_new" })],
    deployments: [
      row({ ref: "dpl_old", created_at: "2026-08-26T09:00:00Z" }),
      row({ ref: "dpl_new", created_at: "2026-08-26T11:00:00Z" }),
    ],
  });

  const superseded = r.findings.find((f) => f.status === "superseded-live");
  assert.ok(superseded);
  assert.equal(superseded.deploymentRef, "dpl_old");
  assert.match(superseded.detail, /superseded by dpl_new/);
  assert.match(superseded.action, /Correct if held warm for instant rollback/, "innocent case stated first");

  // The newest one is fine.
  assert.equal(r.findings.find((f) => f.deploymentRef === "dpl_new")?.status, "healthy");
});

test("a superseded deployment scaled to zero is NOT flagged — that is the fix working", () => {
  const r = run({
    workloads: [
      wl({ deploymentRef: "dpl_old", desiredReplicas: 0, readyReplicas: 0 }),
      wl({ deploymentRef: "dpl_new" }),
    ],
    deployments: [
      row({ ref: "dpl_old", created_at: "2026-08-26T09:00:00Z" }),
      row({ ref: "dpl_new", created_at: "2026-08-26T11:00:00Z" }),
    ],
  });

  assert.equal(r.findings.some((f) => f.status === "superseded-live"), false);
  assert.equal(r.clean, true, "keeping the object at zero replicas is correct — rollback stays a scale-up");
  assert.equal(r.observedPods, 1);
});

test("deployments of DIFFERENT projects never supersede each other", () => {
  const r = run({
    workloads: [wl({ deploymentRef: "dpl_a" }), wl({ deploymentRef: "dpl_b" })],
    deployments: [
      row({ ref: "dpl_a", project_id: "p1", created_at: "2026-08-26T09:00:00Z" }),
      row({ ref: "dpl_b", project_id: "p2", created_at: "2026-08-26T11:00:00Z" }),
    ],
  });

  assert.equal(r.findings.some((f) => f.status === "superseded-live"), false);
  assert.equal(r.clean, true);
});

// ── the only status a customer can see ──────────────────────────────────────

test("a ready row wanting replicas and getting none is DOWN, not healthy", () => {
  // Found by running this against the live cluster: two deployments showed
  // 0/1 pods with a row saying ready, and the first version called them
  // healthy. The control plane and every alias believe those apps are live.
  const r = run({
    workloads: [wl({ desiredReplicas: 1, readyReplicas: 0 })],
    deployments: [row()],
  });

  const f = only(r);
  assert.equal(f.status, "down");
  assert.equal(f.actionable, true);
  assert.match(f.action, /crash loop or a failed image pull/);
  assert.equal(r.clean, false);
});

test("down sorts above every bookkeeping finding", () => {
  const r = run({
    workloads: [
      wl({ deploymentRef: "dpl_unknown", readyReplicas: 4 }),
      wl({ deploymentRef: "dpl_down", desiredReplicas: 1, readyReplicas: 0 }),
    ],
    deployments: [row({ ref: "dpl_down" })],
  });

  assert.equal(r.findings[0].status, "down");
});

test("a deliberately scaled-to-zero deployment is not down — nothing was asked for", () => {
  const r = run({
    workloads: [wl({ desiredReplicas: 0, readyReplicas: 0 })],
    deployments: [row()],
  });

  assert.equal(only(r).status, "healthy");
  assert.equal(r.clean, true);
});

// ── the control plane contradicting reality ─────────────────────────────────

test("a row saying error while pods serve is terminal-live, and counts as unaccounted", () => {
  const r = run({
    workloads: [wl({ readyReplicas: 3 })],
    deployments: [row({ state: "error" })],
  });

  const f = only(r);
  assert.equal(f.status, "terminal-live");
  assert.equal(r.unaccountedPods, 3, "nothing intends these pods to exist");
  assert.match(f.action, /believes this deployment failed/);
});

test("a ready row with no Deployment object is a phantom and costs no pods", () => {
  const r = run({ deployments: [row()] });

  const f = only(r);
  assert.equal(f.status, "phantom");
  assert.equal(f.pods, 0);
  assert.equal(r.unaccountedPods, 0, "a phantom is a stale record, not consumed capacity");
  assert.match(f.action, /rollback to it would not work/);
});

test("a non-ready row with no workload is not a finding — it never claimed to be serving", () => {
  for (const state of ["queued", "building", "publishing", "error", "canceled"]) {
    const r = run({ deployments: [row({ state })] });
    assert.equal(r.findings.length, 0, state);
  }
});

test("a deployment queued for a long time is not drift — the queue is the design", () => {
  // Webhook-driven deploys mean rows can sit queued before a worker picks
  // them up, which the infrastructure lane flagged as newly normal. A
  // reconciler that called a long queue a fault would page on the build
  // tier working as intended.
  const r = run({
    deployments: [row({ state: "queued", created_at: "2020-01-01T00:00:00Z" })],
  });

  assert.equal(r.findings.length, 0, "age alone is not evidence of a problem here");
  assert.equal(r.clean, true);
});

// ── placement accounting ────────────────────────────────────────────────────

test("a running workload with no placement row breaks capacity accounting", () => {
  const r = run({
    workloads: [wl()],
    deployments: [row()],
    placements: [{ ref: "dpl_other", namespace: "app-prj-other" }],
  });

  const f = only(r);
  assert.equal(f.status, "unplaced");
  assert.match(f.action, /scheduled against a number that is wrong/);
});

test("with placements recorded, a placed workload is healthy", () => {
  const r = run({
    workloads: [wl()],
    deployments: [row()],
    placements: [{ ref: "dpl9f6d095cc9", namespace: "app-prj-node-js-getting-started" }],
  });

  assert.equal(only(r).status, "healthy");
  assert.equal(r.clean, true);
});

test("when placements are not being written at all, that is not reported per-workload", () => {
  // An empty placements table means the feature is not wired yet, not that
  // every workload is individually broken. Reporting 500 unplaced findings
  // for one missing writer is noise.
  const r = run({ workloads: [wl()], deployments: [row()], placements: [] });
  assert.equal(only(r).status, "healthy");
});

// ── capacity ────────────────────────────────────────────────────────────────

test("recorded pod allocation is compared against reality", () => {
  assert.deepEqual(capacityDrift(5, 5), { recorded: 5, observed: 5, drift: 0, significant: false });
  assert.equal(capacityDrift(5, 6).significant, false, "one pod is scheduling noise");
  assert.equal(capacityDrift(5, 40).significant, true);
  assert.equal(capacityDrift(40, 5).drift, -35, "drifting high hides sellable capacity");
  assert.equal(capacityDrift(40, 5).significant, true);
});

test("capacity is compared cluster-wide, not against the tenant count", () => {
  // The real case: pod_allocated read 23 (every pod, because the LKE cap counts
  // kube-system, Traefik, the registry and the DaemonSets) while tenant
  // workloads were 3. Passing the tenant count reported drift -20 on a
  // perfectly consistent cluster. A reconciler crying wolf gets muted, and
  // then it is not there when the number is genuinely wrong.
  const tenantPods = 3;
  const allPodsIncludingPlatform = 23;

  assert.equal(capacityDrift(23, tenantPods).significant, true, "the bug: false alarm");
  assert.equal(
    capacityDrift(23, allPodsIncludingPlatform).significant,
    false,
    "the fix: consistent cluster reads consistent",
  );
  assert.equal(capacityDrift(23, allPodsIncludingPlatform).drift, 0);
});

// ── parsing ─────────────────────────────────────────────────────────────────

test("the deployment label is authoritative, the object name only a fallback", () => {
  const labelled = workloadFrom({
    metadata: { name: "renamed-somehow", namespace: "ns", labels: { "ahura.cloud/deployment": "dpl_real", "ahura.cloud/project": "prj_1" } },
    spec: { replicas: 2 },
    status: { readyReplicas: 1 },
  });

  assert.equal(labelled.deploymentRef, "dpl_real");
  assert.equal(labelled.projectRef, "prj_1");
  assert.equal(labelled.desiredReplicas, 2);
  assert.equal(labelled.readyReplicas, 1);

  const unlabelled = workloadFrom({ metadata: { name: "dpl_fallback", namespace: "ns" } });
  assert.equal(unlabelled.deploymentRef, "dpl_fallback");
  assert.equal(unlabelled.projectRef, null);
  assert.equal(unlabelled.readyReplicas, 0, "a Deployment with no ready replicas holds no pods");
});

// ── shape ───────────────────────────────────────────────────────────────────

test("findings sort worst-first, then by pods held", () => {
  const r = run({
    workloads: [wl({ deploymentRef: "dpl_small", readyReplicas: 1 }), wl({ deploymentRef: "dpl_big", readyReplicas: 9 })],
    deployments: [],
  });

  assert.deepEqual(r.findings.map((f) => f.deploymentRef), ["dpl_big", "dpl_small"]);
  assert.equal(r.unaccountedPods, 10);
});

test("an empty cluster with an empty table is clean", () => {
  const r = run();
  assert.equal(r.findings.length, 0);
  assert.equal(r.clean, true);
  assert.equal(r.observedPods, 0);
});
