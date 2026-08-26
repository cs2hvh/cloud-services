/**
 * Build-log sanitiser tests.
 *
 *   node --test lib/paas/telemetry/build-log.test.ts
 *
 * The anchor case is the real one: a `git clone` that fails and quotes the
 * remote URL back, with a live installation token in it. That log was being
 * served verbatim to every team member until this landed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_PAGE_LINES,
  PATTERNS,
  STAGES,
  alterationNotice,
  paginate,
  sanitizeBuildLog,
  tail,
} from "./build-log.ts";

/** A plausible installation token: ghs_ plus 36 chars, as GitHub mints them. */
const TOKEN = "ghs_16C7e42F292c6912E7710c838347Ae178B4a";
const CLONE_URL = `https://x-access-token:${TOKEN}@github.com/acme/widget.git`;

/** A build log shaped exactly like the one lib/paas/build/vm.ts produces. */
function log(over: Partial<Record<string, string[]>> = {}): string {
  const s = {
    preamble: ["cloud-init running", "+ set -uo pipefail"],
    clone: [`Cloning into 'repo'...`, `fatal: repository '${CLONE_URL}' not found`],
    dockerfile: ["FROM node:22-alpine", "USER 10001"],
    build: ["#1 [internal] load build definition", "#8 DONE 4.2s", "digest: " + "sha256:" + "a".repeat(64)],
    upload: [
      `+ curl -sS -X PUT https://r2.example.com/bucket/builds/dpl_1/image.tar` +
        `?X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20260826%2Fauto%2Fs3%2Faws4_request` +
        `&X-Amz-Signature=deadbeefcafe1234567890abcdef1234567890abcdef1234567890abcdef1234`,
      "build complete",
    ],
    ...over,
  };
  return [
    ...s.preamble,
    "=== ahura build dpl_1 ===",
    "--- clone ---",
    ...s.clone,
    "--- Dockerfile ---",
    ...s.dockerfile,
    "--- build ---",
    ...s.build,
    "--- upload ---",
    ...s.upload,
    "=== finishing: status=success ===",
  ].join("\n");
}

// ── the leak ────────────────────────────────────────────────────────────────

test("a git clone failure quoting the tokenised URL never reaches the output", () => {
  const r = sanitizeBuildLog(log());

  assert.equal(r.text.includes(TOKEN), false, "the installation token must not survive");
  assert.equal(r.text.includes("x-access-token"), false);
  assert.equal(r.text.includes("fatal: repository"), false, "git stderr is dropped with the stage");
  assert.ok(r.droppedStages.includes("clone"));
  assert.equal(r.altered, true);
});

test("the token is caught by pattern even when it appears in a stage we do show", () => {
  // Belt and braces: if a customer's own build prints the URL, the stage is
  // legitimately visible and only the pattern layer stands between it and them.
  const r = sanitizeBuildLog(log({ build: [`npm ERR! remote: ${CLONE_URL}`] }));

  assert.equal(r.text.includes(TOKEN), false);
  assert.match(r.text, /npm ERR! remote: https:\/\/x-access-token:\[redacted\]@github\.com/);
  assert.equal(r.redactions["github-clone-url"], 1);
});

test("presigned R2 signatures are dropped with the upload stage, and redacted if seen", () => {
  const r = sanitizeBuildLog(log());
  assert.equal(r.text.includes("X-Amz-Signature"), false);
  assert.ok(r.droppedStages.includes("upload"));

  const leaked = sanitizeBuildLog(
    log({ build: ["curl: (22) https://r2/x?X-Amz-Signature=deadbeefcafe1234&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2Fx"] }),
  );
  assert.equal(leaked.text.includes("deadbeefcafe1234"), false);
  assert.equal(leaked.text.includes("AKIAIOSFODNN7EXAMPLE"), false);
  assert.match(leaked.text, /X-Amz-Signature=\[redacted\]/);
});

// ── default deny ────────────────────────────────────────────────────────────

test("output before any stage marker is dropped, not shown", () => {
  const r = sanitizeBuildLog(log());
  assert.equal(r.text.includes("cloud-init running"), false);
  assert.equal(r.droppedPreamble, 2);
});

test("a stage marker nobody classified is dropped, and the reader is told", () => {
  const raw = [
    "=== ahura build dpl_1 ===",
    "--- build ---",
    "compiling",
    "--- sbom ---", // someone added a stage and forgot this file
    `secret-ish: ${TOKEN}`,
    "=== finishing: status=success ===",
  ].join("\n");

  const r = sanitizeBuildLog(raw);
  assert.equal(r.text.includes(TOKEN), false, "an unclassified stage must not pass through");
  assert.equal(r.text.includes("secret-ish"), false);
  assert.match(r.text, /compiling/, "the classified stage before it is unaffected");
  assert.ok(r.droppedStages.some((s) => s.startsWith("unclassified:")));
  assert.match(alterationNotice(r) as string, /unrecognised output hidden/);
});

test("a dropped stage does not silently re-enable the next one", () => {
  const r = sanitizeBuildLog(log());
  assert.match(r.text, /FROM node:22-alpine/, "dockerfile follows clone and is shown");
  assert.match(r.text, /#8 DONE 4\.2s/, "build follows dockerfile and is shown");
});

// ── controlled lines survive stage-dropping ─────────────────────────────────

test("our own ERROR line survives inside a dropped stage, because the customer must act on it", () => {
  const r = sanitizeBuildLog(log({ clone: ["ERROR: could not clone repository", `url was ${CLONE_URL}`] }));

  assert.match(r.text, /ERROR: could not clone repository/);
  assert.equal(r.text.includes(TOKEN), false, "but only the controlled line, not its neighbours");
});

test("a line merely starting with ERROR: does not smuggle operands through", () => {
  const r = sanitizeBuildLog(log({ clone: [`ERROR: clone failed for ${CLONE_URL}`] }));

  assert.equal(r.text.includes(TOKEN), false);
  assert.equal(
    r.text.includes("ERROR: clone failed"),
    false,
    "the controlled pattern is a whole-line allowlist, not a prefix match",
  );
});

test("terminal success lines survive the upload stage", () => {
  const r = sanitizeBuildLog(log());
  assert.match(r.text, /^build complete$/m);
  assert.match(r.text, /=== finishing: status=success ===/);
});

test("the finish stage shows its marker but never its body — the log upload is a presigned PUT", () => {
  // vm.ts's exit trap prints `=== finishing: ... ===` and then curls the build
  // log to a presigned R2 URL. A failed upload prints that URL, and its
  // signature grants write to the log object.
  const raw = [
    "=== ahura build dpl_1 ===",
    "--- build ---",
    "compiled",
    "=== finishing: status=failure ===",
    `curl: (22) The requested URL returned error: 403 https://r2/bucket/builds/dpl_1/build.log` +
      `?X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20260826&X-Amz-Signature=abc123def456`,
  ].join("\n");

  const r = sanitizeBuildLog(raw);

  assert.match(r.text, /=== finishing: status=failure ===/, "the status is shown");
  assert.equal(r.text.includes("X-Amz-Signature"), false, "how it was uploaded is not");
  assert.equal(r.text.includes("abc123def456"), false);
  assert.equal(r.text.includes("AKIAIOSFODNN7EXAMPLE"), false);
  assert.ok(r.droppedStages.includes("finish"));
});

test("a marker-only stage does not re-enable output for what follows it", () => {
  const raw = [
    "=== ahura build dpl_1 ===",
    "=== finishing: status=success ===",
    "secret-ish trailing output",
  ].join("\n");

  const r = sanitizeBuildLog(raw);
  assert.equal(r.text.includes("secret-ish"), false);
});

// ── other credential shapes ─────────────────────────────────────────────────

test("JWTs, bearer headers and PEM bodies are redacted", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop";
  const r = sanitizeBuildLog(
    log({
      build: [
        `SUPABASE_KEY=${jwt}`,
        "Authorization: Bearer sk-live-abc123",
        "-----BEGIN RSA PRIVATE KEY-----",
        "MIIEowIBAAKCAQEA",
        "-----END RSA PRIVATE KEY-----",
      ],
    }),
  );

  assert.equal(r.text.includes(jwt), false);
  assert.equal(r.text.includes("sk-live-abc123"), false);
  assert.equal(r.text.includes("MIIEowIBAAKCAQEA"), false);
  assert.match(r.text, /Authorization: Bearer \[redacted\]/);
});

test("ordinary build output is not touched", () => {
  const r = sanitizeBuildLog(
    log({ build: ["added 412 packages in 9s", "vite v6.0.1 building for production..."] }),
  );

  assert.match(r.text, /added 412 packages in 9s/);
  assert.match(r.text, /vite v6\.0\.1 building for production/);
  assert.equal(Object.keys(r.redactions).length, 0, "no false positives on normal output");
});

// ── ordering: sanitise, then cut ────────────────────────────────────────────

test("paginate takes a sanitised log, so a page boundary cannot split a credential", () => {
  const r = sanitizeBuildLog(log({ build: Array.from({ length: 50 }, (_, i) => `line ${i}`) }));

  const page = paginate(r, { offset: 0, limit: 10 });
  assert.equal(page.lines.length, 10);
  assert.equal(page.hasMore, true);
  assert.equal(page.total > 10, true);
  // The type is the guarantee: paginate cannot be handed a raw string, so
  // "paginate then sanitise each page" is not expressible.
});

test("limit is clamped server-side, never trusted from the caller", () => {
  const r = sanitizeBuildLog(log({ build: Array.from({ length: 5000 }, (_, i) => `line ${i}`) }));

  assert.equal(paginate(r, { limit: 10_000_000 }).lines.length, MAX_PAGE_LINES);
  assert.equal(paginate(r, { limit: 0 }).lines.length, 1, "a zero limit becomes one, not everything");
  assert.equal(paginate(r, { limit: -5 }).lines.length, 1);
  assert.equal(paginate(r, { offset: -100 }).offset, 0);
});

test("offset past the end returns nothing rather than throwing", () => {
  const r = sanitizeBuildLog(log());
  const page = paginate(r, { offset: 99_999, limit: 10 });
  assert.deepEqual(page.lines, []);
  assert.equal(page.hasMore, false);
});

test("tail returns the end of the log, where the failure is", () => {
  const r = sanitizeBuildLog(log({ build: Array.from({ length: 100 }, (_, i) => `line ${i}`) }));
  const t = tail(r, 3);

  assert.equal(t.lines.length, 3);
  assert.equal(t.hasMore, false);
  assert.match(t.lines.join("\n"), /=== finishing: status=success ===/);
});

test("an empty log paginates to nothing without throwing", () => {
  const r = sanitizeBuildLog("");
  assert.deepEqual(paginate(r).lines, []);
  assert.deepEqual(tail(r).lines, []);
  assert.equal(r.sourceBytes, 0);
});

// ── telling the reader ──────────────────────────────────────────────────────

test("the notice says what class of thing was removed, never what was found", () => {
  const r = sanitizeBuildLog(log());
  const notice = alterationNotice(r) as string;

  assert.match(notice, /clone/);
  assert.match(notice, /upload/);
  assert.equal(notice.includes(TOKEN), false);
  assert.equal(/ghs_|token|credential value/i.test(notice.replace(/credentials? redacted/, "")), false);
});

test("a log with nothing removed reports no notice", () => {
  const raw = ["=== ahura build dpl_1 ===", "--- build ---", "ok", "=== finishing: status=success ==="].join("\n");
  const r = sanitizeBuildLog(raw);

  assert.equal(r.altered, false);
  assert.equal(alterationNotice(r), null);
});

// ── the anti-drift test ─────────────────────────────────────────────────────

test("every stage marker the build script emits is classified in STAGES", () => {
  // Reads the real build script. When someone adds a stage and forgets to
  // classify it, this fails here rather than silently dropping their output
  // in production — or, if the default were the other way, leaking it.
  const src = readFileSync(new URL("../build/vm.ts", import.meta.url), "utf8");

  const emitted = [...src.matchAll(/echo\s+(['"])((?:===|---)[^'"]*?(?:===|---))\1/g)]
    .map((m) => m[2])
    .map((s) => s.replace(/@@REF@@/g, "dpl_1").replace(/\$STATUS/g, "success"))
    .filter((s, i, a) => a.indexOf(s) === i);

  assert.ok(emitted.length >= 5, `expected to find the build script's markers, found ${emitted.length}`);

  const unclassified = emitted.filter((line) => !STAGES.some((s) => s.marker.test(line)));
  assert.deepEqual(
    unclassified,
    [],
    `lib/paas/build/vm.ts emits stage markers that build-log.ts does not classify: ` +
      `${unclassified.join(", ")}. Add them to STAGES with an explicit policy.`,
  );
});

test("every stage carries a stated reason, so a 'show' is a decision and not a default", () => {
  for (const s of STAGES) {
    assert.ok(s.why.length > 20, `stage ${s.name} needs a real justification`);
    assert.ok(["show", "drop", "marker-only"].includes(s.policy));
  }
  assert.ok(
    STAGES.some((s) => s.policy !== "show"),
    "an allowlist that shows everything is not an allowlist",
  );
});

test("no stage carrying a presigned URL is classified 'show'", () => {
  // vm.ts curls a presigned R2 URL in two places: the upload stage, and the
  // exit trap that follows the finish marker. Neither may show its body.
  for (const name of ["upload", "finish"]) {
    const stage = STAGES.find((s) => s.name === name);
    assert.ok(stage, `stage ${name} must exist`);
    assert.notEqual(stage.policy, "show", `stage ${name} curls a presigned URL`);
  }
});

test("every pattern is global, or replace would only fix the first occurrence", () => {
  for (const p of PATTERNS) {
    assert.ok(p.re.flags.includes("g"), `pattern ${p.name} must be global`);
  }
});

test("two credentials on one line are both redacted", () => {
  const r = sanitizeBuildLog(log({ build: [`a=${TOKEN} b=ghp_${"B".repeat(36)}`] }));
  assert.equal(r.text.includes(TOKEN), false);
  assert.equal(r.text.includes("ghp_BBBB"), false);
  assert.equal(r.redactions["github-token"], 2);
});
