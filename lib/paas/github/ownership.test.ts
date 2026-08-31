import { test } from "node:test";
import assert from "node:assert/strict";
import { provesInstallationOwnership } from "./ownership.ts";

test("the account owner may claim their own installation", () => {
  assert.equal(provesInstallationOwnership("cs2hvh", "cs2hvh").proven, true);
});

test("GitHub logins are case-insensitive", () => {
  // Refusing over a capital letter locks the legitimate owner out for a reason
  // they cannot see anywhere.
  assert.equal(provesInstallationOwnership("CS2HVH", "cs2hvh").proven, true);
  assert.equal(provesInstallationOwnership("cs2hvh", "Cs2Hvh").proven, true);
});

test("A STRANGER MAY NOT CLAIM SOMEONE ELSE'S INSTALLATION", () => {
  // The whole reason this exists. Before it, the route proved only that the
  // installation was one of ours and then bound it to the CALLER's team, so a
  // real-but-unclaimed id handed a signed-in stranger deploy access to another
  // account's repositories.
  const v = provesInstallationOwnership("vedendra-singh", "cs2hvh");
  assert.equal(v.proven, false);
  assert.equal(v.proven === false && v.code, "different-account");
});

test("TWO BLANKS MUST NOT COMPARE EQUAL", () => {
  // The recurring shape: a caller with no GitHub identity, and an installation
  // whose account GitHub did not name, would match under a naive equality and
  // bind an unknown installation to an unknown person.
  for (const [caller, account] of [
    [null, null],
    ["", ""],
    ["   ", "   "],
    [undefined, undefined],
  ] as Array<[string | null | undefined, string | null | undefined]>) {
    assert.equal(
      provesInstallationOwnership(caller, account).proven,
      false,
      `${JSON.stringify(caller)} vs ${JSON.stringify(account)} must not prove ownership`,
    );
  }
});

test("no GitHub identity refuses, and says which problem it is", () => {
  // Someone signed in with email or Google is not an attacker; they need to be
  // told to use the connect flow rather than shown a generic failure.
  const v = provesInstallationOwnership(null, "cs2hvh");
  assert.equal(v.proven, false);
  assert.equal(v.proven === false && v.code, "no-github-identity");
});

test("an account GitHub did not name refuses", () => {
  const v = provesInstallationOwnership("cs2hvh", null);
  assert.equal(v.proven, false);
  assert.equal(v.proven === false && v.code, "unknown-account");
});

test("an org install is refused here rather than guessed at", () => {
  // Correct: proving org admin needs the user's own OAuth token, which is not
  // stored for GitHub. It goes through /api/v2/git/connect, whose nonce cookie
  // proves the round trip. Refusing is a redirect, not a dead end.
  const v = provesInstallationOwnership("cs2hvh", "ahurasense-org");
  assert.equal(v.proven, false);
  assert.equal(v.proven === false && v.code, "different-account");
});

test("the check is not a pass-through in either direction", () => {
  // Always proving is the vulnerability; never proving locks everyone out.
  assert.equal(provesInstallationOwnership("a", "a").proven, true);
  assert.equal(provesInstallationOwnership("a", "b").proven, false);
});

test("a substring or prefix is not a match", () => {
  // "cs2" must not claim "cs2hvh", and vice versa.
  assert.equal(provesInstallationOwnership("cs2", "cs2hvh").proven, false);
  assert.equal(provesInstallationOwnership("cs2hvh", "cs2").proven, false);
  assert.equal(provesInstallationOwnership("cs2hvh-evil", "cs2hvh").proven, false);
});
