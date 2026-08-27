import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  mintState,
  verifyState,
  parseTokenResponse,
  gitlabIdentity,
  bitbucketIdentity,
  STATE_TTL_SECONDS,
  type Fetcher,
} from "./oauth.ts";

const NOW = new Date("2026-08-27T12:00:00Z");
const later = (s: number) => new Date(NOW.getTime() + s * 1000);

before(() => {
  process.env.V2_ENV_MASTER_KEY = randomBytes(32).toString("base64");
});

/** A fetcher that replies once with the given status and body. */
function reply(status: number, body: unknown): Fetcher {
  return async () => ({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

// ── state ───────────────────────────────────────────────────────────────────

test("a minted state verifies and carries its team", () => {
  const s = mintState("gitlab", "team-abc", NOW);
  const r = verifyState(s, "gitlab", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.payload.teamRef, "team-abc");
});

test("state is bound to the TEAM, so a callback cannot be replayed at another", () => {
  // Without this, an attacker completes an authorisation they started against
  // a team they do not control. The team is signed, not merely passed.
  const s = mintState("gitlab", "team-victim", NOW);
  const r = verifyState(s, "gitlab", NOW);
  assert.equal(r.ok && r.payload.teamRef, "team-victim", "the callback reads the team from the SIGNATURE");
});

test("a tampered team is rejected, not silently honoured", () => {
  const s = mintState("gitlab", "team-abc", NOW);
  const [body, sig] = s.split(".");
  const forged = Buffer.from(JSON.stringify({ provider: "gitlab", teamRef: "team-attacker", issuedAt: Math.floor(NOW.getTime() / 1000), nonce: "x" }), "utf8").toString("base64url");
  assert.deepEqual(verifyState(`${forged}.${sig}`, "gitlab", NOW), { ok: false, reason: "bad-signature" });
  assert.ok(body);
});

test("a state minted for one provider does not work on another's callback", () => {
  // A genuine state we issued, replayed on the wrong callback. The signature
  // alone cannot notice — it IS valid — so the provider is checked separately.
  const s = mintState("gitlab", "team-abc", NOW);
  assert.deepEqual(verifyState(s, "bitbucket", NOW), { ok: false, reason: "provider-mismatch" });
});

test("state expires, because a stale authorisation URL is a live capability", () => {
  const s = mintState("gitlab", "team-abc", NOW);
  assert.equal(verifyState(s, "gitlab", later(STATE_TTL_SECONDS - 1)).ok, true);
  assert.deepEqual(verifyState(s, "gitlab", later(STATE_TTL_SECONDS + 1)), { ok: false, reason: "expired" });
});

test("a state from the FUTURE is refused rather than accepted", () => {
  // Negative age is clock skew. Accepting it makes the TTL unbounded for anyone
  // who can skew a clock.
  const s = mintState("gitlab", "team-abc", later(3600));
  assert.deepEqual(verifyState(s, "gitlab", NOW), { ok: false, reason: "expired" });
});

test("missing and malformed state are distinct from a bad signature", () => {
  assert.deepEqual(verifyState(null, "gitlab", NOW), { ok: false, reason: "missing" });
  assert.deepEqual(verifyState("", "gitlab", NOW), { ok: false, reason: "missing" });
  assert.deepEqual(verifyState("nodothere", "gitlab", NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(verifyState(".sig", "gitlab", NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(verifyState("body.", "gitlab", NOW), { ok: false, reason: "malformed" });
});

test("two states for the same team differ", () => {
  // A nonce, so an intercepted state cannot be reused alongside a fresh one.
  assert.notEqual(mintState("gitlab", "t", NOW), mintState("gitlab", "t", NOW));
});

test("minting without a signing key is fatal, never unsigned", () => {
  const saved = process.env.V2_ENV_MASTER_KEY;
  try {
    delete process.env.V2_ENV_MASTER_KEY;
    assert.throws(() => mintState("gitlab", "t", NOW), /not set/);
    assert.throws(() => verifyState("a.b", "gitlab", NOW), /not set/);
  } finally {
    process.env.V2_ENV_MASTER_KEY = saved;
  }
});

// ── token response ──────────────────────────────────────────────────────────

test("a token response becomes the stored shape", () => {
  const t = parseTokenResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }, NOW);
  assert.equal(t.accessToken, "at");
  assert.equal(t.refreshToken, "rt");
  assert.equal(t.expiresAt, later(3600).toISOString());
});

test("a missing expires_in becomes null, not a far-future date", () => {
  // needsRefresh treats null as "refresh before use" — one extra call, versus
  // stranding a build with a credential we assumed was alive.
  const t = parseTokenResponse({ access_token: "at" }, NOW);
  assert.equal(t.expiresAt, null);
  assert.equal(t.refreshToken, null);
});

test("an OAuth error in a 200 body is still an error", () => {
  // Providers return `{"error":"invalid_grant"}` with HTTP 200 often enough
  // that the status alone cannot be trusted.
  assert.throws(
    () => parseTokenResponse({ error: "invalid_grant", error_description: "code expired" }, NOW),
    /invalid_grant.*code expired/,
  );
});

test("a response with no access_token is refused", () => {
  assert.throws(() => parseTokenResponse({ token_type: "bearer" }, NOW), /no access_token/);
  assert.throws(() => parseTokenResponse({ access_token: "" }, NOW), /no access_token/);
  assert.throws(() => parseTokenResponse(null, NOW), /not an object/);
});

// ── identity ────────────────────────────────────────────────────────────────

test("gitlab identity comes from the token, not from any parameter", async () => {
  const id = await gitlabIdentity("https://gitlab.com", "tok", reply(200, { id: 7, username: "ada" }));
  assert.deepEqual(id, { externalId: "7", accountLogin: "ada", accountType: "user" });
});

test("a gitlab identity call that fails refuses to link", async () => {
  await assert.rejects(() => gitlabIdentity("https://gitlab.com", "tok", reply(401, {})), /401/);
  await assert.rejects(() => gitlabIdentity("https://gitlab.com", "tok", reply(200, {})), /no usable identity/);
  await assert.rejects(
    () => gitlabIdentity("https://gitlab.com", "tok", reply(200, { id: 7, username: "" })),
    /no usable identity/,
  );
});

test("bitbucket identity is the WORKSPACE uuid, with the slug as display only", async () => {
  const id = await bitbucketIdentity("tok", reply(200, { values: [{ uuid: "{ws}", slug: "acme" }] }));
  assert.deepEqual(id, { externalId: "{ws}", accountLogin: "acme", accountType: "workspace" });
});

test("a token granting SEVERAL workspaces is refused, not guessed", async () => {
  // Picking the first would bind whichever the API happened to order first,
  // and that ordering is not stable — the same token could link a different
  // workspace on a retry.
  await assert.rejects(
    () => bitbucketIdentity("tok", reply(200, { values: [{ uuid: "{a}", slug: "a" }, { uuid: "{b}", slug: "b" }] })),
    /Refusing to guess/,
  );
});

test("a token granting NO workspace is refused", async () => {
  await assert.rejects(() => bitbucketIdentity("tok", reply(200, { values: [] })), /no workspace/);
  await assert.rejects(() => bitbucketIdentity("tok", reply(200, {})), /no workspace/);
});

test("a workspace missing its uuid or slug is refused", async () => {
  await assert.rejects(() => bitbucketIdentity("tok", reply(200, { values: [{ slug: "acme" }] })), /no usable identity/);
  await assert.rejects(() => bitbucketIdentity("tok", reply(200, { values: [{ uuid: "{x}" }] })), /no usable identity/);
});

test("neither identity call puts the token in its error", async () => {
  const TOKEN = "SECRET-oauth-token";
  await assert.rejects(
    () => gitlabIdentity("https://gitlab.com", TOKEN, reply(403, { message: "forbidden" })),
    (e: Error) => !e.message.includes(TOKEN),
  );
  await assert.rejects(
    () => bitbucketIdentity(TOKEN, reply(403, { message: "forbidden" })),
    (e: Error) => !e.message.includes(TOKEN),
  );
});
