import { test } from "node:test";
import assert from "node:assert/strict";
import { tenantNetworkPolicy } from "./manifests.ts";

const except = (p: ReturnType<typeof tenantNetworkPolicy>): string[] =>
  (p.spec.egress[1].to[0] as { ipBlock: { except: string[] } }).ipBlock.except;

test("the private ranges and the metadata endpoint are always denied", () => {
  const e = except(tenantNetworkPolicy("app-x"));
  for (const cidr of ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16"]) {
    assert.ok(e.includes(cidr), `${cidr} must be denied`);
  }
});

test("THE API SERVER'S REAL ADDRESS IS DENIED, because the ClusterIP is not enough", () => {
  // Measured, not assumed. The kubernetes ClusterIP (10.128.0.1) sits inside
  // 10.0.0.0/8 and LOOKS covered by the line above. It is not: kube-proxy DNATs
  // it to the real endpoint before egress policy is evaluated, and on LKE that
  // endpoint is PUBLIC — so the policy saw a public destination and allowed it.
  // A tenant pod completed a TCP connection to the API server while cross-tenant
  // traffic was correctly refused.
  const e = except(tenantNetworkPolicy("app-x", ["172.236.163.171/32"]));
  assert.ok(e.includes("172.236.163.171/32"));
});

test("an empty endpoint list does not silently drop the base denials", () => {
  // The read can fail. When it does the policy must still be the old policy —
  // weaker than intended, but not weaker than before. A spread that swallowed
  // the base list on an empty read would turn a failed lookup into an open
  // egress policy.
  assert.equal(except(tenantNetworkPolicy("app-x", [])).length, 4);
  assert.equal(except(tenantNetworkPolicy("app-x")).length, 4);
});

test("egress to the internet is still allowed — isolation is not a disconnection", () => {
  // The control, in test form. A policy that denied everything would pass every
  // assertion above while breaking every customer app, and the failure would
  // look like isolation working.
  const p = tenantNetworkPolicy("app-x");
  const rule = p.spec.egress[1].to[0] as { ipBlock: { cidr: string } };
  assert.equal(rule.ipBlock.cidr, "0.0.0.0/0");
});

test("DNS is reachable, or nothing resolves and every app breaks", () => {
  const dns = tenantNetworkPolicy("app-x").spec.egress[0];
  assert.deepEqual(
    (dns.ports as Array<{ port: number }>).map((x) => x.port),
    [53, 53],
  );
});

test("ingress reaches tenant pods ONLY from the platform namespace", () => {
  // The other half of isolation. Without this, any pod in any namespace could
  // reach a customer's container directly, bypassing the gateway entirely.
  const p = tenantNetworkPolicy("app-x");
  assert.deepEqual(p.spec.policyTypes, ["Ingress", "Egress"]);
  const from = p.spec.ingress[0].from[0] as { namespaceSelector: { matchLabels: Record<string, string> } };
  assert.equal(from.namespaceSelector.matchLabels["kubernetes.io/metadata.name"], "ahura-system");
});
