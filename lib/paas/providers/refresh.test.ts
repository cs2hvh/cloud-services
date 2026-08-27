import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { refreshToken, refreshIfNeeded, type RefreshInput } from "./refresh.ts";
import type { Fetcher } from "./oauth.ts";

const NOW = new Date("2026-08-27T12:00:00Z");

before(() => {
  process.env.V2_ENV_MASTER_KEY = randomBytes(32).toString("base64");
});

function stub(status: number, body: unknown) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fetcher: Fetcher = async (url, init) => {
    const i = init as { headers?: Record<string, string>; body?: string } | undefined;
    calls.push({ url, headers: i?.headers ?? {}, body: i?.body ?? "" });
    return {
      ok: status < 400,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { fetcher, calls };
}

const input = (over: Partial<RefreshInput> = {}): RefreshInput => ({
  provider: "gitlab",
  refreshToken: "old-rt",
  clientId: "cid",
  clientSecret: "csec",
  ...over,
});

const GOOD = { access_token: "new-at", refresh_token: "new-rt", expires_in: 7200 };

test("a refresh returns the new pair", async () => {
  const { fetcher } = stub(200, GOOD);
  const t = await refreshToken(input(), fetcher, NOW);
  assert.equal(t.accessToken, "new-at");
  assert.equal(t.refreshToken, "new-rt");
  assert.equal(t.expiresAt, new Date(NOW.getTime() + 7200_000).toISOString());
});

test("it RETURNS rather than writes, because the write is the dangerous half", async () => {
  // Both providers rotate the refresh token and invalidate the old one, so a
  // refresh that succeeds remotely and fails to persist locally leaves us
  // holding a dead credential. The caller does the write and can fail loudly.
  const { fetcher } = stub(200, GOOD);
  const t = await refreshToken(input(), fetcher, NOW);
  assert.ok("accessToken" in t && "refreshToken" in t, "the caller persists these");
});

test("A RESPONSE WITH NO NEW REFRESH TOKEN IS REFUSED", async () => {
  // Storing null would convert a refreshable connection into one that dies at
  // the next expiry with no way back — and the old refresh token is already
  // invalid by then, because both providers rotate.
  const { fetcher } = stub(200, { access_token: "new-at", expires_in: 7200 });
  await assert.rejects(() => refreshToken(input(), fetcher, NOW), /no new refresh token/);
});

test("gitlab sends client credentials in the BODY", async () => {
  const { fetcher, calls } = stub(200, GOOD);
  await refreshToken(input(), fetcher, NOW);
  assert.match(calls[0].body, /client_id=cid/);
  assert.match(calls[0].body, /grant_type=refresh_token/);
  assert.ok(!calls[0].headers.Authorization, "no Basic header for gitlab");
});

test("bitbucket sends them as HTTP BASIC", async () => {
  // In the body they return a 401 that reads exactly like an expired refresh
  // token, which sends someone to re-authorise a customer for a header.
  const { fetcher, calls } = stub(200, GOOD);
  await refreshToken(input({ provider: "bitbucket" }), fetcher, NOW);
  assert.ok(calls[0].headers.Authorization?.startsWith("Basic "));
  assert.ok(!calls[0].body.includes("client_secret"));
  assert.equal(calls[0].url, "https://bitbucket.org/site/oauth2/access_token");
});

test("a self-hosted gitlab refreshes at its own host", async () => {
  const { fetcher, calls } = stub(200, GOOD);
  await refreshToken(input({ host: "https://git.example.com/" }), fetcher, NOW);
  assert.equal(calls[0].url, "https://git.example.com/oauth/token");
});

test("an OAuth error in a 200 body is still a failure", async () => {
  const { fetcher } = stub(200, { error: "invalid_grant", error_description: "expired" });
  await assert.rejects(() => refreshToken(input(), fetcher, NOW), /invalid_grant/);
});

test("a missing refresh token is refused before any call", async () => {
  const { fetcher, calls } = stub(200, GOOD);
  await assert.rejects(() => refreshToken(input({ refreshToken: "" }), fetcher, NOW), /no refresh token/);
  assert.equal(calls.length, 0, "nothing was sent");
});

test("neither the refresh token nor the secret appears in an error", async () => {
  const { fetcher } = stub(401, { error: "invalid_grant" });
  await assert.rejects(
    () => refreshToken(input({ refreshToken: "SECRET-RT", clientSecret: "SECRET-CS" }), fetcher, NOW),
    (e: Error) => !e.message.includes("SECRET-RT") && !e.message.includes("SECRET-CS"),
  );
});

// ── the wrapper ─────────────────────────────────────────────────────────────

const soon = new Date(NOW.getTime() + 60_000).toISOString();
const later = new Date(NOW.getTime() + 3600_000).toISOString();

test("a token with time left is not refreshed", async () => {
  const { fetcher, calls } = stub(200, GOOD);
  const r = await refreshIfNeeded({ ...input(), expiresAt: later }, fetcher, NOW);
  assert.deepEqual(r, { action: "not-needed" });
  assert.equal(calls.length, 0);
});

test("a token near expiry is refreshed", async () => {
  const { fetcher } = stub(200, GOOD);
  const r = await refreshIfNeeded({ ...input(), expiresAt: soon }, fetcher, NOW);
  assert.equal(r.action, "refreshed");
  assert.equal(r.action === "refreshed" && r.tokens.accessToken, "new-at");
});

test("an UNKNOWN expiry refreshes rather than assuming forever", async () => {
  const { fetcher } = stub(200, GOOD);
  const r = await refreshIfNeeded({ ...input(), expiresAt: null }, fetcher, NOW);
  assert.equal(r.action, "refreshed");
});

test("A FAILED REFRESH IS NOT A DEAD CONNECTION", async () => {
  // The stored token may still work — providers are inconsistent about
  // enforcing expiry — so treating a refresh failure as fatal would take down a
  // working connection because a token endpoint was briefly unavailable.
  const { fetcher } = stub(503, { error: "temporarily_unavailable" });
  const r = await refreshIfNeeded({ ...input(), expiresAt: soon }, fetcher, NOW);
  assert.equal(r.action, "failed");
  assert.equal(r.action === "failed" && r.oldCredentialStillValid, true);
});

test("refreshIfNeeded reports instead of throwing", async () => {
  // A throw here would propagate out of a repo listing and lose every other
  // provider's result.
  const { fetcher } = stub(200, { access_token: "a" });
  const r = await refreshIfNeeded({ ...input(), expiresAt: soon }, fetcher, NOW);
  assert.equal(r.action, "failed", "no new refresh token — reported, not thrown");
});
