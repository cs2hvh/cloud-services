import { test } from "node:test";
import assert from "node:assert/strict";
import { ipv4InCidr, verifyRouting, CHALLENGE_PATH, type RoutingProbe } from "./domain-routing.ts";

/**
 * The case these exist for: a customer whose domain is on Cloudflare with the
 * orange cloud on — the DEFAULT when adding a record in their dashboard — has
 * DNS that resolves to Cloudflare's anycast addresses, not ours. Their setup is
 * correct and their traffic reaches us, and an IP comparison says "not pointed
 * at us".
 *
 * Verified live while writing this: `v2-express.ahurasense.com`, OUR OWN
 * hostname, resolves to 172.67.69.185 and 104.26.14.176 — Cloudflare addresses.
 * A naive gateway-IP check fails on our own domains.
 */

const probeReturning = (body: string | null): RoutingProbe => ({ fetchChallenge: async () => body });

// ── CIDR arithmetic ─────────────────────────────────────────────────────────

test("addresses inside a range match, outside do not", () => {
  assert.ok(ipv4InCidr("104.16.132.229", "104.16.0.0/13"));
  assert.ok(ipv4InCidr("172.67.69.185", "172.64.0.0/13"));
  assert.ok(!ipv4InCidr("8.8.8.8", "104.16.0.0/13"));
  assert.ok(!ipv4InCidr("172.63.255.255", "172.64.0.0/13"), "one below the range must not match");
  assert.ok(ipv4InCidr("172.64.0.0", "172.64.0.0/13"), "the first address in the range must match");
});

test("a /0 does not make everything match, and a /32 matches one address", () => {
  // `~0 << 32` is undefined in JS and evaluates to ~0, which would turn a /0
  // into a mask of all ones — every address matching every range, silently.
  assert.ok(ipv4InCidr("1.2.3.4", "0.0.0.0/0"));
  assert.ok(ipv4InCidr("203.0.113.7", "0.0.0.0/0"));
  assert.ok(ipv4InCidr("1.2.3.4", "1.2.3.4/32"));
  assert.ok(!ipv4InCidr("1.2.3.5", "1.2.3.4/32"));
});

test("malformed input is refused rather than coerced", () => {
  for (const [ip, cidr] of [
    ["not.an.ip.x", "104.16.0.0/13"],
    ["1.2.3.4", "104.16.0.0/33"],
    ["1.2.3.4", "104.16.0.0"],
    ["1.2.3.999", "104.16.0.0/13"],
    ["1.2.3", "104.16.0.0/13"],
  ] as const) {
    assert.equal(ipv4InCidr(ip, cidr), false, `${ip} in ${cidr} must be false`);
  }
});

// ── routing verdicts ────────────────────────────────────────────────────────

const lookupReturning = (addresses: string[], cnames: string[] = []) => ({
  addresses: async () => addresses,
  cnames: async () => cnames,
});

test("a CNAME to our target is routed, and costs no HTTP call", async () => {
  // The probe THROWS, so this fails loudly if the DNS-direct branch stops
  // short-circuiting — a regression that would otherwise only show as a slower
  // verification nobody notices.
  const v = await verifyRouting("app.customer.com", {
    expectedToken: "tok",
    cnameTarget: "cname.ahurasense.com",
    lookup: lookupReturning([], ["cname.ahurasense.com"]),
    probe: { fetchChallenge: async () => { throw new Error("probe must not be called when DNS already answered"); } },
  });
  assert.equal(v.routed, true);
  assert.equal(v.routed === true && v.via, "dns_direct");
});

test("an A record matching our gateway is routed", async () => {
  const v = await verifyRouting("app.customer.com", {
    expectedToken: "tok",
    gatewayIps: ["203.0.113.10"],
    lookup: lookupReturning(["203.0.113.10"]),
    probe: { fetchChallenge: async () => { throw new Error("must not be called"); } },
  });
  assert.equal(v.routed, true);
});

test("a CNAME to SOMEONE ELSE is not routed", async () => {
  // The paired proof for the branch above: matching must depend on the value.
  const v = await verifyRouting("app.customer.com", {
    expectedToken: "tok",
    cnameTarget: "cname.ahurasense.com",
    lookup: lookupReturning([], ["cname.competitor.com"]),
    probe: probeReturning(null),
  });
  assert.equal(v.routed, false);
});

test("PROXIED AND REACHING US is routed — the case the naive check gets wrong", async () => {
  // DNS says Cloudflare, not us. Requests still arrive. That is a correctly
  // configured customer and must not be reported as a misconfiguration.
  const v = await verifyRouting("proxied.customer.com", {
    expectedToken: "the-token",
    gatewayIps: ["203.0.113.10"],
    probe: probeReturning("the-token"),
  });
  assert.equal(v.routed, true);
  assert.equal(v.routed === true && v.via, "proxy_reaches_us");
});

test("a WRONG challenge body is not routed — the probe is not a pass-through", async () => {
  // Without this, a fetchChallenge that returned the expected token for anything
  // would make every domain verify, which is domain takeover.
  const v = await verifyRouting("someone-elses.com", {
    expectedToken: "the-token",
    gatewayIps: ["203.0.113.10"],
    probe: probeReturning("a-different-token"),
  });
  assert.equal(v.routed, false);
});

test("no answer and no response is UNVERIFIABLE, not a failure", async () => {
  // The distinction this codebase keeps: "we could not tell" must never be
  // reported to a customer as "you configured it wrong".
  const v = await verifyRouting("nx-domain-xyzq.invalid", {
    expectedToken: "tok",
    gatewayIps: ["203.0.113.10"],
    probe: probeReturning(null),
  });
  assert.equal(v.routed, false);
  assert.ok(
    v.routed === false && (v.reason === "unverifiable" || v.reason === "not_pointed_at_us"),
    "must be one of the two negative shapes, never a throw",
  );
});

test("the challenge path is under .well-known and is stable", () => {
  // It goes in customer-facing documentation, so it is pinned rather than left
  // to be quietly renamed.
  assert.equal(CHALLENGE_PATH, "/.well-known/ahura-challenge");
});
