import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySignature, parsePushEvent, shouldDeploy } from "./webhook.ts";

const SECRET = "test-webhook-secret";
const sign = (body: string, secret = SECRET) =>
  "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

test("a correctly signed body verifies", () => {
  const body = JSON.stringify({ hello: "world" });
  assert.deepEqual(verifySignature(body, sign(body), SECRET), { ok: true });
});

test("a body signed with a different secret is rejected", () => {
  const body = JSON.stringify({ hello: "world" });
  const r = verifySignature(body, sign(body, "wrong-secret"), SECRET);
  assert.equal(r.ok, false);
});

test("a tampered body is rejected even with a valid-looking signature", () => {
  const body = JSON.stringify({ amount: 1 });
  const sig = sign(body);
  const r = verifySignature(JSON.stringify({ amount: 1000000 }), sig, SECRET);
  assert.equal(r.ok, false);
});

test("A MISSING SECRET IS A HARD FAILURE, never a skipped check", () => {
  // The most common way this endpoint gets left wide open: an unset env var in
  // one environment quietly turning verification into a no-op.
  const body = "{}";
  assert.deepEqual(verifySignature(body, sign(body), undefined), { ok: false, reason: "no-secret" });
  assert.deepEqual(verifySignature(body, sign(body), "   "), { ok: false, reason: "no-secret" });
});

test("a missing or malformed signature never reaches the comparison", () => {
  assert.deepEqual(verifySignature("{}", null, SECRET), { ok: false, reason: "no-signature" });
  assert.deepEqual(verifySignature("{}", "sha1=abc", SECRET), { ok: false, reason: "bad-format" });
  assert.deepEqual(verifySignature("{}", "sha256=nothex", SECRET), { ok: false, reason: "bad-format" });
  // A short hex string would make timingSafeEqual throw rather than return false.
  assert.deepEqual(verifySignature("{}", "sha256=abcd", SECRET), { ok: false, reason: "bad-format" });
});

test("verification is byte-exact, so a re-serialised body does NOT verify", () => {
  // Pinning the reason the route must use the raw bytes: JSON.parse then
  // JSON.stringify changes key order and whitespace, and the digest with it.
  // Key ORDER happens to survive a V8 round trip for non-numeric keys, so the
  // difference that actually bites is whitespace — exactly what GitHub's
  // pretty-printed payloads carry.
  const raw = '{ "a": 1, "b": 2 }';
  const reserialised = JSON.stringify(JSON.parse(raw));
  assert.notEqual(raw, reserialised);
  assert.equal(verifySignature(reserialised, sign(raw), SECRET).ok, false);
});

const push = (over: Record<string, unknown> = {}) => ({
  ref: "refs/heads/main",
  after: "63c6674c478b697fc20a6412c78a5f7a2dcf14be",
  repository: { full_name: "heroku/node-js-getting-started" },
  head_commit: { message: "fix things", author: { username: "someone" } },
  installation: { id: 12345 },
  ...over,
});

test("a push event parses to the facts a deploy needs", () => {
  const e = parsePushEvent(push())!;
  assert.equal(e.repoFullName, "heroku/node-js-getting-started");
  assert.equal(e.branch, "main");
  assert.equal(e.sha, "63c6674c478b697fc20a6412c78a5f7a2dcf14be");
  assert.equal(e.author, "someone");
  assert.equal(e.installationId, 12345);
  assert.equal(e.deleted, false);
});

test("an all-zero sha is a branch DELETION, not a commit", () => {
  // It passes the 40-hex shape test, so without an explicit check it would be
  // deployed as though it were a real commit.
  const e = parsePushEvent(push({ after: "0".repeat(40) }))!;
  assert.equal(e.deleted, true);
  assert.equal(shouldDeploy(e, "main").deploy, false);
});

test("a tag push is not a branch and is not deployed", () => {
  const e = parsePushEvent(push({ ref: "refs/tags/v1.0.0" }))!;
  assert.equal(e.branch, null);
  assert.equal(shouldDeploy(e, "main").deploy, false);
});

test("garbage payloads are refused rather than guessed at", () => {
  assert.equal(parsePushEvent(null), null);
  assert.equal(parsePushEvent("not an object"), null);
  assert.equal(parsePushEvent({}), null);
  assert.equal(parsePushEvent(push({ after: "not-a-sha" })), null);
  assert.equal(parsePushEvent(push({ repository: {} })), null);
});

test("the production branch and a feature branch both deploy, as different kinds", () => {
  // This test previously asserted that non-production branches did NOT deploy.
  // That was correct while preview policy was undecided; it is now the feature.
  // The distinction that matters is `kind`, because it decides the hostname,
  // the resources and whether the result is ever reaped.
  assert.deepEqual(shouldDeploy(parsePushEvent(push())!, "main"), {
    deploy: true,
    kind: "production",
    branch: "main",
  });
  assert.deepEqual(shouldDeploy(parsePushEvent(push({ ref: "refs/heads/feature-x" }))!, "main"), {
    deploy: true,
    kind: "preview",
    branch: "feature-x",
  });
});

test("a branch deletion is not a deploy, and does not reap either", () => {
  // Reaping is time-based on purpose. A deletion webhook is a message that can
  // be missed, and a preview whose only cleanup path is an event nobody
  // received runs free forever — silently, since the container keeps serving
  // and the only symptom is a bill.
  const d = shouldDeploy(parsePushEvent(push({ deleted: true }))!, "main");
  assert.equal(d.deploy, false);
  assert.match((d as { reason: string }).reason, /deleted/);
});

test("a commit message is truncated rather than stored unbounded", () => {
  const e = parsePushEvent(push({ head_commit: { message: "x".repeat(5000), author: {} } }))!;
  assert.equal(e.message!.length, 500);
});
