import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCreateProject } from "../../app/api/v2/projects/create.ts";

/**
 * Creating a project on a provider that is not GitHub.
 *
 * The connect flows, webhook receivers, provider clients and the multi-provider
 * columns all existed before this — what was missing was every path that had to
 * NAME the provider. This route hardcoded `provider: "github"` on the insert and
 * required a numeric installation id, so a GitLab repository picked in the UI
 * would have been recorded as a GitHub project and then cloned from github.com.
 */

const base = { repo: "acme/widget", connectionId: "9d1e", provider: "bitbucket" };

test("a non-GitHub provider is carried into the plan, not defaulted away", () => {
  const r = validateCreateProject(base);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.plan.provider, "bitbucket");
  assert.equal(r.plan.connectionId, "9d1e");
});

test("A NON-NUMERIC CONNECTION ID IS ACCEPTED, because Bitbucket's is a UUID", () => {
  // There is no bigint that holds `{9d1e...}`. Requiring a number here is what
  // made the whole table GitHub-shaped in the first place.
  const r = validateCreateProject({ ...base, connectionId: "{9d1e8c4a-0000-4000-8000-000000000000}" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.plan.installationId, 0, "a UUID must not be parsed into a number");
});

test("an unknown provider is refused rather than silently treated as github", () => {
  const r = validateCreateProject({ ...base, provider: "gitea" });
  assert.equal(r.ok, false);
});

test("omitting the provider still means github, so older callers keep working", () => {
  const r = validateCreateProject({ repo: "acme/widget", installationId: 156779383 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.plan.provider, "github");
  // The GitHub spelling of the same field feeds the provider-agnostic one.
  assert.equal(r.plan.connectionId, "156779383");
  assert.equal(r.plan.installationId, 156779383);
});

test("a nested GitLab path is accepted, and refused everywhere else", () => {
  // GitLab nests. GitHub and Bitbucket are always exactly two segments, so the
  // looser grammar must not leak to them.
  assert.equal(validateCreateProject({ ...base, provider: "gitlab", repo: "group/sub/proj" }).ok, true);
  assert.equal(validateCreateProject({ ...base, provider: "bitbucket", repo: "group/sub/proj" }).ok, false);
  assert.equal(
    validateCreateProject({ repo: "group/sub/proj", installationId: 1, provider: "github" }).ok,
    false,
  );
});

test("a connection id is required on every provider", () => {
  // It selects which credential the build authenticates with. Defaulting it to
  // "any connection" would let one account's repository build with another
  // account's token.
  for (const provider of ["github", "gitlab", "bitbucket"]) {
    const r = validateCreateProject({ repo: "acme/widget", provider });
    assert.equal(r.ok, false, `${provider} accepted a request with no connection`);
  }
});

test("the slug still comes from the repository name on every provider", () => {
  for (const provider of ["github", "gitlab", "bitbucket"]) {
    const r = validateCreateProject({ repo: "acme/My_Widget", connectionId: "1", provider });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.plan.slug, "my-widget");
  }
});
