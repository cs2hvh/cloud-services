import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneTarget, commitUrl, repoUrl, fileContents, type GitProvider } from "./source.ts";

/**
 * The seam that stopped `deployFromRepo` from being GitHub-only.
 *
 * These are the pure halves — URL and credential shape. The network readers are
 * proven against live public repositories by scripts/v2/framework-probe.ts,
 * which is the only way to establish that an anonymous read actually works.
 */

const ALL: GitProvider[] = ["github", "gitlab", "bitbucket"];

test("every provider produces a clone URL on its own host", () => {
  const hosts: Record<GitProvider, string> = {
    github: "github.com",
    gitlab: "gitlab.com",
    bitbucket: "bitbucket.org",
  };
  for (const p of ALL) {
    const { cloneUrl } = cloneTarget(p, "acme/widget");
    assert.equal(new URL(cloneUrl).host, hosts[p], `${p} cloned from the wrong host`);
    assert.ok(cloneUrl.endsWith(".git"), `${p} clone URL is not a git URL`);
  }
});

test("THE CLONE URL NEVER CARRIES A CREDENTIAL", () => {
  // build/vm.ts refuses to render one that does, because git echoes the remote
  // URL on failure and the build log is served to team members. That refusal is
  // the backstop; this is the rule it backstops.
  for (const p of ALL) {
    const { cloneUrl } = cloneTarget(p, "acme/widget");
    assert.ok(!/@/.test(cloneUrl), `${p} clone URL contains an @`);
    assert.equal(new URL(cloneUrl).username, "", `${p} clone URL carries a username`);
    assert.equal(new URL(cloneUrl).password, "", `${p} clone URL carries a password`);
  }
});

test("each provider names the username ITS OWN api expects", () => {
  // Not cosmetic and not interchangeable: presenting a token as the wrong
  // username is rejected as a bad credential, not as a wrong username, so the
  // failure reads like a revoked token on a token that is perfectly good.
  assert.equal(cloneTarget("github", "a/b").username, "x-access-token");
  assert.equal(cloneTarget("gitlab", "a/b").username, "oauth2");
  assert.equal(cloneTarget("bitbucket", "a/b").username, "x-token-auth");
});

test("a nested GitLab path survives into the clone URL", () => {
  // GitLab nests — group/subgroup/project is an ordinary path there. Anything
  // that assumes exactly two segments corrupts it.
  const { cloneUrl } = cloneTarget("gitlab", "group/sub/project");
  assert.equal(cloneUrl, "https://gitlab.com/group/sub/project.git");
});

test("commit and repo links point at the provider the project lives on", () => {
  for (const p of ALL) {
    const c = commitUrl(p, "acme/widget", "abc123");
    const r = repoUrl(p, "acme/widget");
    assert.ok(c.includes("abc123"), `${p} commit URL lost the sha`);
    assert.equal(new URL(c).host, new URL(r).host, `${p} commit and repo links disagree on host`);
    assert.ok(!c.includes("github.com") || p === "github", `${p} commit URL points at GitHub`);
  }
});

test("A RATE LIMIT IS NOT AN ABSENT FILE", async () => {
  // 429 returning null would tell detection the file is not there, and the
  // customer would be told to add a package.json they already have. Bitbucket
  // allows sixty anonymous calls an hour and inspectRepo probes a dozen markers
  // per deploy, so this is reached in normal use, not only under abuse.
  const real = globalThis.fetch;
  const statuses = [429, 401, 500, 403];
  try {
    for (const status of statuses) {
      globalThis.fetch = (async () =>
        new Response("nope", { status })) as unknown as typeof fetch;
      for (const p of ALL) {
        await assert.rejects(
          () => fileContents(p, "acme/widget", "package.json", "main", null, null),
          new RegExp(String(status)),
          `${p} swallowed a ${status}`,
        );
      }
    }

    // 404 is the one status that means the file is genuinely not there.
    globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    for (const p of ALL) {
      assert.equal(
        await fileContents(p, "acme/widget", "package.json", "main", null, null),
        null,
        `${p} did not treat 404 as absent`,
      );
    }
  } finally {
    globalThis.fetch = real;
  }
});
