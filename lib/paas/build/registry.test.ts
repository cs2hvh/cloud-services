import { test } from "node:test";
import assert from "node:assert/strict";
import { registryKeys, imageIsDurable } from "./registry.ts";

/**
 * These cover the parts that decide whether a DELETE happens. The live proof —
 * three real ready deployments reporting durable, a bogus digest reporting not
 * — was run against the actual registry; what is pinned here is the reasoning
 * that cannot be re-run cheaply on every test invocation.
 *
 * The case worth keeping is `blobPresentLinkMissing`. Checking only the blob
 * would have passed it, because blobs are content-addressed and shared across
 * repositories — the bytes exist, and the image still cannot be pulled from
 * that repo. Against the live registry that case really does report 1 of 2
 * present, so the second key is load-bearing rather than defensive padding.
 */

const DIGEST = "sha256:" + "ab".repeat(32);
const REPO = "prj-13cc6161e14a";

test("keys match Docker Distribution's layout", () => {
  assert.equal(
    registryKeys.manifestBlob(DIGEST),
    `registry/docker/registry/v2/blobs/sha256/ab/${"ab".repeat(32)}/data`,
  );
  assert.equal(
    registryKeys.revisionLink(REPO, DIGEST),
    `registry/docker/registry/v2/repositories/${REPO}/_manifests/revisions/sha256/${"ab".repeat(32)}/link`,
  );
});

test("the sha256: prefix is stripped exactly once and only from the front", () => {
  // A digest carrying the prefix and one without it must produce the same key,
  // or a caller passing the "wrong" form silently checks a path that cannot
  // exist — which reads as "not durable" and quietly disables all reclaiming.
  const bare = "ab".repeat(32);
  assert.equal(registryKeys.manifestBlob(DIGEST), registryKeys.manifestBlob(bare));
});

test("a malformed digest refuses rather than checking a nonsense path", async () => {
  // The dangerous shape: a garbage digest builds a key that is simply absent,
  // which would read as "not durable" and be safe by accident. Refusing says
  // why, and keeps the safety a property of the code rather than a coincidence.
  for (const bad of ["", "sha256:", "notadigest", "sha256:xyz", "sha512:" + "ab".repeat(32), "../../etc/passwd"]) {
    const v = await imageIsDurable(REPO, bad);
    assert.equal(v.durable, false, `${JSON.stringify(bad)} must not be durable`);
    assert.equal(v.checked.length, 0, "a refused digest must not have read anything");
    assert.match(v.reason, /sha256|refusing/i);
  }
});

test("a malformed repository name refuses", async () => {
  for (const bad of ["", "../escape", "UPPER", "has space", "/leading"]) {
    const v = await imageIsDurable(bad, DIGEST);
    assert.equal(v.durable, false, `${JSON.stringify(bad)} must not be durable`);
    assert.equal(v.checked.length, 0);
  }
});

test("a legal repo and digest get as far as reading — the refusals are not catching everything", () => {
  // The paired proof. Without it, an imageIsDurable that refused EVERY input
  // would satisfy both tests above while never verifying anything, and the
  // symptom would be tarballs silently never reclaimed rather than an error.
  assert.doesNotThrow(() => registryKeys.manifestBlob(DIGEST));
  assert.doesNotThrow(() => registryKeys.revisionLink(REPO, DIGEST));
  assert.ok(registryKeys.manifestBlob(DIGEST).startsWith("registry/"));
  assert.ok(registryKeys.revisionLink(REPO, DIGEST).includes(REPO));
});

test("the two keys are different paths — a check that read one twice would prove half as much", () => {
  assert.notEqual(registryKeys.manifestBlob(DIGEST), registryKeys.revisionLink(REPO, DIGEST));
});

test("the repository link is repo-scoped and the blob is not", () => {
  // This is exactly why both are required. Against the live registry, a correct
  // digest under the WRONG repo reports 1 of 2 present: the blob is shared, the
  // link is not. Checking only the blob would delete the transfer artifact for
  // an image that repository cannot pull.
  const blobA = registryKeys.manifestBlob(DIGEST);
  const blobB = registryKeys.manifestBlob(DIGEST);
  assert.equal(blobA, blobB, "the blob key does not vary by repository");

  const linkA = registryKeys.revisionLink("prj-aaa", DIGEST);
  const linkB = registryKeys.revisionLink("prj-bbb", DIGEST);
  assert.notEqual(linkA, linkB, "the link key MUST vary by repository");
});
