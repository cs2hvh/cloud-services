import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkingSet, podFootprints, readOverhead, densityAtOverhead } from "./sandbox.ts";

const MIB = 1024 ** 2;
const W = "container_memory_working_set_bytes";

// Real lines from the live kubelet on 2026-08-26, trimmed to the labels that
// matter. The two pods differ in exactly the way that breaks naive parsing.
const POD_SLICE = "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-podf5186df9_ec8b_4dc5_a2ed_7619e3fec282.slice";
const CAL_SLICE = "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod0cd00f03_6fdc_45ae_ae2c_27597b513786.slice";

const SANDBOXED = [
  `${W}{container="",id="${POD_SLICE}",namespace="app-prj-13cc6161e14a",pod="dpl-e2404975a02e-7b84c85889-kh29b"} 9.3199872e+07`,
  `${W}{container="",id="${POD_SLICE}/cri-containerd-7034d9cc.scope",namespace="app-prj-13cc6161e14a",pod="dpl-e2404975a02e-7b84c85889-kh29b"} 9.3409280e+07`,
].join("\n");

const RUNC = [
  `${W}{container="",id="${CAL_SLICE}",namespace="kube-system",pod="calico-node-jhv6z"} 2.025e+08`,
  `${W}{container="",id="${CAL_SLICE}/cri-containerd-30718ad6.scope",namespace="kube-system",pod="calico-node-jhv6z"} 2.09715e+05`,
  `${W}{container="calico-node",id="${CAL_SLICE}/cri-containerd-c3fdf02c.scope",namespace="kube-system",pod="calico-node-jhv6z"} 1.967e+08`,
].join("\n");

test("node-level rollups are dropped, not counted as a pod", () => {
  const text = [
    `${W}{container="",id="/",namespace="",pod=""} 1.253834752e+09`,
    `${W}{container="",id="/kubepods.slice",namespace="",pod=""} 5.6553e+08`,
    SANDBOXED,
  ].join("\n");
  const pods = podFootprints(parseWorkingSet(text));
  assert.equal(pods.length, 1, "only the real pod should survive");
  assert.equal(pods[0].pod, "dpl-e2404975a02e-7b84c85889-kh29b");
});

test("a sandboxed pod is opaque — no named containers, and that is not zero usage", () => {
  const [f] = podFootprints(parseWorkingSet(SANDBOXED));
  assert.equal(f.namedContainers, 0);
  assert.equal(f.namedContainerBytes, 0);
  assert.equal(f.opaque, true);
  // The defect this module exists to prevent: the pod costs ~89 MiB and a
  // container-sum would have reported nothing at all.
  assert.ok(f.wholePodBytes !== null && f.wholePodBytes > 80 * MIB);
});

test("the pod slice and its sandbox scope are not added together", () => {
  // Both report ~89 MiB on a sandboxed pod. Summing would claim ~178 and make
  // the sandbox look twice as expensive as it is.
  const [f] = podFootprints(parseWorkingSet(SANDBOXED));
  assert.ok(f.wholePodBytes !== null && f.wholePodBytes < 100 * MIB, `got ${(f.wholePodBytes! / MIB).toFixed(1)} MiB`);
});

test("a runc pod is recognised as not sandboxed", () => {
  const [f] = podFootprints(parseWorkingSet(RUNC));
  assert.equal(f.opaque, false);
  assert.equal(f.namedContainers, 1);
  const r = readOverhead(f, 128 * MIB);
  assert.equal(r.verdict, "not-sandboxed");
  assert.equal(r.declaredExceedsWholePod, false, "a non-sandboxed pod must never produce an over-reservation claim");
});

test("a pod with no cgroup series reads as unobserved, never as free", () => {
  const r = readOverhead(
    { namespace: "app-prj-x", pod: "dpl-gone", wholePodBytes: null, namedContainerBytes: 0, namedContainers: 0, opaque: false },
    128 * MIB,
  );
  assert.equal(r.verdict, "unobserved");
  assert.equal(r.declaredVsWholePod, null);
  assert.equal(r.declaredExceedsWholePod, false);
  assert.match(r.note, /not the same as costing nothing/);
});

test("the declared charge is bounded above by the whole pod, app included", () => {
  const [f] = podFootprints(parseWorkingSet(SANDBOXED));
  const r = readOverhead(f, 128 * MIB);
  assert.equal(r.verdict, "bounded");
  assert.equal(r.declaredExceedsWholePod, true);
  assert.ok(r.declaredVsWholePod !== null && r.declaredVsWholePod > 1);
});

test("a declaration inside the pod's footprint is not flagged", () => {
  const [f] = podFootprints(parseWorkingSet(SANDBOXED));
  const r = readOverhead(f, 32 * MIB);
  assert.equal(r.verdict, "bounded");
  assert.equal(r.declaredExceedsWholePod, false);
  assert.match(r.note, /not separable/);
});

test("density responds to the declaration, which is the point of measuring it", () => {
  const usable = 55.77 * 1024 * MIB;
  const at128 = densityAtOverhead(usable, 512 * MIB, 128 * MIB, 110);
  const at32 = densityAtOverhead(usable, 512 * MIB, 32 * MIB, 110);
  assert.ok(at32 > at128, "a smaller sandbox charge must fit more pods");
  assert.ok(at128 >= 85 && at128 <= 95, `expected ~89 at 128Mi, got ${at128}`);
});

test("density never exceeds the kubelet cap however small the charge", () => {
  const usable = 55.77 * 1024 * MIB;
  assert.equal(densityAtOverhead(usable, 8 * MIB, 0, 110), 110);
});
