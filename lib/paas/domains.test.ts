import { test } from "node:test";
import assert from "node:assert/strict";
import { claimable, mintClaim, normaliseDomain, verifyClaim, VERIFY_PREFIX, type Resolver } from "./domains.ts";

/**
 * The v1 defect these exist against: `resolveOwnershipMode` asked the registrar
 * whether the PLATFORM knew a domain, with no user scoping, so every domain in
 * the shared account auto-verified for any authenticated user.
 *
 * The tests therefore concentrate on the claim being unforgeable and the
 * failure modes staying distinct, rather than on the happy path — the happy
 * path was never the problem.
 */

/** A resolver that answers from a fixture, so the tests do not depend on the internet. */
function fakeResolver(answers: Record<string, string[][] | Error>): Resolver {
  return {
    resolveTxt: async (name) => {
      const a = answers[name];
      if (a === undefined) {
        const e = new Error("queryTxt ENOTFOUND") as NodeJS.ErrnoException;
        e.code = "ENOTFOUND";
        throw e;
      }
      if (a instanceof Error) throw a;
      return a;
    },
  };
}

// ── the token must be unforgeable ───────────────────────────────────────────

test("tokens are unique per claim, even for the same domain", () => {
  // A token derived from the domain would be forgeable by anyone who knows the
  // domain — which is everyone, since it is the thing being claimed.
  const a = mintClaim("example.com");
  const b = mintClaim("example.com");
  assert.notEqual(a.token, b.token);
  assert.ok(a.token.length >= 40, `token is only ${a.token.length} chars`);
});

test("the challenge record is under a name only DNS control can write", () => {
  const c = mintClaim("Example.COM");
  assert.equal(c.domain, "example.com");
  assert.equal(c.recordName, `${VERIFY_PREFIX}.example.com`);
});

// ── verification ────────────────────────────────────────────────────────────

test("a published token verifies", async () => {
  const c = mintClaim("example.com");
  const r = fakeResolver({ [c.recordName]: [[c.token]] });
  assert.equal((await verifyClaim(c, r)).ok, true);
});

test("a WRONG token does not verify — the check is not a pass-through", async () => {
  // Without this, a verifyClaim returning {ok:true} unconditionally would
  // satisfy every other test here while accepting any domain from anyone.
  const c = mintClaim("example.com");
  const r = fakeResolver({ [c.recordName]: [["not-the-token"]] });
  const out = await verifyClaim(c, r);
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.reason, "mismatch");
});

test("ANOTHER claim's token does not verify this claim", async () => {
  // The v1 bug in miniature: a token that is valid *somewhere* must not be
  // valid *here*. Ownership is per-claim, never platform-wide.
  const mine = mintClaim("example.com");
  const theirs = mintClaim("example.com");
  const r = fakeResolver({ [mine.recordName]: [[theirs.token]] });
  assert.equal((await verifyClaim(mine, r)).ok, false);
});

test("a token over 255 bytes is rejoined before comparison", async () => {
  // DNS splits long TXT values into chunks. Comparing the chunks separately
  // would fail a correct token for a reason that has nothing to do with control.
  const c = mintClaim("example.com");
  const half = Math.ceil(c.token.length / 2);
  const r = fakeResolver({ [c.recordName]: [[c.token.slice(0, half), c.token.slice(half)]] });
  assert.equal((await verifyClaim(c, r)).ok, true);
});

test("one matching record among several is enough", async () => {
  // Domains legitimately carry multiple TXT records at one name. Requiring
  // exclusivity would fail verification for reasons unrelated to control.
  const c = mintClaim("example.com");
  const r = fakeResolver({ [c.recordName]: [["v=spf1 -all"], [c.token], ["something-else"]] });
  assert.equal((await verifyClaim(c, r)).ok, true);
});

// ── the three failure shapes stay distinct ──────────────────────────────────

test("absent is not the same as unresolvable", async () => {
  // The distinction this project keeps everywhere: "the record is not there" is
  // an ANSWER; "DNS did not respond" is the absence of one. Collapsing them
  // tells a customer with correct DNS that they configured it wrong, during an
  // outage that is ours.
  const c = mintClaim("example.com");

  const absent = await verifyClaim(c, fakeResolver({}));
  assert.equal(absent.ok === false && absent.reason, "not_found");

  const servfail = new Error("queryTxt ESERVFAIL") as NodeJS.ErrnoException;
  servfail.code = "ESERVFAIL";
  const broken = await verifyClaim(c, fakeResolver({ [c.recordName]: servfail }));
  assert.equal(broken.ok === false && broken.reason, "unresolvable");
});

test("an empty answer is not_found, not a match", async () => {
  const c = mintClaim("example.com");
  const out = await verifyClaim(c, fakeResolver({ [c.recordName]: [] }));
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.reason, "not_found");
});

// ── what may be claimed at all ──────────────────────────────────────────────

test("the platform's own zone cannot be claimed", () => {
  // The takeover from the other direction: claiming a name inside our wildcard
  // would route a platform hostname through the custom-domain path.
  assert.equal(claimable("ahurasense.com", "ahurasense.com").ok, false);
  assert.equal(claimable("api.ahurasense.com", "ahurasense.com").ok, false);
  assert.equal(claimable("anything.ahurasense.com", "ahurasense.com").ok, false);
  assert.equal(claimable("customer.com", "ahurasense.com").ok, true);
  // A domain that merely ENDS in the same letters is a different domain.
  assert.equal(claimable("notahurasense.com", "ahurasense.com").ok, true);
});

test("URLs, paths and ports are refused rather than cleaned up", () => {
  // Silently "fixing" input means a claim for one thing becomes a claim for
  // another. Refusing is the only safe answer.
  for (const bad of [
    "https://example.com",
    "example.com/path",
    "example.com:8080",
    "user@example.com",
    "exa mple.com",
    "example.com#x",
    "",
    "localhost",
    "-lead.example.com",
    "a".repeat(64) + ".com",
  ]) {
    assert.equal(normaliseDomain(bad), null, `${JSON.stringify(bad)} must not normalise`);
  }
});

test("legitimate domains normalise, including trailing dot and case", () => {
  // The guard is worthless if it refuses everything — that would also pass the
  // test above.
  assert.equal(normaliseDomain("Example.COM."), "example.com");
  assert.equal(normaliseDomain("  app.customer.co.uk  "), "app.customer.co.uk");
  assert.equal(normaliseDomain("xn--80ak6aa92e.com"), "xn--80ak6aa92e.com");
});
