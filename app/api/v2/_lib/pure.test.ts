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
import { redactBuildLog } from "./redact.ts";
import { checkCustomDomain } from "./domains.ts";
import { fromPostgrestError } from "./http.ts";
import { toDeploymentDto, type DeploymentRow } from "./deployments.ts";

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

// ── build log redaction ──────────────────────────────────────────────

test("redactBuildLog removes a tokenised clone URL", () => {
  const r = redactBuildLog(
    "fatal: could not read from https://x-access-token:ghs_AAAAAAAAAAAAAAAAAAAAAA@github.com/a/b.git"
  );
  assert.ok(!r.text.includes("ghs_"), "token must not survive");
  assert.equal(r.redacted, true);
});

test("redactBuildLog removes presigned R2 signatures", () => {
  // These grant write to the image tar — replace it and you replace what
  // gets deployed. They are query parameters, not userinfo.
  const r = redactBuildLog(
    "curl -X PUT 'https://r2/b/image.tar?X-Amz-Credential=AKIAX%2Fauto&X-Amz-Signature=deadbeefcafe'"
  );
  assert.ok(!r.text.includes("deadbeefcafe"));
  assert.ok(!r.text.includes("AKIAX"));
  // The parameter names survive so a reader can still see what the request was.
  assert.ok(r.text.includes("X-Amz-Signature="));
});

test("redactBuildLog leaves ordinary output alone", () => {
  const clean = "npm install finished in 12s\n> build complete";
  const r = redactBuildLog(clean);
  assert.equal(r.text, clean);
  assert.equal(r.redacted, false);
});

test("redactBuildLog is idempotent and does not cry wolf", () => {
  // A pattern matching text an earlier pattern already replaced produces an
  // identical string. Reporting that as a redaction tells the reader content
  // was removed when none was, and a sanitiser that cries wolf gets ignored.
  const once = redactBuildLog(
    "clone https://x-access-token:ghs_BBBBBBBBBBBBBBBBBBBBBB@github.com/a/b.git"
  );
  const twice = redactBuildLog(once.text);
  assert.equal(twice.text, once.text, "second pass must change nothing");
  assert.equal(twice.redacted, false, "second pass must not claim a redaction");
});

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
