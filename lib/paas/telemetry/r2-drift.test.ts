/**
 * R2 object reconciliation tests.
 *
 *   node --test lib/paas/telemetry/r2-drift.test.ts
 *
 * This report proposes deleting things, so the tests lean hard on the cases
 * where proposing would be WRONG. A mapping bug here does not cost money, it
 * destroys the build logs of every app on the platform.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  R2_GB_MONTH_USD,
  formatBytes,
  parseKey,
  reconcileR2,
  type DeploymentLike,
  type R2ObjectLike,
} from "./r2-drift.ts";

const MB = 1024 * 1024;
const WHEN = "2026-08-26T10:00:00Z";

function obj(key: string, size = MB): R2ObjectLike {
  return { key, size, lastModified: WHEN };
}

function dep(ref: string, state = "ready", image_digest: string | null = `sha256:${"a".repeat(64)}`): DeploymentLike {
  return { ref, state, image_digest };
}

const only = (r: ReturnType<typeof reconcileR2>) => {
  assert.equal(r.findings.length, 1);
  return r.findings[0];
};

// ── key parsing ─────────────────────────────────────────────────────────────

test("build artifact keys parse to their deployment ref", () => {
  assert.deepEqual(parseKey("builds/dpl9f6d095cc9/image.tar"), {
    kind: "build-artifact",
    deploymentRef: "dpl9f6d095cc9",
    filename: "image.tar",
  });
});

test("cache keys parse to team and project", () => {
  const p = parseKey("cache/tm_1/prj_2/node_modules.tar");
  assert.equal(p.kind, "cache");
  assert.equal(p.teamRef, "tm_1");
  assert.equal(p.projectRef, "prj_2");
});

test("a key shape this module does not know is unknown, never reclaimable", () => {
  for (const k of ["", "builds/", "builds/only-one-segment", "builds/a/b/c", "something/else"]) {
    const r = reconcileR2({ objects: [obj(k)], deployments: [] });
    assert.notEqual(only(r).disposition, "orphan", `${JSON.stringify(k)} must not be proposed`);
    assert.notEqual(only(r).disposition, "redundant");
  }
});

// ── the big win, and why it is safe ─────────────────────────────────────────

test("image.tar for a ready deployment is redundant — the registry holds the image", () => {
  const r = reconcileR2({
    objects: [obj("builds/dpl_1/image.tar", 120 * MB)],
    deployments: [dep("dpl_1", "ready")],
  });

  const f = only(r);
  assert.equal(f.disposition, "redundant");
  assert.equal(r.reclaimableBytes, 120 * MB);
  assert.match(f.detail, /rollback repoints a selector at that digest/);
});

test("image.tar for a READY deployment with no digest is NOT reclaimable", () => {
  // The schema forbids this (deployments_ready_has_image), so seeing it means
  // something is wrong. Wrong is not the same as safe to delete.
  const r = reconcileR2({
    objects: [obj("builds/dpl_1/image.tar", 120 * MB)],
    deployments: [dep("dpl_1", "ready", null)],
  });

  assert.equal(only(r).disposition, "unknown");
  assert.equal(r.reclaimableBytes, 0);
  assert.equal(r.clean, false, "an unclassified object keeps the report dirty");
});

test("image.tar for an in-flight build is never touched", () => {
  for (const state of ["queued", "building", "publishing"]) {
    const r = reconcileR2({
      objects: [obj("builds/dpl_1/image.tar", 120 * MB)],
      deployments: [dep("dpl_1", state, null)],
    });
    assert.equal(only(r).disposition, "in-flight", state);
    assert.equal(r.reclaimableBytes, 0);
  }
});

test("image.tar for a failed build is an orphan — it was never published", () => {
  for (const state of ["error", "canceled"]) {
    const r = reconcileR2({
      objects: [obj("builds/dpl_1/image.tar", 90 * MB)],
      deployments: [dep("dpl_1", state, null)],
    });
    assert.equal(only(r).disposition, "orphan", state);
  }
});

// ── logs are retained, not reclaimed ────────────────────────────────────────

test("a build log for a live deployment is retained however old it is", () => {
  const r = reconcileR2({
    objects: [{ key: "builds/dpl_1/build.log", size: 40 * 1024, lastModified: "2020-01-01T00:00:00Z" }],
    deployments: [dep("dpl_1")],
  });

  assert.equal(only(r).disposition, "retain");
  assert.equal(r.reclaimableBytes, 0);
  assert.match(only(r).detail, /a customer may read it long after/);
});

test("a build log for a FAILED deployment is still retained — that is when it matters most", () => {
  const r = reconcileR2({
    objects: [obj("builds/dpl_1/build.log", 40 * 1024)],
    deployments: [dep("dpl_1", "error", null)],
  });
  assert.equal(only(r).disposition, "retain");
});

test("meta.json is retained", () => {
  const r = reconcileR2({ objects: [obj("builds/dpl_1/meta.json", 2048)], deployments: [dep("dpl_1")] });
  assert.equal(only(r).disposition, "retain");
});

// ── objects with no deployment at all ───────────────────────────────────────

test("a deployment with no row: the tar is reclaimable, the log is NOT", () => {
  // A missing row is not proof the app is gone. On the live cluster several of
  // these belong to deployments running right now that predate the recording
  // work — deleting their logs would destroy the only account of how they were
  // built, to save a few KB.
  const r = reconcileR2({
    objects: [
      obj("builds/dpl_gone/image.tar", 100 * MB),
      obj("builds/dpl_gone/build.log", 30 * 1024),
      obj("builds/dpl_gone/meta.json", 1024),
    ],
    deployments: [],
  });

  assert.equal(r.findings.every((f) => f.disposition === "orphan"), true, "all three are findings");
  assert.equal(r.reclaimableBytes, 100 * MB, "but only the tar is safe to delete");

  const log = r.findings.find((f) => f.key.endsWith("build.log"));
  assert.equal(log?.reclaimable, false);
  assert.match(log?.detail ?? "", /not proof the app is gone/);
});

test("registry blobs are recognised and never reclaimable — they ARE the deployed images", () => {
  const key =
    "registry/docker/registry/v2/blobs/sha256/9b/9b868a5c95f4556e3e8adf67754ca8530680537cda3bce78ef88f812901a168a/data";
  assert.equal(parseKey(key).kind, "registry");

  const r = reconcileR2({ objects: [obj(key, 66 * MB)], deployments: [] });
  const f = only(r);
  assert.equal(f.disposition, "retain");
  assert.equal(f.reclaimable, false);
  assert.equal(r.reclaimableBytes, 0);
  assert.equal(r.clean, true, "the registry is not drift");
});

test("the registry is what MAKES a ready deployment's tar redundant", () => {
  // The two classifications are coupled: the tar is safe to delete precisely
  // because the blob is not. If registry blobs were ever reclaimable, the
  // redundant classification would be wrong too.
  const r = reconcileR2({
    objects: [
      obj("registry/docker/registry/v2/blobs/sha256/ab/abc/data", 60 * MB),
      obj("builds/dpl_1/image.tar", 60 * MB),
    ],
    deployments: [dep("dpl_1", "ready")],
  });

  assert.equal(r.reclaimableBytes, 60 * MB, "exactly one copy of the image is reclaimable");
});

test("a cache for a project that still exists is retained; one for a deleted project is an orphan", () => {
  const live = reconcileR2({
    objects: [obj("cache/tm_1/prj_live/deps.tar", 50 * MB)],
    deployments: [],
    liveProjectRefs: ["prj_live"],
  });
  assert.equal(only(live).disposition, "retain");

  const dead = reconcileR2({
    objects: [obj("cache/tm_1/prj_dead/deps.tar", 50 * MB)],
    deployments: [],
    liveProjectRefs: ["prj_live"],
  });
  assert.equal(only(dead).disposition, "orphan");
});

test("with no project list supplied, caches are retained rather than guessed at", () => {
  const r = reconcileR2({ objects: [obj("cache/tm_1/prj_x/deps.tar")], deployments: [] });
  assert.equal(only(r).disposition, "retain", "absence of data is not evidence of absence");
});

// ── totals ──────────────────────────────────────────────────────────────────

test("the report prices what it proposes reclaiming", () => {
  const r = reconcileR2({
    objects: [
      obj("builds/dpl_ready/image.tar", 1024 * MB), // 1 GB, redundant
      obj("builds/dpl_ready/build.log", 10 * 1024), // retained
      obj("builds/dpl_gone/image.tar", 1024 * MB), // 1 GB, orphan
    ],
    deployments: [dep("dpl_ready", "ready")],
  });

  assert.equal(r.byDisposition.redundant.objects, 1);
  assert.equal(r.byDisposition.orphan.objects, 1);
  assert.equal(r.byDisposition.retain.objects, 1);

  assert.ok(Math.abs(r.reclaimableMonthlyUsd - 2 * R2_GB_MONTH_USD) < 1e-9);
  assert.ok(r.totalMonthlyUsd > r.reclaimableMonthlyUsd);
  assert.equal(r.clean, false);
});

test("findings sort largest first, because that is the order anyone acts in", () => {
  const r = reconcileR2({
    objects: [obj("builds/a/build.log", 1024), obj("builds/b/image.tar", 500 * MB), obj("builds/c/meta.json", 512)],
    deployments: [],
  });
  assert.equal(r.findings[0].key, "builds/b/image.tar");
});

test("a bucket holding only live artifacts is clean", () => {
  const r = reconcileR2({
    objects: [obj("builds/dpl_1/build.log", 1024), obj("builds/dpl_1/meta.json", 512)],
    deployments: [dep("dpl_1")],
  });
  assert.equal(r.clean, true);
  assert.equal(r.reclaimableBytes, 0);
});

test("an empty bucket is clean", () => {
  const r = reconcileR2({ objects: [], deployments: [] });
  assert.equal(r.clean, true);
  assert.equal(r.totalBytes, 0);
  assert.equal(r.totalMonthlyUsd, 0);
});

test("formatBytes reads sensibly at every scale", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(5 * MB), "5.0 MB");
  assert.equal(formatBytes(3 * 1024 * MB), "3.00 GB");
});
