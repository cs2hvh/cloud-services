/**
 * A deploy hook joins a waiting build only when that build will check out the
 * branch head. A build pinned to a commit — every push, and Deploy in the
 * dashboard — builds exactly that commit however far the branch has moved, so
 * folding a hook call into one would answer "already_queued" and then deploy
 * something older than what the caller's CI just tested.
 *
 * The query is captured by stubbing fetch, so nothing here reaches a database;
 * the URL points at an unresolvable host in case the stub ever fails.
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deployments } from "./db.ts";

const realFetch = globalThis.fetch;
const saved = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
let requested: string[] = [];

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  requested = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requested.push(String(input));
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  restore("NEXT_PUBLIC_SUPABASE_URL", saved.url);
  restore("SUPABASE_SERVICE_ROLE_KEY", saved.key);
});

function filters(): URLSearchParams {
  assert.equal(requested.length, 1, "expected exactly one query");
  return new URL(requested[0]).searchParams;
}

test("a hook joins only a queued, unpinned build of the same branch", async () => {
  assert.equal(await deployments.waitingHeadBuild("env-1", "main"), null);
  const q = filters();
  assert.equal(q.get("environment_id"), "eq.env-1");
  assert.equal(q.get("state"), "eq.queued");
  // The point of it all: a row with a sha builds that sha, not the branch head.
  assert.equal(q.get("git_sha"), "is.null");
  assert.equal(q.get("git_ref"), "eq.main");
});

test("a branch name stays one filter value, whatever characters it holds", async () => {
  // Legal in a git branch name, and it would add a filter if it were not encoded.
  await deployments.waitingHeadBuild("env-1", "release/a&state=eq.ready");
  const q = filters();
  assert.equal(q.get("git_ref"), "eq.release/a&state=eq.ready");
  assert.deepEqual(q.getAll("state"), ["eq.queued"]);
});

test("the deploy hook route coalesces through it, on the production branch", () => {
  const src = readFileSync(new URL("../../app/api/v2/hooks/deploy/[token]/route.ts", import.meta.url), "utf8");
  assert.match(src, /deployments\.waitingHeadBuild\(env\.id, project\.production_branch\)/);
});
