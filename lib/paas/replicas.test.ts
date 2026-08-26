import { test } from "node:test";
import assert from "node:assert/strict";
import { replicaStates, type DeploymentFact } from "./replicas.ts";

const ready = (ref: string): DeploymentFact => ({ ref, state: "ready", image_digest: "sha256:abc" });

/** A fake cluster. `null` means 404, throwing means transport failure. */
function fakeClient(table: Record<string, { replicas: number; readyReplicas: number } | null | "throw">) {
  return {
    get: async <T,>(path: string): Promise<T | null> => {
      const name = path.split("/").pop()!;
      const v = table[name];
      if (v === "throw") throw new Error("connection refused");
      if (v == null) return null;
      return { spec: { replicas: v.replicas }, status: { readyReplicas: v.readyReplicas } } as T;
    },
  };
}

test("an alias target with ready replicas is serving", async () => {
  const out = await replicaStates("prj-1", [ready("dpl-a")], {
    servingRef: "dpl-a",
    client: fakeClient({ "dpl-a": { replicas: 1, readyReplicas: 1 } }),
  });
  assert.equal(out[0].status, "serving");
  assert.equal(out[0].rollable, true);
});

test("ready replicas that nothing routes to are NOT serving", async () => {
  // The distinction that stops an operator concluding an app is fine while its
  // hostname returns 502.
  const out = await replicaStates("prj-1", [ready("dpl-old")], {
    servingRef: "dpl-new",
    client: fakeClient({ "dpl-old": { replicas: 1, readyReplicas: 1 } }),
  });
  assert.equal(out[0].status, "running-unrouted");
});

test("a kept object at zero replicas is rollable, not deleted", async () => {
  const out = await replicaStates("prj-1", [ready("dpl-z")], {
    servingRef: "dpl-new",
    client: fakeClient({ "dpl-z": { replicas: 0, readyReplicas: 0 } }),
  });
  assert.equal(out[0].status, "scaled-to-zero");
  assert.equal(out[0].rollable, true, "scaled to zero is a scale-up away from serving");
});

test("no Kubernetes object still rollable — re-apply from the recorded image", async () => {
  const out = await replicaStates("prj-1", [ready("dpl-gone")], {
    client: fakeClient({ "dpl-gone": null }),
  });
  assert.equal(out[0].status, "not-applied");
  assert.equal(out[0].rollable, true);
});

test("a cluster failure reports unknown with NULL counts, never zero", async () => {
  // THE IMPORTANT ONE. A zero would render as "scaled to zero" — telling the
  // user their app is deliberately off when in truth we could not look. Same
  // class as v1 returning ciphertext when it could not decrypt.
  const out = await replicaStates("prj-1", [ready("dpl-a")], {
    servingRef: "dpl-a",
    client: fakeClient({ "dpl-a": "throw" }),
  });
  assert.equal(out[0].status, "unknown");
  assert.equal(out[0].replicas, null);
  assert.equal(out[0].readyReplicas, null);
  assert.notEqual(out[0].replicas, 0, "unknown must never be indistinguishable from zero");
});

test("a build that produced no image is not rollable", async () => {
  const out = await replicaStates("prj-1", [{ ref: "dpl-err", state: "error", image_digest: null }], {
    client: fakeClient({ "dpl-err": null }),
  });
  assert.equal(out[0].rollable, false);
  assert.equal(out[0].status, "no-image");
});

test("rollability survives a cluster outage, because it is a fact about the build", async () => {
  const out = await replicaStates("prj-1", [ready("dpl-a")], {
    client: fakeClient({ "dpl-a": "throw" }),
  });
  assert.equal(out[0].rollable, true, "we cannot see the cluster, but the image still exists");
});

test("no deployments means no cluster calls at all", async () => {
  let called = false;
  const out = await replicaStates("prj-1", [], {
    client: { get: async () => { called = true; return null; } },
  });
  assert.deepEqual(out, []);
  assert.equal(called, false);
});

test("each deployment is looked up in its own project namespace", async () => {
  const seen: string[] = [];
  await replicaStates("prj-xyz", [ready("dpl-a")], {
    client: { get: async (p: string) => { seen.push(p); return null; } },
  });
  assert.ok(seen[0].includes("/namespaces/app-prj-xyz/"), seen[0]);
});

test("an asleep deployment is NOT reported as superseded", () => {
  // The distinction a user reads very differently: superseded is an old build,
  // asleep is their LIVE app, idle and waking on the next request. Rendering
  // both as "scaled to zero" shows someone's production app as stopped.
  return replicaStates("prj-1", [{ ...ready("dpl-a"), scaled_to_zero_at: "2026-08-26T14:00:00Z" }], {
    servingRef: "dpl-a",
    client: fakeClient({ "dpl-a": { replicas: 0, readyReplicas: 0 } }),
  }).then((out) => {
    assert.equal(out[0].status, "asleep");
    assert.equal(out[0].rollable, true);
  });
});

test("asleep wins over a running pod during the wake window", async () => {
  // The activator scales up before the reconciler clears the flag, so both are
  // briefly true. Reporting "serving" there is right about the pod and wrong
  // about what the control plane is about to do.
  const out = await replicaStates("prj-1", [{ ...ready("dpl-a"), scaled_to_zero_at: "2026-08-26T14:00:00Z" }], {
    servingRef: "dpl-a",
    client: fakeClient({ "dpl-a": { replicas: 1, readyReplicas: 1 } }),
  });
  assert.equal(out[0].status, "asleep");
});

test("omitting scaled_to_zero_at keeps the old behaviour", async () => {
  const out = await replicaStates("prj-1", [ready("dpl-a")], {
    servingRef: "dpl-a",
    client: fakeClient({ "dpl-a": { replicas: 1, readyReplicas: 1 } }),
  });
  assert.equal(out[0].status, "serving");
});
