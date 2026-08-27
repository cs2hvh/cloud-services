/**
 * Build VM cloud-init tests, focused on credential handling.
 *
 *   node --test lib/paas/build/vm.test.ts
 *
 * The build log is uploaded to R2 and served to team members, so anything
 * secret that reaches it is published to the whole team. These tests exist
 * because a live GitHub installation token WAS embedded in the clone URL, and
 * git echoes the remote URL in its own error output on a failed clone.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderCloudInit, type BuildRequest } from "./vm.ts";

const URLS = { imagePut: "https://r2/IMG", logPut: "https://r2/LOG", metaPut: "https://r2/META" };

function req(over: Partial<BuildRequest> = {}): BuildRequest {
  return {
    deploymentRef: "dpl-abc123",
    cloneUrl: "https://github.com/acme/site.git",
    gitRef: "main",
    // A FULL sha. `git fetch origin <short-sha>` is refused by GitHub, so the
    // renderer requires 40 hex characters or the literal "HEAD".
    gitSha: "abc1234abc1234abc1234abc1234abc1234abc12",
    dockerfile: "FROM alpine\n",
    imageName: "acme/site:dpl-abc123",
    ...over,
  };
}

test("a token is never placed in the clone URL", () => {
  const out = renderCloudInit(req({ gitToken: "ghs_supersecrettoken123" }), URLS);
  const cloneLine = out.split("\n").find((l) => l.includes("git") && l.includes("clone"))!;
  assert.ok(cloneLine, "expected a clone line");
  assert.doesNotMatch(cloneLine, /ghs_supersecrettoken123/, "token must not appear on the clone line");
  assert.doesNotMatch(cloneLine, /:.*@github\.com/, "clone URL must carry no credentials");
});

test("the token is delivered via a credential file, base64, never a shell token", () => {
  const secret = "ghs_supersecrettoken123";
  const out = renderCloudInit(req({ gitToken: secret }), URLS);
  assert.match(out, /\.git-credentials/);
  assert.match(out, /credential\.helper store/);
  assert.match(out, /chmod 600/);
  // The literal secret must not appear anywhere in the script — only base64.
  assert.doesNotMatch(out, new RegExp(secret), "raw token must not appear in the rendered script");
});

test("THE CREDENTIAL OUTLIVES THE COMMIT FETCH, AND DIES BEFORE THE BUILD", () => {
  // It used to be removed on the line after `git clone`, and the commit fetch
  // below it then ran anonymously — so a private repository failed with
  // 'requested commit could not be fetched' on a commit that existed. Cloning
  // and fetching a specific sha are TWO authenticated operations.
  //
  // Both bounds asserted. Removing it too early breaks private builds;
  // removing it too late puts a credential on disk while Docker is writing
  // layers that get pushed to a registry and served.
  const out = renderCloudInit(req({ gitToken: "ghs_x" }), URLS);
  const cloneIdx = out.indexOf("clone --depth=1");
  const fetchIdx = out.indexOf("fetch --depth=1 origin");
  const rmIdx = out.indexOf("rm -f /home/builder/.git-credentials");
  // buildctl, not docker — naming the wrong command made this bound silently
  // skip, which is a guard that passes by not running.
  const buildIdx = out.indexOf("buildctl build");

  assert.ok(cloneIdx > 0 && fetchIdx > 0 && rmIdx > 0, "all three steps must be present");
  assert.ok(rmIdx > cloneIdx, "credential must outlive the clone");
  assert.ok(rmIdx > fetchIdx, "credential must outlive the commit fetch — this is the regression");
  assert.ok(buildIdx > 0, "the build command must be present, or the bound below proves nothing");
  assert.ok(rmIdx < buildIdx, "credential must be gone before any layer is built");
});

test("a public repo never CREATES a credential, though cleanup still runs", () => {
  const out = renderCloudInit(req(), URLS);
  assert.match(out, /public repository — no credential needed/);
  // No credential is written and no helper is configured…
  assert.doesNotMatch(out, /> \/home\/builder\/\.git-credentials/);
  assert.doesNotMatch(out, /credential\.helper store/);
  // …but the unconditional `rm -f` stays. Removing a file that was never
  // created is free, and making cleanup conditional is how a credential
  // survives a path nobody thought about.
  assert.match(out, /rm -f \/home\/builder\/\.git-credentials/);
});

test("a clone URL carrying credentials is REFUSED, not cleaned up downstream", () => {
  assert.throws(
    () => renderCloudInit(req({ cloneUrl: "https://x-access-token:ghs_leak@github.com/a/b.git" }), URLS),
    /embedded credentials/,
    "must fail loudly at render time",
  );
});

test("the log is scrubbed before upload, and scrubbing precedes the PUT", () => {
  // Matched `sed -E -i` until streaming landed. The flag was the thing that had
  // to go — an in-place edit truncates a file tee is appending to — so this now
  // asserts the PROPERTY it always meant: a redaction pass exists, and it is
  // defined before anything is uploaded.
  const out = renderCloudInit(req(), URLS);
  const sedIdx = out.indexOf("sed -E");
  const putIdx = out.indexOf(URLS.logPut);
  assert.ok(sedIdx !== -1, "expected a redaction pass");
  assert.ok(putIdx !== -1, "expected the log to be uploaded somewhere");
  assert.ok(sedIdx < putIdx, "redaction must happen BEFORE the log is uploaded");
});

test("redaction covers the shapes that actually leak here", () => {
  const out = renderCloudInit(req(), URLS);
  // user:pass@host, GitHub token prefixes, and presigned-URL signature params —
  // the presigned R2 URLs are capability credentials and curl prints them on failure.
  assert.match(out, /x-access-token\|ghs_\|ghp_\|github_pat_/);
  assert.match(out, /X-Amz-Signature/);
});

test("single quotes in a substituted value are refused rather than escaped", () => {
  assert.throws(
    () => renderCloudInit(req({ gitRef: "main'; rm -rf /" }), URLS),
    /single quote/,
    "values land inside single quotes; a quote would break out",
  );
});

test("a specific commit is checked out, not just the branch tip", () => {
  // A webhook records the sha from the push event and the worker builds later.
  // Without this, a branch that moved in between produces a deployment row
  // asserting a commit it did not build.
  const s = renderCloudInit(req({ gitSha: "63c6674c478b697fc20a6412c78a5f7a2dcf14be" }), URLS);
  assert.match(s, /GIT_SHA_REQUESTED='63c6674c478b697fc20a6412c78a5f7a2dcf14be'/);
  assert.match(s, /fetch --depth=1 origin "\$GIT_SHA_REQUESTED"/);
  assert.match(s, /checkout --detach FETCH_HEAD/);
});

test("HEAD means the branch tip and skips the checkout", () => {
  const s = renderCloudInit(req({ gitSha: "HEAD" }), URLS);
  assert.match(s, /GIT_SHA_REQUESTED='HEAD'/, "the request is recorded in the script");
  assert.doesNotMatch(s, /fetch --depth=1 origin 'HEAD'/, "HEAD must not become a fetch argument");
});

test("a sha that is not a commit is REFUSED at render time", () => {
  // It reaches a git fetch argument and comes from a webhook payload, so shape
  // is checked rather than trusted.
  for (const bad of ["main; rm -rf /", "../../etc", "not-a-sha", "63c6674", "--upload-pack=evil"]) {
    assert.throws(
      () => renderCloudInit(req({ gitSha: bad }), URLS),
      /is not a commit sha/,
      `expected refusal for ${JSON.stringify(bad)}`,
    );
  }
});

test("THE LOG IS NEVER EDITED IN PLACE, because tee holds it open", () => {
  // `sed -i` replaces the file's inode. The build's stdout is piped through
  // `tee` into that file, so an in-place edit mid-build leaves tee writing to
  // an unlinked inode and every subsequent line disappears. It was safe while
  // redaction ran exactly once after all output; streaming puts it on a timer,
  // and this is the assertion that stops it coming back.
  const out = renderCloudInit(req({ gitToken: "ghs_x" }), URLS);
  assert.doesNotMatch(out, /sed -E -i/, "redaction must write a copy, never edit in place");
  assert.match(out, /redact_log\(\) \{/, "redaction must be a reusable function");
  assert.doesNotMatch(
    out,
    /--data-binary @\/var\/log\/ahura-build\.log/,
    "the RAW log must never be uploaded — only the scrubbed copy",
  );
});

test("live log chunks are scrubbed BEFORE they leave the machine", () => {
  // Streaming raw output and redacting afterwards publishes the credential and
  // then tidies up after it. Every periodic upload runs the same redaction the
  // final one does.
  const out = renderCloudInit(req({ gitToken: "ghs_x" }), URLS);
  const streamBody = out.slice(out.indexOf("stream_log() {"), out.indexOf("finish() {"));
  const redactIdx = streamBody.indexOf("redact_log");
  const putIdx = streamBody.indexOf("curl -sS -X PUT");
  assert.ok(redactIdx > 0 && putIdx > 0, "the streamer must both redact and upload");
  assert.ok(redactIdx < putIdx, "redaction must precede the upload in every iteration");
});

test("the streamer is killed before the final upload, not after", () => {
  // A periodic upload racing the final one can land after it and replace a
  // complete log with a stale snapshot. The symptom would be a truncated log
  // on a build that finished perfectly — unreproducible and blamed on storage.
  const out = renderCloudInit(req({ gitToken: "ghs_x" }), URLS);
  const killIdx = out.indexOf('kill "$STREAM_PID"');
  const finalPut = out.lastIndexOf("--data-binary @/tmp/ahura-build.clean");
  assert.ok(killIdx > 0, "the streamer must be stopped explicitly");
  assert.ok(finalPut > 0, "there must still be a final upload");
  assert.ok(killIdx < finalPut, "kill must come before the last upload");
});

test("the streamer starts before the slow setup, not after it", () => {
  // apt and buildkit take the first minute or two. A machine that dies during
  // setup must still leave an explanation, which it cannot do if streaming
  // only begins once the build proper starts.
  const out = renderCloudInit(req(), URLS);
  const startIdx = out.indexOf("stream_log &");
  const aptIdx = out.indexOf("apt-get update");
  assert.ok(startIdx > 0 && aptIdx > 0, "both steps must be present");
  assert.ok(startIdx < aptIdx, "streaming must start before apt");
});

/* ── build-time environment ───────────────────────────────────────────────── */
//
// Applications that validate configuration during the BUILD — @t3-oss/env-nextjs
// throws inside `next build` when DATABASE_URL is missing — could not be
// deployed here at all, however completely the customer filled in their
// environment. These travel as a buildkit secret mount, never as a build arg:
// an arg is recorded in the image and readable by anyone who can pull it.

function decodeSecretsFile(out: string): string {
  const line = out.split("\n").find((l) => l.includes("ahura-secrets.env") && l.includes("base64 -d"));
  assert.ok(line, "expected a line materialising the secrets file");
  const b64 = /echo '([A-Za-z0-9+/=]*)'/.exec(line!)?.[1] ?? "";
  return Buffer.from(b64, "base64").toString("utf8");
}

test("the build gets a secret mount, not a build arg", () => {
  const out = renderCloudInit(req({ buildSecrets: { DATABASE_URL: "postgres://u:p@h/db" } }), URLS);
  assert.match(out, /--secret id=ahura-env,src=\/tmp\/ahura-secrets\.env/);
  // If this ever became a build arg it would be baked into the image.
  assert.doesNotMatch(out, /build-arg:DATABASE_URL/);
});

test("A SECRET VALUE IS NEVER A SHELL TOKEN", () => {
  // The build sources this file. An unquoted value would be split at the first
  // space, and a connection string with a space in the password is ordinary.
  const out = renderCloudInit(req({ buildSecrets: { PASS: "a b c" } }), URLS);
  assert.equal(decodeSecretsFile(out), "export PASS='a b c'");
});

test("a value containing a quote survives the round trip", () => {
  const out = renderCloudInit(req({ buildSecrets: { PASS: "it's" } }), URLS);
  // sh has no escape inside single quotes, so the only way to include one is to
  // close, emit an escaped quote, and reopen: '\''. Built here rather than
  // written as a literal, because a literal of this is unreadable in every
  // direction at once.
  const closeEscapeReopen = "'" + "\\" + "'" + "'";
  assert.equal(decodeSecretsFile(out), `export PASS='it${closeEscapeReopen}s'`);
});

test("A NEWLINE IN A VALUE CANNOT FORGE ANOTHER VARIABLE", () => {
  const out = renderCloudInit(req({ buildSecrets: { A: "one\nexport B=two" } }), URLS);
  const file = decodeSecretsFile(out);
  // The property that matters is that the newline stays INSIDE the quotes, so sh
  // reads one assignment. Counting lines that begin with `export` does NOT test
  // that — the customer's own value legitimately contains that text, and a file
  // that had genuinely broken out would look identical by that measure.
  assert.equal(file, "export A='one\nexport B=two'");
  assert.ok(file.startsWith("export A='"), "the value must open quoted");
  assert.ok(file.endsWith("'"), "and stay quoted to the end");
});
test("a key that is not a shell name is refused outright", () => {
  assert.throws(
    () => renderCloudInit(req({ buildSecrets: { "NOT A NAME": "x" } }), URLS),
    /not a usable shell name/,
  );
  assert.throws(() => renderCloudInit(req({ buildSecrets: { "A;rm -rf /": "x" } }), URLS), /shell name/);
});

test("the secrets file is locked down and removed", () => {
  const out = renderCloudInit(req({ buildSecrets: { A: "12345678" } }), URLS);
  assert.match(out, /chmod 600 \/tmp\/ahura-secrets\.env/);
  assert.match(out, /rm -f \/tmp\/ahura-secrets\.env/);
});

test("a project with no server-side environment still builds", () => {
  // The mount is not `required=true` and the Dockerfile tests for the file, so
  // the empty case has to be the safe one — it is by far the most common.
  const out = renderCloudInit(req(), URLS);
  assert.equal(decodeSecretsFile(out), "");
  assert.match(out, /--secret id=ahura-env/);
});

test("EVERY ASSERTION ABOVE CAN ACTUALLY FAIL", () => {
  // Without this, a renderer that emitted an empty secrets file always would
  // pass most of the tests above.
  const out = renderCloudInit(req({ buildSecrets: { TOKEN: "abcd1234" } }), URLS);
  assert.notEqual(decodeSecretsFile(out), "");
  assert.match(decodeSecretsFile(out), /TOKEN/);
});

test("THE LAST BUILD ARG IS NOT DROPPED", () => {
  // The build-args file is written without a trailing newline, and `read`
  // returns non-zero on a final line that has none — so a plain
  // `while read -r line` never runs its body for that line. With one variable
  // that is every variable. Confirmed against a real /bin/sh:
  //
  //   printf 'A=1\nB=2' | while IFS= read -r l; do echo "$l"; done      -> A=1
  //   printf 'A=1\nB=2' | while IFS= read -r l || [ -n "$l" ]; do ...   -> A=1 B=2
  //
  // It stayed invisible while buildArgs was hardcoded empty. The first public
  // value ever passed went missing, and the build failed inside the customer's
  // own env validation with nothing pointing at us.
  const out = renderCloudInit(req({ buildArgs: { NEXT_PUBLIC_URL: "https://x" } }), URLS);
  const loop = out.split("\n").find((l) => l.includes("while IFS= read -r line"));
  assert.ok(loop, "expected the build-arg loop");
  assert.match(loop!, /\|\| \[ -n "\$line" \]/, "the loop must read a final unterminated line");
});
