import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pushDeploys } from "./push-policy.ts";

test("production deploys on push by default", () => {
  assert.equal(pushDeploys("production", {}), true);
  assert.equal(pushDeploys("production", { deploy_on_push: null }), true);
  assert.equal(pushDeploys("production", { deploy_on_push: true }), true);
});

test("turning it off stops production pushes and only production pushes", () => {
  assert.equal(pushDeploys("production", { deploy_on_push: false }), false);
  // A team gating production on CI still wants a preview per branch.
  assert.equal(pushDeploys("preview", { deploy_on_push: false }), true);
});

test("every webhook consults the policy, so the three providers cannot drift", () => {
  // A rule enforced in one receiver and forgotten in another is the failure
  // this module exists to prevent: a customer who turned push-deploys off would
  // still get them through whichever provider was missed.
  for (const provider of ["github", "gitlab", "bitbucket"]) {
    const src = readFileSync(new URL(`../../app/api/v2/webhooks/${provider}/route.ts`, import.meta.url), "utf8");
    assert.match(src, /pushDeploys\(/, `${provider} webhook does not consult pushDeploys`);
  }
});
