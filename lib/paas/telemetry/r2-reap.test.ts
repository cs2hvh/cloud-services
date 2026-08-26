/**
 * R2 reap-planning tests.
 *
 *   node --test lib/paas/telemetry/r2-reap.test.ts
 *
 * This module proposes DELETIONS with no undo, so every test here is about
 * refusing. The one thing it may delete is an image.tar whose manifest blob
 * was observed in the same bucket; everything it cannot observe, it keeps.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { planReap, registryBlobKey, type ReapInput } from "./r2-reap.ts";
import type { R2Finding } from "./r2-drift.ts";

const MB = 1024 * 1024;
const DIGEST = `sha256:${"9b868a5c95f4556e3e8adf67754ca8530680537cda3bce78ef88f812901a168a"}`;
const BLOB = "registry/docker/registry/v2/blobs/sha256/9b/9b868a5c95f4556e3e8adf67754ca8530680537cda3bce78ef88f812901a168a/data";

function tar(over: Partial<R2Finding> = {}): R2Finding {
  return {
    key: "builds/dpl_1/image.tar",
    disposition: "redundant",
    bytes: 120 * MB,
    deploymentRef: "dpl_1",
    reclaimable: true,
    detail: "transfer artifact",
    lastModified: "2026-08-26T10:00:00Z",
    ...over,
  };
}

function plan(over: Partial<ReapInput> = {}) {
  return planReap({
    findings: [tar()],
    digestOf: () => DIGEST,
    presentKeys: new Set([BLOB]),
    aliasedDeployments: new Set(),
    ...over,
  });
}

// ── the key layout, confirmed against the live bucket ───────────────────────

test("the registry blob key matches what the bucket actually contains", () => {
  // Taken verbatim from a live listing. The two-character shard directory is
  // easy to get wrong, and getting it wrong makes every tar unverifiable —
  // safe, but silently, and this tool would then never delete anything while
  // reporting that it could not prove a thing.
  assert.equal(registryBlobKey(DIGEST), BLOB);
});

test("a malformed digest yields no key rather than a wrong one", () => {
  for (const bad of ["", "sha256:", "sha256:xyz", "9b868a", "md5:abc", `sha256:${"a".repeat(63)}`]) {
    assert.equal(registryBlobKey(bad), null, JSON.stringify(bad));
  }
});

test("a non-default registry root is honoured", () => {
  assert.match(registryBlobKey(DIGEST, "reg2") as string, /^reg2\/docker\/registry/);
});

// ── the one thing it will delete ────────────────────────────────────────────

test("a redundant tar whose blob is observed is a candidate", () => {
  const p = plan();

  assert.equal(p.candidates.length, 1);
  assert.equal(p.candidates[0].key, "builds/dpl_1/image.tar");
  assert.equal(p.candidates[0].provenBy, BLOB, "the proof is named, not assumed");
  assert.equal(p.reclaimableBytes, 120 * MB);
  assert.deepEqual(p.blocked, []);
});

// ── everything it refuses ───────────────────────────────────────────────────

test("a tar whose registry blob is ABSENT is kept, and that is alarming", () => {
  // The important case. A ready deployment whose image is not in the bucket
  // means the control plane believes something is published that is not —
  // a rollback would fail, and the tar may be the only copy.
  const p = plan({ presentKeys: new Set() });

  assert.deepEqual(p.candidates, []);
  assert.equal(p.blocked.length, 1);
  assert.equal(p.blocked[0].alarming, true);
  assert.match(p.blocked[0].reason, /rollback to it would fail/);
  assert.match(p.blocked[0].reason, /may be the only copy/);
});

test("a ready deployment with no image_digest is kept and flagged", () => {
  // The schema requires one on a ready row, so its absence is a defect in the
  // row rather than a reason to guess.
  const p = plan({ digestOf: () => null });

  assert.deepEqual(p.candidates, []);
  assert.equal(p.blocked[0].alarming, true);
  assert.match(p.blocked[0].reason, /no image_digest/);
});

test("an ORPHANED tar is kept — waste, but not provable waste", () => {
  // A build that failed published nothing, so there is no durable copy to
  // point at. It is genuinely reclaimable and this tool still will not touch
  // it, because its whole licence to delete is the observation.
  const p = plan({ findings: [tar({ disposition: "orphan" })] });

  assert.deepEqual(p.candidates, []);
  assert.equal(p.blocked[0].alarming, false);
  assert.match(p.blocked[0].reason, /not provable waste/);
});

test("nothing that is not an image.tar is ever a candidate", () => {
  for (const key of [
    "builds/dpl_1/build.log",
    "builds/dpl_1/meta.json",
    "cache/tm_1/prj_1/deps.tar",
    BLOB,
    "something/unrecognised",
  ]) {
    const p = plan({ findings: [tar({ key, reclaimable: true })] });
    assert.deepEqual(p.candidates, [], key);
    assert.deepEqual(p.blocked, [], `${key} is not even considered`);
  }
});

test("an object r2-drift did not call reclaimable is not considered", () => {
  const p = plan({ findings: [tar({ reclaimable: false })] });
  assert.deepEqual(p.candidates, []);
  assert.deepEqual(p.blocked, []);
});

test("a tar with no parseable deployment ref is kept", () => {
  const p = plan({ findings: [tar({ deploymentRef: null })] });
  assert.deepEqual(p.candidates, []);
  assert.equal(p.blocked[0].alarming, false);
});

test("a tar for an ALIASED deployment is kept even with the blob present", () => {
  // Belt and braces at the infrastructure lane's request. The blob check
  // should make this unnecessary; that is not a reason to skip it. These are
  // the only objects here whose loss a customer would see.
  const p = plan({ aliasedDeployments: new Set(["dpl_1"]) });

  assert.deepEqual(p.candidates, []);
  assert.equal(p.blocked.length, 1);
  assert.equal(p.blocked[0].alarming, false);
  assert.match(p.blocked[0].reason, /alias currently points at this deployment/);
});

test("the alias guard is checked BEFORE the blob, so it holds even when proof exists", () => {
  // Ordering matters: if the blob check ran first and passed, an aliased
  // deployment would become a candidate and the guard would never run.
  const p = plan({ aliasedDeployments: new Set(["dpl_1"]), presentKeys: new Set([BLOB]) });
  assert.deepEqual(p.candidates, []);
});

// ── shape ───────────────────────────────────────────────────────────────────

test("proof is per-deployment, so one missing blob does not block the others", () => {
  const other = `sha256:${"c".repeat(64)}`;
  const otherBlob = registryBlobKey(other) as string;

  const p = planReap({
    findings: [
      tar({ key: "builds/dpl_ok/image.tar", deploymentRef: "dpl_ok", bytes: 10 * MB }),
      tar({ key: "builds/dpl_missing/image.tar", deploymentRef: "dpl_missing", bytes: 90 * MB }),
    ],
    digestOf: (ref) => (ref === "dpl_ok" ? other : DIGEST),
    presentKeys: new Set([otherBlob]),
    aliasedDeployments: new Set(),
  });

  assert.equal(p.candidates.length, 1);
  assert.equal(p.candidates[0].deploymentRef, "dpl_ok");
  assert.equal(p.reclaimableBytes, 10 * MB);
  assert.equal(p.blockedBytes, 90 * MB, "the unprovable one is reported, not silently dropped");
});

test("an empty bucket plans nothing", () => {
  const p = planReap({ findings: [], digestOf: () => null, presentKeys: new Set(), aliasedDeployments: new Set() });
  assert.deepEqual(p.candidates, []);
  assert.equal(p.reclaimableBytes, 0);
});
