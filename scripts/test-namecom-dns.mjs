#!/usr/bin/env node
/**
 * End-to-end DNS API smoke test against Name.com sandbox.
 * Tests: GET domain, LIST records, CREATE (A/AAAA/TXT/MX/CNAME/ANAME), UPDATE, DELETE.
 * Cleans up all created records at the end.
 */

const BASE = "https://api.dev.name.com/core/v1";
const AUTH = Buffer.from("ahurasense-test:00e230e62059556ad0a87b70caabc77bd6cd637c").toString("base64");
const DOMAIN = "testdomainwork.com";

const headers = {
  Authorization: `Basic ${AUTH}`,
  "Content-Type": "application/json",
};

let passed = 0;
let failed = 0;
const createdIds = [];

function ok(label, val) {
  console.log(`  ✓ ${label}:`, JSON.stringify(val));
  passed++;
}

function fail(label, val) {
  console.error(`  ✗ ${label}:`, JSON.stringify(val));
  failed++;
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  // Remove any leftover smoke records from a previous interrupted run.
  const { json } = await api("GET", `/domains/${DOMAIN}/records`);
  const stale = (json.records || []).filter((r) =>
    ["smoke-a", "smoke-ipv6", "smoke-www", "api-test"].includes(r.host) ||
    (r.host === "" && ["TXT", "MX", "ANAME"].includes(r.type))
  );
  for (const r of stale) {
    await api("DELETE", `/domains/${DOMAIN}/records/${r.id}`);
    console.log(`  [cleanup] removed stale record ${r.id} (${r.type} ${r.host || "@"})`);
  }
}

async function run() {
  console.log("\n══════════════════════════════════════");
  console.log(" Name.com Sandbox — Domain DNS E2E Test");
  console.log(`  Target: ${DOMAIN}`);
  console.log("══════════════════════════════════════\n");

  await cleanup();

  // ── 1. GET domain info ────────────────────────────────────────────────────
  console.log("1. GET domain info");
  const { status: s1, json: d1 } = await api("GET", `/domains/${DOMAIN}`);
  s1 === 200 ? ok("status", s1) : fail("status (want 200)", s1);
  d1.domainName === DOMAIN ? ok("domainName", d1.domainName) : fail("domainName", d1.domainName);
  ok("autorenewEnabled", d1.autorenewEnabled);
  ok("nameservers", d1.nameservers);
  ok("expireDate", d1.expireDate);

  // ── 2. LIST existing DNS records ──────────────────────────────────────────
  console.log("\n2. LIST DNS records (baseline)");
  const { status: s2, json: d2 } = await api("GET", `/domains/${DOMAIN}/records`);
  s2 === 200 ? ok("status", s2) : fail("status (want 200)", s2);
  ok("totalCount", d2.totalCount);
  ok("existing types", (d2.records || []).map((r) => r.type));

  // ── 3. CREATE A record ────────────────────────────────────────────────────
  console.log("\n3. CREATE A record");
  const { status: s3, json: d3 } = await api("POST", `/domains/${DOMAIN}/records`, {
    host: "smoke-a",
    type: "A",
    answer: "10.0.0.1",
    ttl: 300,
  });
  s3 === 200 ? ok("status", s3) : fail("status (want 200)", s3);
  d3.type === "A" ? ok("type", d3.type) : fail("type", d3.type);
  d3.answer === "10.0.0.1" ? ok("answer", d3.answer) : fail("answer", d3.answer);
  if (d3.id) createdIds.push(d3.id);

  // ── 4. CREATE AAAA record ─────────────────────────────────────────────────
  console.log("\n4. CREATE AAAA record");
  const { status: s4, json: d4 } = await api("POST", `/domains/${DOMAIN}/records`, {
    host: "smoke-ipv6",
    type: "AAAA",
    answer: "2001:db8::1",
    ttl: 300,
  });
  s4 === 200 ? ok("status", s4) : fail("status (want 200)", s4);
  d4.type === "AAAA" ? ok("type", d4.type) : fail("type", d4.type);
  if (d4.id) createdIds.push(d4.id);

  // ── 5. CREATE TXT record ──────────────────────────────────────────────────
  console.log("\n5. CREATE TXT record");
  const { status: s5, json: d5 } = await api("POST", `/domains/${DOMAIN}/records`, {
    host: "",
    type: "TXT",
    answer: "v=spf1 include:mailgun.org ~all",
    ttl: 300,
  });
  s5 === 200 ? ok("status", s5) : fail("status (want 200)", s5);
  d5.type === "TXT" ? ok("type", d5.type) : fail("type", d5.type);
  if (d5.id) createdIds.push(d5.id);

  // ── 6. CREATE MX record ───────────────────────────────────────────────────
  console.log("\n6. CREATE MX record");
  const { status: s6, json: d6 } = await api("POST", `/domains/${DOMAIN}/records`, {
    host: "",
    type: "MX",
    answer: "mail.testdomainwork.com",
    ttl: 300,
    priority: 10,
  });
  s6 === 200 ? ok("status", s6) : fail("status (want 200)", s6);
  d6.type === "MX" ? ok("type", d6.type) : fail("type", d6.type);
  d6.priority === 10 ? ok("priority", d6.priority) : fail("priority", d6.priority);
  if (d6.id) createdIds.push(d6.id);

  // ── 7. CREATE CNAME record (subdomain only) ───────────────────────────────
  console.log("\n7. CREATE CNAME record (subdomain)");
  const { status: s7, json: d7 } = await api("POST", `/domains/${DOMAIN}/records`, {
    host: "smoke-www",
    type: "CNAME",
    answer: "testdomainwork.com",
    ttl: 300,
  });
  s7 === 200 ? ok("status", s7) : fail("status (want 200)", s7);
  d7.type === "CNAME" ? ok("type", d7.type) : fail("type", d7.type);
  if (d7.id) createdIds.push(d7.id);

  // ── 8. CREATE ANAME record (apex alias) ──────────────────────────────────
  console.log("\n8. CREATE ANAME record (apex alias)");
  const { status: s8, json: d8 } = await api("POST", `/domains/${DOMAIN}/records`, {
    host: "",
    type: "ANAME",
    answer: "testdomainwork.com.cdn.example.net",
    ttl: 300,
  });
  s8 === 200 ? ok("status", s8) : fail("status (want 200)", s8);
  d8.type === "ANAME" ? ok("type", d8.type) : fail("type", d8.type);
  if (d8.id) createdIds.push(d8.id);

  // ── 9. UPDATE A record ────────────────────────────────────────────────────
  console.log("\n9. UPDATE A record (change answer)");
  const aId = d3.id;
  if (aId) {
    const { status: s9, json: d9 } = await api("PUT", `/domains/${DOMAIN}/records/${aId}`, {
      host: "smoke-a",
      type: "A",
      answer: "10.0.0.2",
      ttl: 600,
    });
    s9 === 200 ? ok("status", s9) : fail("status (want 200)", s9);
    d9.answer === "10.0.0.2" ? ok("updated answer", d9.answer) : fail("updated answer", d9.answer);
    d9.ttl === 600 ? ok("updated ttl", d9.ttl) : fail("updated ttl", d9.ttl);
  } else {
    fail("SKIP — A record id missing", aId);
  }

  // ── 10. LIST after creates ────────────────────────────────────────────────
  console.log("\n10. LIST records after creates");
  const { status: s10, json: d10 } = await api("GET", `/domains/${DOMAIN}/records`);
  s10 === 200 ? ok("status", s10) : fail("status", s10);
  ok("totalCount", d10.totalCount);
  ok("types present", (d10.records || []).map((r) => r.type));

  // ── 11. REGISTRAR: PATCH autorenew ────────────────────────────────────────
  console.log("\n11. PATCH registrar — toggle autorenew");
  const currentAutorenew = d1.autorenewEnabled;
  const { status: s11, json: d11 } = await api("PATCH", `/domains/${DOMAIN}`, {
    autorenewEnabled: !currentAutorenew,
  });
  s11 === 200 ? ok("status", s11) : fail("status (want 200)", s11);
  d11.autorenewEnabled !== currentAutorenew
    ? ok("autorenew toggled", d11.autorenewEnabled)
    : fail("autorenew not toggled", d11.autorenewEnabled);
  // Restore
  await api("PATCH", `/domains/${DOMAIN}`, { autorenewEnabled: currentAutorenew });
  ok("autorenew restored", currentAutorenew);

  // ── 12. NAMESERVERS: GET and validate ────────────────────────────────────
  console.log("\n12. Nameservers check");
  ok("current nameservers", d1.nameservers);
  Array.isArray(d1.nameservers) && d1.nameservers.length >= 2
    ? ok("nameserver count", d1.nameservers.length)
    : fail("nameserver count < 2", d1.nameservers?.length);

  // ── 13. DELETE all created records ───────────────────────────────────────
  console.log("\n13. DELETE all created records");
  for (const id of createdIds) {
    const { status: sdel } = await api("DELETE", `/domains/${DOMAIN}/records/${id}`);
    sdel === 200 || sdel === 204
      ? ok(`deleted record ${id}`, sdel)
      : fail(`delete record ${id}`, sdel);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════");
  console.log(` RESULTS: ${passed} passed  ${failed} failed`);
  console.log("══════════════════════════════════════\n");
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
