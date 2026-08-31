import { test } from "node:test";
import assert from "node:assert/strict";
import { cidrContains, checkNetpolicies, REQUIRED_DENIED_CIDRS, type NetpolicyInput } from "./netpolicy-drift.ts";

// The live cluster on 2026-08-26: ClusterIP 10.128.0.1, real endpoint public.
const ENDPOINT = "172.236.163.171";
const FULL = [...REQUIRED_DENIED_CIDRS, `${ENDPOINT}/32`];

function input(over: Partial<NetpolicyInput> = {}): NetpolicyInput {
  return {
    namespaces: [{ namespace: "app-prj-1", policies: [{ name: "tenant-isolation", deniedCidrs: FULL }], pods: 1 }],
    controlPlaneEndpoints: [ENDPOINT],
    ...over,
  };
}

test("a /32 of the endpoint covers it", () => {
  assert.equal(cidrContains(`${ENDPOINT}/32`, ENDPOINT), true);
  assert.equal(cidrContains(`${ENDPOINT}/32`, "172.236.163.172"), false);
});

test("a broader block covering the endpoint also counts", () => {
  // The fix does not have to be a /32. A policy denying the whole /24 protects
  // the endpoint, and reporting that as drift would be a false alarm.
  assert.equal(cidrContains("172.236.163.0/24", ENDPOINT), true);
  assert.equal(cidrContains("172.236.0.0/16", ENDPOINT), true);
});

test("the private ranges contain what they are supposed to", () => {
  assert.equal(cidrContains("10.0.0.0/8", "10.128.0.1"), true, "the API ClusterIP is inside 10/8");
  assert.equal(cidrContains("169.254.0.0/16", "169.254.169.254"), true, "cloud metadata");
  assert.equal(cidrContains("172.16.0.0/12", ENDPOINT), false, "172.236 is NOT inside 172.16/12");
});

test("/0 matches everything, which a naive shift gets backwards", () => {
  // `-1 << 32` is -1 in JS, not 0, so a /0 mask computed that way would match
  // nothing instead of everything — the exact inversion of what it means.
  assert.equal(cidrContains("0.0.0.0/0", ENDPOINT), true);
  assert.equal(cidrContains("0.0.0.0/0", "10.0.0.1"), true);
});

test("an unparseable cidr is null, neither covered nor uncovered", () => {
  // Null is not false: an entry this cannot read might be the one covering the
  // address, and either default is a wrong answer stated confidently.
  assert.equal(cidrContains("not-a-cidr", ENDPOINT), null);
  assert.equal(cidrContains("10.0.0.0/33", ENDPOINT), null);
  assert.equal(cidrContains("10.0.0.0/8", "999.1.1.1"), null);
});

test("a correctly configured namespace is protected", () => {
  const r = checkNetpolicies(input());
  assert.equal(r.findings[0].verdict, "protected");
  assert.equal(r.clean, true);
  assert.equal(r.void, false);
});

test("a policy denying the private ranges but NOT the endpoint is the live bug", () => {
  // The finding this module exists for. Every private range denied, and the
  // control plane reachable anyway, because kube-proxy DNATs before the policy
  // is evaluated.
  const r = checkNetpolicies(
    input({ namespaces: [{ namespace: "app-prj-1", policies: [{ name: "tenant-isolation", deniedCidrs: [...REQUIRED_DENIED_CIDRS] }], pods: 1 }] }),
  );
  assert.equal(r.findings[0].verdict, "control-plane-reachable");
  assert.deepEqual(r.findings[0].reachableEndpoints, [ENDPOINT]);
  assert.equal(r.findings[0].urgent, true);
  assert.equal(r.clean, false);
  assert.match(r.findings[0].detail, /DNAT/);
});

test("an endpoint that MOVED reopens the hole on an unchanged policy", () => {
  // Nothing about the policy changed. The control plane did. This is the drift
  // this check exists to catch, and it produces no error anywhere else.
  const r = checkNetpolicies(input({ controlPlaneEndpoints: ["172.236.99.99"] }));
  assert.equal(r.findings[0].verdict, "control-plane-reachable");
  assert.deepEqual(r.findings[0].reachableEndpoints, ["172.236.99.99"]);
});

test("every current endpoint must be denied, not just one of them", () => {
  // A multi-master control plane has several. Covering one and missing another
  // is a hole, and a check satisfied by the first match would miss it.
  const r = checkNetpolicies(input({ controlPlaneEndpoints: [ENDPOINT, "172.236.99.99"] }));
  assert.equal(r.findings[0].verdict, "control-plane-reachable");
  assert.deepEqual(r.findings[0].reachableEndpoints, ["172.236.99.99"]);
});

test("a namespace with NO policy is the case walking policies cannot see", () => {
  const r = checkNetpolicies(input({ namespaces: [{ namespace: "app-prj-1", policies: [], pods: 2 }] }));
  assert.equal(r.findings[0].verdict, "unprotected");
  assert.equal(r.findings[0].urgent, true);
  assert.match(r.findings[0].detail, /nothing constrains/);
});

test("an empty namespace with no policy is a hole nobody is standing in yet", () => {
  const r = checkNetpolicies(input({ namespaces: [{ namespace: "app-prj-1", policies: [], pods: 0 }] }));
  assert.equal(r.findings[0].verdict, "unprotected");
  assert.equal(r.findings[0].urgent, false, "still a finding, but nothing is running through it");
});

test("a missing private range is reported even when the endpoint is denied", () => {
  const r = checkNetpolicies(
    input({
      namespaces: [
        { namespace: "app-prj-1", policies: [{ name: "p", deniedCidrs: ["10.0.0.0/8", `${ENDPOINT}/32`] }], pods: 1 },
      ],
    }),
  );
  assert.equal(r.findings[0].verdict, "incomplete");
  assert.ok(r.findings[0].missingCidrs.includes("169.254.0.0/16"));
});

test("unreadable policies are unevaluated, never protected", () => {
  const r = checkNetpolicies(input({ namespaces: [{ namespace: "app-prj-1", policies: null, pods: 1 }] }));
  assert.equal(r.findings[0].verdict, "unreadable");
  assert.equal(r.clean, false);
  assert.match(r.findings[0].detail, /unevaluated, not protected/);
});

test("unreadable endpoints VOID the run rather than making it clean", () => {
  // The deploy lane's control, pointed the other way. Their probe pod with no
  // network fails every negative test and reports perfect isolation; here an
  // unreadable endpoint list leaves nothing for a policy to fail against, so
  // every policy looks sufficient.
  const r = checkNetpolicies(input({ controlPlaneEndpoints: null }));
  assert.equal(r.void, true);
  assert.equal(r.clean, false, "correct policies do not make an unevaluated run clean");
  assert.match(r.voidReason ?? "", /could not be read/);
});

test("an EMPTY endpoint list voids too, rather than passing vacuously", () => {
  // Zero endpoints means every policy denies all of them. Trivially true and
  // worth nothing.
  const r = checkNetpolicies(input({ controlPlaneEndpoints: [] }));
  assert.equal(r.void, true);
  assert.equal(r.clean, false);
  assert.match(r.voidReason ?? "", /empty list/);
});

test("examining no namespaces is not a clean bill of health", () => {
  const r = checkNetpolicies(input({ namespaces: [] }));
  assert.equal(r.examined, 0);
  assert.equal(r.clean, false, "nothing examined cannot be clean");
});

test("the worst namespace is reported first", () => {
  const r = checkNetpolicies(
    input({
      namespaces: [
        { namespace: "fine", policies: [{ name: "p", deniedCidrs: FULL }], pods: 1 },
        { namespace: "open", policies: [], pods: 1 },
        { namespace: "dnat", policies: [{ name: "p", deniedCidrs: [...REQUIRED_DENIED_CIDRS] }], pods: 1 },
      ],
    }),
  );
  assert.equal(r.findings[0].namespace, "dnat");
  assert.equal(r.findings[1].namespace, "open");
  assert.equal(r.findings[2].namespace, "fine");
});
