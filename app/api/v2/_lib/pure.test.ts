/**
 * Tests for the decision logic in app/api/v2/_lib.
 *
 * These exist because nothing else in this lane has ever executed. There is no
 * node_modules in this repo (npm install was declined), so no route has been
 * typechecked, linted or served a request — everything under app/ is verified
 * by reading. These four modules import nothing, so they run under
 * `node --test`, and this is the only executable verification the UI lane has.
 *
 * Run:  node --test "app/api/v2/_lib/*.test.ts"
 *
 * Scope is deliberately the security-relevant decisions: what becomes a
 * hostname, what leaves in a build log, what an RLS refusal turns into, and
 * whether a running deployment can be reported as finished.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { slugify } from "./serialize.ts";
import { checkCustomDomain } from "./domains.ts";
import { fromPostgrestError } from "./http.ts";
import {
  toDeploymentDto,
  isPlaceholderSha,
  DEPLOYMENT_STATES,
  DEPLOYMENT_TRIGGERS,
  type DeploymentRow,
} from "./deployments.ts";

// ── slugify ──────────────────────────────────────────────────────────
// The result becomes a single DNS label in {app}.apps.ahurasense.com.

test("slugify produces a usable DNS label", () => {
  assert.equal(slugify("My Cool App"), "my-cool-app");
  assert.equal(slugify("  Leading and trailing  "), "leading-and-trailing");
  assert.equal(slugify("under_scores.and.dots"), "under-scores-and-dots");
});

test("slugify never leaves a leading or trailing hyphen", () => {
  // DNS-1123 forbids them, and a trailing hyphen is what you get from
  // truncating a long name mid-word.
  assert.equal(slugify("---edges---"), "edges");
  const long = slugify("a".repeat(60) + " " + "b".repeat(20));
  assert.ok(long !== null);
  assert.ok(long!.length <= 63, "must fit a DNS label");
  assert.ok(!long!.startsWith("-") && !long!.endsWith("-"));
});

test("slugify returns null rather than inventing a name", () => {
  // Silently substituting a generated slug would give someone a hostname they
  // did not choose.
  assert.equal(slugify("!!!"), null);
  assert.equal(slugify("   "), null);
  assert.equal(slugify(""), null);
});

// ── custom domains ───────────────────────────────────────────────────

test("checkCustomDomain accepts ordinary hostnames", () => {
  assert.equal(checkCustomDomain("app.example.com").ok, true);
  assert.equal(checkCustomDomain("  App.Example.COM  ").domain, "app.example.com");
});

test("checkCustomDomain rejects platform hostnames, including by shouting", () => {
  // Case folding must happen before the suffix check, or the control is
  // bypassed with capitals.
  for (const d of [
    "ahurasense.com",
    "anything.ahurasense.com",
    "apps.ahurasense.com",
    "x.apps.ahurasense.com",
    "AHURASENSE.COM",
    "Evil.AhuraSense.Com",
  ]) {
    const r = checkCustomDomain(d);
    assert.equal(r.ok, false, `${d} must be rejected`);
    assert.equal(r.reason, "reserved", `${d} must be reserved, not malformed`);
  }
});

test("checkCustomDomain rejects malformed input", () => {
  for (const d of [
    "no-dot",
    "-leading.example.com",
    "trailing-.example.com",
    "double..dot.com",
    "sp ace.example.com",
    "",
    null,
    undefined,
    12345,
  ]) {
    assert.equal(checkCustomDomain(d as unknown).ok, false, `${String(d)} must be rejected`);
  }
});

// Build-log redaction is no longer tested here: redact.ts is deleted and
// lib/paas/telemetry/build-log.ts owns it, with its own suite. Testing a copy
// of that logic from this side would report green while the two diverged.

// ── postgrest error mapping ──────────────────────────────────────────

test("an RLS refusal becomes 404, never 403", async () => {
  // 403 confirms the row exists, which lets someone enumerate another team's
  // refs. RLS returns no rows for both "absent" and "not yours"; 404 is the
  // honest translation of that.
  const res = fromPostgrestError({ code: "42501", message: "permission denied" });
  assert.ok(res, "42501 must map to a response");
  assert.equal(res!.status, 404);
});

test("known constraint violations map to their own statuses", async () => {
  assert.equal(fromPostgrestError({ code: "23505" })!.status, 409);
  assert.equal(fromPostgrestError({ code: "23503" })!.status, 422);
  assert.equal(fromPostgrestError({ code: "23514" })!.status, 422);
});

test("an unknown error is not swallowed", () => {
  // Returning null means the caller logs and answers 500, rather than a
  // misleading 4xx that tells the user they did something wrong.
  assert.equal(fromPostgrestError({ code: "XX000", message: "boom" }), null);
  assert.equal(fromPostgrestError(null), null);
});

// ── deployment serialisation ─────────────────────────────────────────

function row(over: Partial<DeploymentRow> = {}): DeploymentRow {
  return {
    ref: "dpl-abc",
    state: "ready",
    trigger: "git_push",
    git_sha: "0123456789abcdef",
    git_ref: "main",
    git_message: "a commit",
    git_author: "someone",
    image_repo: "registry/app",
    image_digest: "sha256:aaa",
    error_code: null,
    error_message: null,
    container_port: 3000,
    run_as_user: 1000,
    queued_at: "2026-08-26T10:00:00.000Z",
    started_at: "2026-08-26T10:00:10.000Z",
    ready_at: "2026-08-26T10:01:10.000Z",
    ...over,
  };
}

test("duration is measured, and absent while still running", () => {
  assert.equal(toDeploymentDto(row()).timing.durationMs, 60_000);
  // A running build must not report a duration; a growing timer against now()
  // would also make a failed build look like it is still going.
  assert.equal(
    toDeploymentDto(row({ state: "building", ready_at: null })).timing.durationMs,
    null
  );
  assert.equal(
    toDeploymentDto(row({ state: "queued", started_at: null, ready_at: null }))
      .timing.durationMs,
    null
  );
});

test("a failed deployment always carries a message", () => {
  // An errored deployment with a blank reason is the state users complain
  // about most.
  const d = toDeploymentDto(
    row({ state: "error", error_message: null, error_code: null, ready_at: null })
  );
  assert.ok(d.error);
  assert.ok(d.error!.message.length > 0);
});

test("terminal states are identified", () => {
  for (const s of ["ready", "error", "canceled"] as const) {
    assert.equal(toDeploymentDto(row({ state: s })).isTerminal, true, s);
  }
  for (const s of ["queued", "building", "publishing"] as const) {
    assert.equal(toDeploymentDto(row({ state: s })).isTerminal, false, s);
  }
});

test("image is null unless both repo and digest are present", () => {
  assert.equal(toDeploymentDto(row({ image_digest: null })).image, null);
  assert.equal(toDeploymentDto(row({ image_repo: null })).image, null);
  assert.ok(toDeploymentDto(row()).image);
});

// ── placeholder shas ─────────────────────────────────────────────────
// Every deployment in production currently has git_sha "0000000". A UI keyed
// on the sha shows a list of identical rows, and the promote picker becomes
// unusable — you cannot choose between six entries that read the same.

test("a zero sha is recognised as carrying no information", () => {
  assert.equal(isPlaceholderSha("0000000"), true);
  assert.equal(isPlaceholderSha("0000000000000000000000000000000000000000"), true);
  assert.equal(isPlaceholderSha(""), true);
  assert.equal(isPlaceholderSha("nope"), true);
});

test("a real sha is not treated as a placeholder", () => {
  assert.equal(isPlaceholderSha("0123456789abcdef0123456789abcdef01234567"), false);
  assert.equal(isPlaceholderSha("a1b2c3d"), false);
});

test("label falls back to the deployment ref when the sha is a placeholder", () => {
  const withPlaceholder = toDeploymentDto(row({ git_sha: "0000000", ref: "dpl-abc123" }));
  assert.equal(withPlaceholder.label, "dpl-abc123");
  assert.equal(withPlaceholder.commit.isPlaceholder, true);

  const real = toDeploymentDto(row({ git_sha: "0123456789abcdef0123456789abcdef01234567" }));
  assert.equal(real.label, "0123456");
  assert.equal(real.commit.isPlaceholder, false);
});

test("two placeholder deployments produce distinguishable labels", () => {
  // The actual failure this prevents: six rows that all read "0000000".
  const a = toDeploymentDto(row({ ref: "dpl-aaa", git_sha: "0000000" }));
  const b = toDeploymentDto(row({ ref: "dpl-bbb", git_sha: "0000000" }));
  assert.notEqual(a.label, b.label);
});

test("runtime facts pass through, and absence is stated not guessed", () => {
  // Both caused outages by living only in build-time detection. A deployment
  // built before they were recorded must say so rather than have the UI
  // substitute a default that was never what this build actually used.
  const known = toDeploymentDto(row({ container_port: 8000, run_as_user: 0 }));
  assert.equal(known.runtime.port, 8000);
  assert.equal(known.runtime.user, 0, "root is 0, and 0 must not read as absent");

  const unknown = toDeploymentDto(row({ container_port: null, run_as_user: null }));
  assert.equal(unknown.runtime.port, null);
  assert.equal(unknown.runtime.user, null);
});

// ── null git_sha ─────────────────────────────────────────────────────
// paas.deployments.git_sha became nullable when the deploy path stopped
// inventing commits. The generated type still said `string` for a while,
// which is precisely what made .slice(0,7) look safe. It was not: a null sha
// threw and would have 500'd the deployment list and detail page.

test("a null sha does not throw", () => {
  const d = toDeploymentDto(row({ git_sha: null, state: "queued", started_at: null, ready_at: null }));
  assert.equal(d.commit.sha, null);
  assert.equal(d.commit.shortSha, "");
  assert.equal(d.commit.isPlaceholder, true);
  assert.equal(d.label, "dpl-abc", "must fall back to the ref");
});

test("isPlaceholderSha treats null as carrying no information", () => {
  assert.equal(isPlaceholderSha(null), true);
});

// ── enum mirrors ─────────────────────────────────────────────────────
// A queued deployment is normal now, not stuck: the webhook records and a
// worker builds, so a row can sit in queued with no build activity.

test("queued deployments report no duration and are not terminal", () => {
  const d = toDeploymentDto(row({ state: "queued", started_at: null, ready_at: null }));
  assert.equal(d.timing.durationMs, null);
  assert.equal(d.isTerminal, false);
});

test("the enum mirrors contain no duplicates and are non-empty", () => {
  // Cheap invariants that hold without a database. The live comparison is in
  // boundary.test.ts and skips when Postgres is unreachable.
  for (const list of [DEPLOYMENT_STATES, DEPLOYMENT_TRIGGERS]) {
    assert.ok(list.length > 0);
    assert.equal(new Set(list).size, list.length, "duplicate enum value");
  }
  assert.ok(DEPLOYMENT_TRIGGERS.includes("git_push"), "the webhook writes git_push, not push");
});
