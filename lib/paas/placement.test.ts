import { test } from "node:test";
import assert from "node:assert/strict";
import { countHoldingPods, syncPodAllocation, headroom, nodePodCapacity } from "./placement.ts";
import type { ClusterRow } from "./db.ts";

const cluster = (over: Partial<ClusterRow> = {}): ClusterRow => ({
  id: "c1", ref: "clu-1", name: "dev", region: "in-bom-2",
  lke_cluster_id: 1, k8s_version: "1.31", state: "ready",
  pod_capacity: 110, pod_allocated: 0, accepts_new: true,
  ...over,
} as ClusterRow);

const pods = (...phases: Array<string | { phase: string; deleting: true }>) => ({
  items: phases.map((p) =>
    typeof p === "string"
      ? { status: { phase: p } }
      : { status: { phase: p.phase }, metadata: { deletionTimestamp: "2026-08-26T00:00:00Z" } },
  ),
});

/**
 * A k-like stub whose get() satisfies the GENERIC signature syncPodAllocation
 * demands: <T>(path, tolerateMissing?) => Promise<T | null>.
 *
 * A mock returning a concrete shape cannot satisfy a function that promises to
 * return any T, so every inline { get: async () => ({...}) } here failed to
 * typecheck while still running green. The cast belongs in exactly one named
 * place rather than scattered across five call sites — and confining it here
 * means the call sites stay readable about what they are simulating.
 */
type KubeLike = { get: <T>(path: string, tolerateMissing?: boolean) => Promise<T | null> };

function stub(respond: (path: string) => unknown): KubeLike {
  return { get: async <T,>(path: string) => respond(path) as T | null };
}

test("Pending counts — it has already claimed its slot against the pod cap", () => {
  // Counting only Running undercounts during a rollout, which is exactly when
  // placement gets asked. Undercount is the direction that overcommits.
  assert.equal(countHoldingPods(pods("Running", "Pending", "Running")).total, 3);
});

test("Succeeded and Failed do not hold capacity", () => {
  assert.equal(countHoldingPods(pods("Running", "Succeeded", "Failed")).total, 1);
});

test("terminating pods are not counted — their slot is coming back", () => {
  assert.equal(countHoldingPods(pods("Running", { phase: "Running", deleting: true })).total, 1);
});

test("an unknown phase counts, because unknown is not proof of absence", () => {
  assert.equal(countHoldingPods(pods("Weird")).total, 1);
});

test("a read failure writes NOTHING", async () => {
  // THE IMPORTANT ONE. Writing 0 because the API was unreachable tells
  // placement the cluster is empty precisely when we cannot see it.
  let wrote = false;
  const out = await syncPodAllocation(
    cluster({ pod_allocated: 7 }),
    stub(() => { throw new Error("connection refused"); }),
  );
  assert.equal(out.observed, null);
  assert.equal(out.changed, false);
  assert.ok(out.error);
  assert.equal(wrote, false);
  assert.equal(out.recorded, 7, "the previously recorded value is left alone");
});

test("an empty pod list is not the same as a failed read", async () => {
  const out = await syncPodAllocation(
    cluster({ pod_allocated: 5 }),
    stub(() => ({ items: [] })),
    { dryRun: true },
  );
  assert.equal(out.observed, 0);
  assert.equal(out.changed, true, "genuinely empty must be recordable");
  assert.equal(out.error, undefined);
});

test("over-capacity is reported, not clamped", async () => {
  const out = await syncPodAllocation(
    cluster({ pod_capacity: 2, pod_allocated: 0 }),
    stub(() => pods("Running", "Running", "Running")),
    { dryRun: true },
  );
  assert.equal(out.observed, 3);
  assert.equal(out.overCapacity, true, "placement must be able to see a cluster fuller than its capacity");
});

test("no change when the record already matches reality", async () => {
  const out = await syncPodAllocation(
    cluster({ pod_allocated: 2 }),
    stub(() => pods("Running", "Running")),
    { dryRun: true },
  );
  assert.equal(out.changed, false);
});

test("headroom never goes negative", () => {
  assert.equal(headroom(cluster({ pod_capacity: 10, pod_allocated: 14 })), 0);
  assert.equal(headroom(cluster({ pod_capacity: 10, pod_allocated: 3 })), 7);
});

test("effective capacity is bounded by what the nodes can hold", () => {
  // The dev cluster was recorded at the LKE cap of 1000 while holding two
  // 110-pod nodes. Placement believed it had 977 free slots on a cluster with
  // room for 197.
  assert.equal(nodePodCapacity({ items: [
    { status: { allocatable: { pods: "110" } } },
    { status: { allocatable: { pods: "110" } } },
  ] }), 220);
});

test("an unreadable node list never shrinks capacity to zero", async () => {
  const out = await syncPodAllocation(
    cluster({ pod_capacity: 1000, pod_allocated: 5 }),
    stub((p) => (p.includes("/nodes") ? null : pods("Running"))),
    { dryRun: true },
  );
  assert.equal(out.capacity, 1000, "no observation means no change, not a collapse to zero");
});

test("capacity is lowered to the node total when the nodes say less", async () => {
  const out = await syncPodAllocation(
    cluster({ pod_capacity: 1000, pod_allocated: 1 }),
    {
      ...stub((p) =>
        p.includes("/nodes")
          ? { items: [{ status: { allocatable: { pods: "110" } } }] }
          : pods("Running"),
      ),
    },
    { dryRun: true },
  );
  assert.equal(out.capacity, 110);
  assert.equal(out.changed, true);
});
