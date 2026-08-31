import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptConnectionToken } from "./credentials.ts";
import { hexToBuffer, resolveToken, listReposForTeam, type ConnectionRow } from "./adapter.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

before(() => {
  process.env.V2_ENV_MASTER_KEY = randomBytes(32).toString("base64");
  process.env.V2_ENV_MASTER_KEY_ID = "mk1";
});

function connection(over: Partial<ConnectionRow> = {}): ConnectionRow {
  const e = encryptConnectionToken("gitlab", "42", "access", "tok");
  return {
    provider: "gitlab",
    external_id: "42",
    account_login: "acme",
    access_token_ct: `\\x${e.tokenCt.toString("hex")}`,
    token_dek_id: e.dekId,
    token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    provider_metadata: null,
    ...over,
  };
}

// ── bytea decoding ──────────────────────────────────────────────────────────

test("PostgREST's \\x hex round-trips", () => {
  const buf = hexToBuffer("\\xdeadbeef");
  assert.equal(buf?.toString("hex"), "deadbeef");
  assert.equal(hexToBuffer("deadbeef")?.toString("hex"), "deadbeef", "bare hex works too");
});

test("an unreadable bytea is null rather than a throw", () => {
  // One broken credential must not take down the listing for every other
  // provider the team holds.
  assert.equal(hexToBuffer("\\xnothex"), null);
  assert.equal(hexToBuffer("\\xabc"), null, "odd length is not hex");
  assert.equal(hexToBuffer("\\x"), null);
  assert.equal(hexToBuffer(null), null);
});

// ── token resolution ────────────────────────────────────────────────────────

test("a stored credential decrypts", () => {
  const r = resolveToken(connection());
  assert.equal("token" in r && r.token, "tok");
});

test("a connection with no credential explains itself", () => {
  const r = resolveToken(connection({ access_token_ct: null, token_dek_id: null }));
  assert.ok("error" in r && /no stored credential/.test(r.error));
  assert.ok("error" in r && r.error.includes("acme"), "names the connection so it can be found");
});

test("a credential encrypted for ANOTHER connection fails to decrypt", () => {
  const other = encryptConnectionToken("gitlab", "99", "access", "tok");
  const r = resolveToken(connection({ access_token_ct: `\\x${other.tokenCt.toString("hex")}` }));
  assert.ok("error" in r && /could not be decrypted/.test(r.error));
});

test("a decryption failure names the connection, never the ciphertext or key", () => {
  const other = encryptConnectionToken("gitlab", "99", "access", "supersecret-token");
  const r = resolveToken(connection({ access_token_ct: `\\x${other.tokenCt.toString("hex")}` }));
  assert.ok("error" in r);
  assert.ok(!("error" in r && r.error.includes("supersecret-token")));
  assert.ok(!("error" in r && r.error.includes(process.env.V2_ENV_MASTER_KEY!)));
});

test("an expired token is REPORTED, not refused outright", () => {
  // Providers are inconsistent about enforcing expiry. Refusing on a clock
  // comparison alone would hide a working connection.
  const r = resolveToken(connection({ token_expires_at: new Date(Date.now() - 60_000).toISOString() }));
  assert.ok("token" in r, "still decrypts and returns the token");
});

// ── the fan-out ─────────────────────────────────────────────────────────────

function stubFetch(handler: (url: string) => { status?: number; body?: unknown }) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const r = handler(String(input));
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      headers: new Headers(),
      json: async () => r.body,
      text: async () => JSON.stringify(r.body ?? ""),
    } as Response;
  }) as typeof fetch;
}

const glProject = { id: 1, path_with_namespace: "acme/api", visibility: "private", default_branch: "main", namespace: { full_path: "acme" } };
const bbRepo = { uuid: "{r}", full_name: "acme/web", is_private: true, mainbranch: { name: "main" }, workspace: { slug: "acme" } };

test("a working provider lists its repos", async () => {
  stubFetch(() => ({ body: [glProject] }));
  const [l] = await listReposForTeam([connection()]);
  assert.equal(l.provider, "gitlab");
  assert.equal(l.repos?.length, 1);
  assert.equal(l.error, null);
});

test("A FAILED PROVIDER RETURNS null, NOT AN EMPTY LIST", async () => {
  // The property the whole type exists for. An empty list invites "connect your
  // account"; an error invites "retry".
  stubFetch(() => ({ status: 502, body: {} }));
  const [l] = await listReposForTeam([connection()]);
  assert.equal(l.repos, null, "null means unread — [] would mean 'you have none'");
  assert.ok(l.error);
});

test("one provider failing does not lose another's results", async () => {
  const bb = encryptConnectionToken("bitbucket", "{ws}", "access", "bbtok");
  stubFetch((url) =>
    url.includes("bitbucket")
      ? { body: { values: [bbRepo] } }
      : { status: 500, body: {} },
  );

  const listings = await listReposForTeam([
    connection(),
    connection({
      provider: "bitbucket",
      external_id: "{ws}",
      account_login: "acme",
      access_token_ct: `\\x${bb.tokenCt.toString("hex")}`,
      token_dek_id: bb.dekId,
    }),
  ]);

  const gl = listings.find((l) => l.provider === "gitlab");
  const bbL = listings.find((l) => l.provider === "bitbucket");
  assert.equal(gl?.repos, null, "gitlab failed");
  assert.equal(bbL?.repos?.length, 1, "bitbucket still returned");
});

test("a PARTIALLY read provider reports as failed, not as complete", async () => {
  // Two connections on one provider; the second throws. Returning the first
  // one's repositories as the whole answer is the same lie as an empty list and
  // harder to notice.
  let call = 0;
  stubFetch(() => (call++ === 0 ? { body: [glProject] } : { status: 500, body: {} }));

  const second = encryptConnectionToken("gitlab", "77", "access", "tok2");
  const [l] = await listReposForTeam([
    connection(),
    connection({
      external_id: "77",
      account_login: "other",
      access_token_ct: `\\x${second.tokenCt.toString("hex")}`,
      token_dek_id: second.dekId,
    }),
  ]);

  assert.equal(l.repos, null, "half a provider's repos must not present as all of them");
  assert.ok(l.error);
});

test("two connections on one provider merge into ONE listing", async () => {
  // The provider is the unit the chooser is built on, not the connection.
  stubFetch(() => ({ body: [glProject] }));
  const second = encryptConnectionToken("gitlab", "77", "access", "tok2");
  const listings = await listReposForTeam([
    connection(),
    connection({
      external_id: "77",
      account_login: "other",
      access_token_ct: `\\x${second.tokenCt.toString("hex")}`,
      token_dek_id: second.dekId,
    }),
  ]);
  assert.equal(listings.length, 1);
  assert.equal(listings[0].repos?.length, 2);
});

test("a self-hosted GitLab connection is asked at its OWN host", async () => {
  // A team may hold a gitlab.com connection and a self-hosted one; using one
  // host for both 404s the other.
  const urls: string[] = [];
  stubFetch((url) => {
    urls.push(url);
    return { body: [] };
  });
  await listReposForTeam([connection({ provider_metadata: { host: "https://git.example.com" } })]);
  assert.ok(urls[0].startsWith("https://git.example.com/api/v4"));
});

test("a connection with a broken credential fails only its own provider", async () => {
  stubFetch(() => ({ body: { values: [bbRepo] } }));
  const bb = encryptConnectionToken("bitbucket", "{ws}", "access", "bbtok");
  const listings = await listReposForTeam([
    connection({ access_token_ct: null, token_dek_id: null }),
    connection({
      provider: "bitbucket",
      external_id: "{ws}",
      access_token_ct: `\\x${bb.tokenCt.toString("hex")}`,
      token_dek_id: bb.dekId,
    }),
  ]);
  assert.equal(listings.find((l) => l.provider === "gitlab")?.repos, null);
  assert.equal(listings.find((l) => l.provider === "bitbucket")?.repos?.length, 1);
});

test("no connections is an empty listing set, not a failure", async () => {
  assert.deepEqual(await listReposForTeam([]), []);
});
