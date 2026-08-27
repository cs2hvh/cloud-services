/**
 * Reserved hostname tests.
 *
 * Written against the day's lesson rather than just the feature: five of the
 * six bugs found across three sessions were guards that examined nothing and
 * reported success. So the first test here does not test hostnames at all — it
 * tests that the checker is capable of failing. A suite that only asserts
 * "good input passes" would go green against an empty reserved set, which is
 * the exact defect this module exists to prevent.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  LIVE_ZONE_LABELS,
  RESERVED_LABELS,
  assertLabelAvailable,
  checkLabel,
  previewLabel,
} from "./hostnames.ts";

// ── the anti-vacuity tests ──────────────────────────────────────────────────

test("the reserved set is not empty", () => {
  // An empty set reports every hostname as available. This is the failure the
  // module is written to prevent, so it is asserted before anything else.
  assert.ok(RESERVED_LABELS.size > 50, `reserved set has only ${RESERVED_LABELS.size} entries`);
});

test("every verdict reports how many labels it consulted", () => {
  // If checkedAgainst can be 0 on any path, a broken checker is indistinguishable
  // from an available name.
  for (const label of ["ok-name", "www", "", "UPPER", "-bad", "_acme-challenge", "12345"]) {
    const v = checkLabel(label);
    assert.equal(v.checkedAgainst, RESERVED_LABELS.size, `checkedAgainst was ${v.checkedAgainst} for ${JSON.stringify(label)}`);
    assert.ok(v.checkedAgainst > 0);
  }
});

test("the checker can actually refuse — it is not a pass-through", () => {
  // The paired detector proof. Without this, a checkLabel that returned
  // {ok:true} unconditionally would satisfy every other test in this file.
  const refusals = ["www", "api", "login", "_acme-challenge", "", "-x", "x-"].map((l) => checkLabel(l));
  assert.ok(refusals.every((v) => !v.ok), "a label that must be refused was accepted");
  assert.ok(refusals.every((v) => typeof v.reason === "string" && v.reason.length > 0));
});

test("assertLabelAvailable throws rather than returning a verdict nobody reads", () => {
  assert.throws(() => assertLabelAvailable("www"), /reserved/);
  assert.doesNotThrow(() => assertLabelAvailable("my-cool-app"));
});

// ── the live zone: the reason this exists ───────────────────────────────────

test("every live single-label record in the zone is reserved", () => {
  // Seeded 2026-08-26 from the real zone, where 23 single-label records were
  // live and NONE was protected. A tenant could have claimed api or www.
  for (const label of LIVE_ZONE_LABELS) {
    const v = checkLabel(label);
    assert.equal(v.ok, false, `${label} is live in the zone but was not reserved`);
  }
});

test("api and www specifically — the two that would be catastrophic", () => {
  assert.equal(checkLabel("api").ok, false);
  assert.equal(checkLabel("www").ok, false);
});

// ── phishing surface ────────────────────────────────────────────────────────

test("trust-bearing names are refused, because nothing breaks when they are taken", () => {
  // These matter more than the infrastructure names. Taking `api` breaks a
  // service and gets noticed within minutes. Taking `billing` breaks nothing
  // and collects credentials from a domain customers already trust.
  for (const label of ["login", "billing", "account", "secure", "verify", "support", "payment", "sso"]) {
    assert.equal(checkLabel(label).ok, false, `${label} should be reserved`);
  }
});

test("protocol prefixes are refused by shape, not by enumeration", () => {
  // _acme-challenge is the sharp one: a tenant holding it could complete a
  // certificate challenge for the apex domain.
  assert.equal(checkLabel("_acme-challenge").ok, false);
  // A name nobody thought to list must still be refused.
  assert.equal(checkLabel("_some-future-protocol").ok, false);
});

// ── structural validity ─────────────────────────────────────────────────────

test("structural problems are reported as such, not as reservations", () => {
  const cases: Array<[string, RegExp]> = [
    ["", /empty/],
    ["a".repeat(64), /63/],
    ["has space", /only/],
    ["has_underscore", /only/],
    ["-leading", /hyphen/],
    ["trailing-", /hyphen/],
    ["12345", /numeric/],
    ["xn--abc", /punycode/],
  ];
  for (const [label, pattern] of cases) {
    const v = checkLabel(label);
    assert.equal(v.ok, false, `${JSON.stringify(label)} should be refused`);
    assert.match(v.reason!, pattern, `wrong reason for ${JSON.stringify(label)}: ${v.reason}`);
  }
});

test("a 63-character label is allowed and a 64-character one is not", () => {
  // The boundary the wildcard certificate and DNS both care about. Asserted on
  // both sides so an off-by-one cannot pass.
  assert.equal(checkLabel("a".repeat(63)).ok, true);
  assert.equal(checkLabel("a".repeat(64)).ok, false);
});

// ── the names that must keep working ────────────────────────────────────────

test("ordinary app names are still allowed", () => {
  // The guard is worthless if it refuses everything — that would also pass a
  // suite that only checked refusals.
  for (const label of ["my-app", "acme-store", "blog2", "v2-express", "a", "x9"]) {
    const v = checkLabel(label);
    assert.equal(v.ok, true, `${label} should be allowed but was refused: ${v.reason}`);
  }
});

test("case and whitespace are normalised before the reserved check", () => {
  // The control cloud-services-2f flagged: case folding must happen BEFORE the
  // reserved lookup, or the whole thing is bypassed by shouting.
  assert.equal(checkLabel("WWW").ok, false);
  assert.equal(checkLabel("Api").ok, false);
  assert.equal(checkLabel("  api  ").ok, false);
  assert.equal(checkLabel("_ACME-Challenge").ok, false);
});

test("mixed-case ordinary names are folded and accepted, not rejected", () => {
  // DNS is case-insensitive, so `MyApp` is a legal request for `myapp` rather
  // than an error. Asserting the normalised value, not just that it passed —
  // otherwise a checker that accepted the raw string would satisfy this too.
  const v = checkLabel("MyApp");
  assert.equal(v.ok, true);
  assert.equal(v.label, "myapp");
});

// ── preview hostnames ───────────────────────────────────────────────────────

test("a preview label is a single legal DNS label", () => {
  // The constraint that is not stylistic: the wildcard covers ONE label deep,
  // so a nested preview host produces a TLS error rather than a 404.
  for (const branch of ["feature/JIRA-123_fix", "main", "release/v2.0.1", "WIP--messy..name"]) {
    const label = previewLabel("my-app", branch);
    const v = checkLabel(label);
    assert.equal(v.ok, true, `${branch} -> ${label} is not a usable label: ${v.reason}`);
    assert.ok(!label.includes("."), `${branch} -> ${label} must not contain a dot`);
  }
});

test("branches that truncate to the same prefix do NOT collide", () => {
  // Sanitise-and-truncate alone maps these to one label, and the second push
  // would silently take over the first branch's preview URL.
  const a = previewLabel("my-app", "feature/user-authentication-v1");
  const b = previewLabel("my-app", "feature/user-authentication-v2");
  assert.notEqual(a, b, "distinct branches must not share a preview hostname");
});

test("the same branch always mints the same label", () => {
  // A preview is per-branch and MOVES with new pushes, so the second push must
  // land on the hostname the customer already opened.
  assert.equal(previewLabel("my-app", "feature/x"), previewLabel("my-app", "feature/x"));
});

test("a very long project slug and branch still fit in 63 characters", () => {
  const label = previewLabel("a".repeat(40), "b".repeat(200));
  assert.ok(label.length <= 63, `label is ${label.length} chars`);
  assert.equal(checkLabel(label).ok, true);
});

test("a branch of only punctuation still yields a valid label", () => {
  // "///" sanitises to empty; without the hash the label would end in a hyphen
  // or be the bare slug, either of which collides with production.
  const label = previewLabel("my-app", "///");
  assert.equal(checkLabel(label).ok, true, `${label} is not usable`);
  assert.notEqual(label, "my-app", "a preview must never mint the production label");
});

test("THE FALLBACK ORIGIN CANNOT BE CLAIMED BY A TENANT", () => {
  // `fallback.ahurasense.com` is the Cloudflare for SaaS fallback origin: every
  // customer's custom domain resolves to it before the Ingress routes by Host.
  // A tenant claiming this label would receive EVERY customer's custom-domain
  // traffic — a cross-tenant hijack of the entire feature.
  //
  // It was claimable for about an hour. LIVE_ZONE_LABELS is a SNAPSHOT of the
  // zone, the record was created after that snapshot, and the deploy path's
  // collision check only asks whether another PROJECT holds a hostname — a bare
  // DNS record with no paas.aliases row is invisible to it.
  assert.throws(() => assertLabelAvailable("fallback"));
  assert.equal(checkLabel("fallback").ok, false);
});

test("every hostname the platform itself serves is reserved", () => {
  // The generalisation, so the next platform record added to the zone has a
  // place to be declared. Creating a platform DNS record IS a reservation, and
  // nothing enforces that except this list.
  for (const label of ["fallback", "activator", "registry", "traefik", "gateway"]) {
    assert.equal(checkLabel(label).ok, false, `${label} must be reserved`);
  }
});
