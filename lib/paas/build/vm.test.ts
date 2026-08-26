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
    gitSha: "abc1234",
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

test("the credential is removed immediately after the clone", () => {
  const out = renderCloudInit(req({ gitToken: "ghs_x" }), URLS);
  const rmIdx = out.indexOf("rm -f /home/builder/.git-credentials");
  const cloneIdx = out.indexOf("clone --depth=1");
  assert.ok(rmIdx > cloneIdx, "credential file must be deleted after the clone, not before");
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
  const out = renderCloudInit(req(), URLS);
  const sedIdx = out.indexOf("sed -E -i");
  const putIdx = out.indexOf(URLS.logPut);
  assert.ok(sedIdx !== -1, "expected a redaction pass");
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
