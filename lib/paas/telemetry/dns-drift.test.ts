/**
 * Hostname reconciliation tests.
 *
 *   node --test lib/paas/telemetry/dns-drift.test.ts
 *
 * The case that matters is `claimable`: a record pointing at our gateway with
 * no Ingress behind it. On a platform with untrusted signups that is a
 * hostname any tenant can capture by naming it in their own Ingress.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ingressHosts,
  isPlatformRecord,
  reconcileHostnames,
  type AliasLike,
  type DnsRecordLike,
  type IngressLike,
} from "./dns-drift.ts";

const GATEWAY = "172.236.185.23";
const APEX = "ahurasense.com";

function rec(name: string, over: Partial<DnsRecordLike> = {}): DnsRecordLike {
  return { id: `rec-${name}`, type: "A", name, content: GATEWAY, proxied: true, ...over };
}

function ing(host: string, namespace = "app-prj-x", name = "als-1"): IngressLike {
  return { namespace, name, hosts: [host] };
}

function alias(hostname: string, over: Partial<AliasLike> = {}): AliasLike {
  return { ref: `als_${hostname.split(".")[0]}`, hostname, kind: "production", deployment_id: "d1", ...over };
}

function run(over: Partial<Parameters<typeof reconcileHostnames>[0]> = {}) {
  return reconcileHostnames({
    records: [],
    ingresses: [],
    aliases: [],
    gatewayIp: GATEWAY,
    appDomain: APEX,
    ...over,
  });
}

// ── the security case ───────────────────────────────────────────────────────

test("a record pointing at the gateway with no Ingress is claimable, and says why", () => {
  const r = run({ records: [rec("v2-retired.ahurasense.com")] });

  assert.equal(r.claimable, 1);
  const f = r.findings[0];
  assert.equal(f.status, "claimable");
  assert.equal(f.live, true, "it resolves publicly right now");
  assert.equal(f.actionable, true);
  assert.match(f.action, /next Ingress to name it — in ANY tenant namespace/);
  assert.equal(r.clean, false);
});

test("the same hostname with an Ingress and an alias row is healthy", () => {
  const r = run({
    records: [rec("v2-express.ahurasense.com")],
    ingresses: [ing("v2-express.ahurasense.com")],
    aliases: [alias("v2-express.ahurasense.com")],
  });

  assert.equal(r.clean, true);
  assert.equal(r.claimable, 0);
  assert.equal(r.findings[0].status, "healthy");
});

test("claimable sorts above everything else, because it is the one that can be stolen", () => {
  const r = run({
    records: [
      rec("v2-live.ahurasense.com"),
      rec("v2-orphan.ahurasense.com"),
      rec("www.ahurasense.com", { content: "203.0.113.9" }),
    ],
    ingresses: [ing("v2-live.ahurasense.com")],
    aliases: [],
  });

  assert.equal(r.findings[0].status, "claimable");
  assert.deepEqual(
    r.findings.map((f) => f.status),
    ["claimable", "unrecorded", "foreign"],
  );
});

// ── never touch what is not ours ────────────────────────────────────────────

test("records pointing somewhere else are foreign, whatever their name", () => {
  assert.equal(isPlatformRecord(rec("www.ahurasense.com", { content: "203.0.113.9" }), GATEWAY, APEX), false);
  assert.equal(isPlatformRecord(rec("mail.ahurasense.com", { type: "MX" }), GATEWAY, APEX), false);
  assert.equal(isPlatformRecord(rec("elsewhere.example.com"), GATEWAY, APEX), false);
});

test("the apex itself is never a platform record, even pointed at the gateway", () => {
  assert.equal(isPlatformRecord(rec("ahurasense.com"), GATEWAY, APEX), false);
  const r = run({ records: [rec("ahurasense.com")] });
  assert.equal(r.findings[0].status, "foreign");
  assert.equal(r.clean, true, "the marketing site is not our drift");
});

test("a subdomain of a DIFFERENT zone that merely ends similarly is foreign", () => {
  // notahurasense.com must not match .ahurasense.com
  assert.equal(isPlatformRecord(rec("app.notahurasense.com"), GATEWAY, APEX), false);
});

test("trailing dots and case do not create a phantom mismatch", () => {
  const r = run({
    records: [rec("V2-Express.AhuraSense.com.")],
    ingresses: [ing("v2-express.ahurasense.com")],
    aliases: [alias("v2-express.ahurasense.com")],
  });
  assert.equal(r.findings[0].status, "healthy");
});

// ── the other directions ────────────────────────────────────────────────────

test("an Ingress with no DNS record is unreachable, not claimable", () => {
  const r = run({ ingresses: [ing("v2-new.ahurasense.com")] });

  const f = r.findings[0];
  assert.equal(f.status, "unreachable");
  assert.equal(f.live, false, "nothing resolves to it, so nobody can reach or steal it");
  assert.equal(f.actionable, true);
});

test("a live hostname with no alias row is unrecorded — publish-app.ts writes no rows", () => {
  const r = run({
    records: [rec("v2-flask.ahurasense.com")],
    ingresses: [ing("v2-flask.ahurasense.com")],
    aliases: [],
  });

  const f = r.findings[0];
  assert.equal(f.status, "unrecorded");
  assert.equal(f.live, true);
  assert.match(f.action, /Promote and rollback read this table/);
});

test("an alias row with a deployment but nothing serving it is a phantom", () => {
  const r = run({ aliases: [alias("v2-ghost.ahurasense.com")] });

  const f = r.findings[0];
  assert.equal(f.status, "phantom");
  assert.equal(f.actionable, true);
  assert.equal(f.live, false);
});

test("a reserved alias holding a hostname is not actionable — that is the uniqueness index working", () => {
  const r = run({ aliases: [alias("v2-reserved.ahurasense.com", { deployment_id: null })] });

  assert.equal(r.findings[0].status, "phantom");
  assert.equal(r.findings[0].actionable, false);
  assert.equal(r.clean, true);
});

test("a custom domain served by an Ingress is not reported as missing our DNS", () => {
  const r = run({ ingresses: [ing("shop.customer.example")] });
  assert.equal(r.findings.length, 0, "we do not mint records in someone else's zone");
});

// ── catch-all Ingress ───────────────────────────────────────────────────────

test("an Ingress rule with no host is surfaced as a catch-all, not silently ignored", () => {
  const parsed = ingressHosts({
    metadata: { name: "greedy", namespace: "app-prj-tenant" },
    spec: { rules: [{}] },
  });

  assert.deepEqual(parsed.hosts, ["*"]);
});

test("ingressHosts normalises and keeps every rule", () => {
  const parsed = ingressHosts({
    metadata: { name: "i", namespace: "n" },
    spec: { rules: [{ host: "A.Example.COM" }, { host: "b.example.com" }] },
  });
  assert.deepEqual(parsed.hosts, ["a.example.com", "b.example.com"]);
});

test("an Ingress with no rules at all routes nothing and does not throw", () => {
  assert.deepEqual(ingressHosts({ metadata: { name: "i", namespace: "n" } }).hosts, []);
});

// ── shape ───────────────────────────────────────────────────────────────────

test("an empty zone with an empty cluster is clean", () => {
  const r = run();
  assert.equal(r.findings.length, 0);
  assert.equal(r.clean, true);
  assert.equal(r.claimable, 0);
});

test("one hostname never produces two findings", () => {
  const r = run({
    records: [rec("v2-x.ahurasense.com")],
    ingresses: [ing("v2-x.ahurasense.com")],
    aliases: [alias("v2-x.ahurasense.com")],
  });
  assert.equal(r.findings.filter((f) => f.hostname === "v2-x.ahurasense.com").length, 1);
});
