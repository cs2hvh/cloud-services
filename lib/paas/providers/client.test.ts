import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as gitlab from "../gitlab/client.ts";
import * as bitbucket from "../bitbucket/client.ts";

const TOKEN = "glpat-SUPERSECRET-must-never-be-logged";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Record every URL requested, and reply from a queue. */
function stub(replies: Array<{ status?: number; body?: unknown; link?: string; text?: string }>) {
  const urls: string[] = [];
  let i = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    const r = replies[Math.min(i++, replies.length - 1)];
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      headers: new Headers(r.link ? { link: r.link } : {}),
      json: async () => r.body,
      text: async () => r.text ?? JSON.stringify(r.body ?? ""),
    } as Response;
  }) as typeof fetch;
  return urls;
}

const glProject = (over: Record<string, unknown> = {}) => ({
  id: 42,
  path_with_namespace: "group/sub/proj",
  visibility: "private",
  default_branch: "main",
  namespace: { full_path: "group/sub", kind: "group" },
  ...over,
});

// ── GitLab ──────────────────────────────────────────────────────────────────

test("gitlab lists projects into the normalised shape", async () => {
  stub([{ body: [glProject()] }]);
  const [r] = await gitlab.listRepos(gitlab.GITLAB_CLOUD, TOKEN, "42");
  assert.equal(r.provider, "gitlab");
  assert.equal(r.fullName, "group/sub/proj");
  assert.equal(r.defaultBranch, "main");
  assert.equal(r.account, "group/sub");
  assert.equal(r.connectionId, "42");
});

test("gitlab asks for Developer access, not merely membership", async () => {
  // A user can be a Reporter on hundreds of projects they cannot deploy.
  // Listing those puts entries in the picker that fail at clone time with a
  // permission error the customer has no way to resolve.
  const urls = stub([{ body: [] }]);
  await gitlab.listRepos(gitlab.GITLAB_CLOUD, TOKEN, "42");
  assert.match(urls[0], /min_access_level=30/);
  assert.match(urls[0], /membership=true/);
});

test("`internal` visibility counts as private", async () => {
  // Visible to any logged-in user of the instance is not public, and this flag
  // decides what a UI badges as exposed.
  stub([{ body: [glProject({ visibility: "internal" })] }]);
  const [r] = await gitlab.listRepos(gitlab.GITLAB_CLOUD, TOKEN, "42");
  assert.equal(r.private, true);

  stub([{ body: [glProject({ visibility: "public" })] }]);
  const [pub] = await gitlab.listRepos(gitlab.GITLAB_CLOUD, TOKEN, "42");
  assert.equal(pub.private, false);
});

test("a missing default branch is null, never guessed", async () => {
  stub([{ body: [glProject({ default_branch: null })] }]);
  const [r] = await gitlab.listRepos(gitlab.GITLAB_CLOUD, TOKEN, "42");
  assert.equal(r.defaultBranch, null);
});

test("gitlab follows the Link header across pages", async () => {
  const urls = stub([
    { body: [glProject()], link: '<https://gitlab.com/x>; rel="next"' },
    { body: [glProject({ id: 43, path_with_namespace: "group/other" })] },
  ]);
  const repos = await gitlab.listRepos(gitlab.GITLAB_CLOUD, TOKEN, "42");
  assert.equal(repos.length, 2);
  assert.equal(urls.length, 2);
  assert.match(urls[1], /page=2/);
});

test("gitlab refuses to return a silently truncated list", async () => {
  // A customer whose repository is missing from the picker cannot tell that
  // from it not existing.
  stub([{ body: [glProject()], link: '<https://x>; rel="next"' }]);
  await assert.rejects(() => gitlab.listRepos(gitlab.GITLAB_CLOUD, TOKEN, "42"), /truncated/);
});

test("a namespaced path is URL-encoded WHOLE, slashes included", async () => {
  // GitLab reads `group%2Fsub%2Fproj` as one path segment. Leaving the slashes
  // raw addresses a different endpoint entirely and 404s — which reads as
  // "repo not found" rather than "we built the URL wrong".
  const urls = stub([{ body: [] }]);
  await gitlab.listBranches(gitlab.GITLAB_CLOUD, TOKEN, "group/sub/proj");
  assert.match(urls[0], /\/projects\/group%2Fsub%2Fproj\/repository\/branches/);
  assert.ok(!urls[0].includes("/projects/group/sub/proj"), "raw slashes would hit another endpoint");
});

test("gitlab branches normalise commit.id to commit.sha", async () => {
  stub([{ body: [{ name: "main", commit: { id: "a".repeat(40) } }] }]);
  const [b] = await gitlab.listBranches(gitlab.GITLAB_CLOUD, TOKEN, "g/p");
  assert.equal(b.commit.sha, "a".repeat(40));
});

test("self-hosted GitLab is addressed at its own host", async () => {
  // Hardcoding gitlab.com would make every self-hosted connection 404 from the
  // wrong server, which reads as a missing repo.
  const urls = stub([{ body: [] }]);
  await gitlab.listRepos("https://git.example.com/", TOKEN, "1");
  assert.match(urls[0], /^https:\/\/git\.example\.com\/api\/v4\/projects/);
  assert.ok(!urls[0].includes("//api/v4"), "a trailing slash on the host must not double up");
});

test("the gitlab clone URL is CLEAN and the username is oauth2", async () => {
  const { cloneUrl, username } = gitlab.buildCloneUrl(gitlab.GITLAB_CLOUD, "group/sub/proj");
  assert.equal(cloneUrl, "https://gitlab.com/group/sub/proj.git");
  assert.ok(!cloneUrl.includes("@"), "no credential in the remote — git echoes it into build logs");
  assert.equal(username, "oauth2");
});

// ── Bitbucket ───────────────────────────────────────────────────────────────

const bbRepo = (over: Record<string, unknown> = {}) => ({
  uuid: "{repo}",
  full_name: "workspace/repo",
  is_private: true,
  mainbranch: { name: "main" },
  workspace: { uuid: "{ws}", slug: "workspace" },
  ...over,
});

test("bitbucket lists repositories into the normalised shape", async () => {
  stub([{ body: { values: [bbRepo()] } }]);
  const [r] = await bitbucket.listRepos(TOKEN, "{ws}");
  assert.equal(r.provider, "bitbucket");
  assert.equal(r.fullName, "workspace/repo");
  assert.equal(r.defaultBranch, "main");
  assert.equal(r.account, "workspace");
});

test("bitbucket asks for contributor role, not bare membership", async () => {
  const urls = stub([{ body: { values: [] } }]);
  await bitbucket.listRepos(TOKEN, "{ws}");
  assert.match(urls[0], /role=contributor/);
});

test("a repository with no commits has a null default branch", async () => {
  // `mainbranch` is null before the first commit. Guessing "main" here decides
  // production-vs-preview wrongly.
  stub([{ body: { values: [bbRepo({ mainbranch: null })] } }]);
  const [r] = await bitbucket.listRepos(TOKEN, "{ws}");
  assert.equal(r.defaultBranch, null);
});

test("bitbucket follows the `next` URL verbatim rather than rebuilding it", async () => {
  // Reconstructing the query breaks the moment they add a cursor parameter.
  const urls = stub([
    { body: { values: [bbRepo()], next: "https://api.bitbucket.org/2.0/repositories?page=2&cursor=xyz" } },
    { body: { values: [bbRepo({ full_name: "workspace/two" })] } },
  ]);
  const repos = await bitbucket.listRepos(TOKEN, "{ws}");
  assert.equal(repos.length, 2);
  assert.equal(urls[1], "https://api.bitbucket.org/2.0/repositories?page=2&cursor=xyz");
});

test("bitbucket refuses a silently truncated list", async () => {
  stub([{ body: { values: [bbRepo()], next: "https://api.bitbucket.org/2.0/x" } }]);
  await assert.rejects(() => bitbucket.listRepos(TOKEN, "{ws}"), /truncated/);
});

test("a branch with no target hash is dropped, not passed on", async () => {
  // It cannot be deployed and would become a picker entry that fails at build.
  stub([{ body: { values: [{ name: "ok", target: { hash: "b".repeat(40) } }, { name: "broken" }] } }]);
  const branches = await bitbucket.listBranches(TOKEN, "w/r");
  assert.deepEqual(branches.map((b) => b.name), ["ok"]);
});

test("the bitbucket clone URL is CLEAN and the username is x-token-auth", async () => {
  const { cloneUrl, username } = bitbucket.buildCloneUrl("workspace/repo");
  assert.equal(cloneUrl, "https://bitbucket.org/workspace/repo.git");
  assert.ok(!cloneUrl.includes("@"));
  // Three providers, three different literal usernames: GitHub x-access-token,
  // GitLab oauth2, Bitbucket x-token-auth. Each client states its own.
  assert.equal(username, "x-token-auth");
});

// ── the property that matters most ──────────────────────────────────────────

test("neither client puts the token in an error message", async () => {
  // A durable credential to a customer's whole account. This string reaches
  // logs, build output and error trackers.
  stub([{ status: 403, text: "Forbidden" }]);
  await assert.rejects(
    () => gitlab.listRepos(gitlab.GITLAB_CLOUD, TOKEN, "42"),
    (e: Error) => !e.message.includes(TOKEN) && /403/.test(e.message),
  );

  stub([{ status: 401, text: "Unauthorized" }]);
  await assert.rejects(
    () => bitbucket.listRepos(TOKEN, "{ws}"),
    (e: Error) => !e.message.includes(TOKEN) && /401/.test(e.message),
  );
});

test("neither client puts the token in a clone URL", async () => {
  // The single most expensive place it could land: git echoes the remote on
  // failure, and the build log is uploaded to R2 and served to the whole team.
  assert.ok(!gitlab.buildCloneUrl(gitlab.GITLAB_CLOUD, "g/p").cloneUrl.includes(TOKEN));
  assert.ok(!bitbucket.buildCloneUrl("w/r").cloneUrl.includes(TOKEN));
});

test("a 404 on file contents is null, not an exception", async () => {
  // Absence is the normal answer during framework detection — most repos have
  // no Dockerfile — and throwing would make detection failures indistinguishable
  // from API failures.
  stub([{ status: 404, text: "not found" }]);
  assert.equal(await gitlab.getFileContents(gitlab.GITLAB_CLOUD, TOKEN, "g/p", "Dockerfile", "main"), null);

  stub([{ status: 404, text: "not found" }]);
  assert.equal(await bitbucket.getFileContents(TOKEN, "w/r", "Dockerfile", "main"), null);
});

test("a 500 on file contents throws rather than reading as absent", async () => {
  // The distinction the whole codebase turns on: could-not-read is not
  // did-not-exist. A 500 read as "no Dockerfile" builds the wrong image.
  stub([{ status: 500, text: "boom" }]);
  await assert.rejects(() => gitlab.getFileContents(gitlab.GITLAB_CLOUD, TOKEN, "g/p", "Dockerfile", "main"));

  stub([{ status: 500, text: "boom" }]);
  await assert.rejects(() => bitbucket.getFileContents(TOKEN, "w/r", "Dockerfile", "main"));
});
