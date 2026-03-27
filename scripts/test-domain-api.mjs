#!/usr/bin/env node
/**
 * Domain API - Safe Endpoint Test Script
 * ─────────────────────────────────────────────────────────────────
 * Tests all domain v1 API endpoints that do NOT create purchases.
 * Domain "sabpatahai.guru" is used for lookups (already purchased).
 *
 * Usage:
 *   API_KEY=sk_live_... APP_ID=<your-app-uuid> node scripts/test-domain-api.mjs
 *   OR
 *   API_KEY=sk_live_... APP_ID=<your-app-uuid> BASE_URL=https://galaxyhvh.com node scripts/test-domain-api.mjs
 *
 * Safe operations tested (read-only / non-destructive):
 *   GET  /api/v1/domains                              — list domains for app
 *   GET  /api/v1/domains/market/summary               — marketplace metadata
 *   GET  /api/v1/domains/market/providers             — legacy providers (deprecated)
 *   POST /api/v1/domains/market/search                — domain availability search
 *   GET  /api/v1/domains/market/purchase-requests     — list existing purchase requests
 *
 * Not tested (requires new purchases / state changes):
 *   POST /api/v1/domains                             — adds a custom domain
 *   POST /api/v1/domains/{id}/verify                 — triggers DNS TXT verification
 *   POST /api/v1/domains/{id}/activate               — queues ingress provisioning
 *   POST /api/v1/domains/{id}/set-primary            — mutates primary flag
 *   DELETE /api/v1/domains/{id}                      — removes domain
 *   POST /api/v1/domains/market/purchase-requests    — creates new purchase (SKIP)
 *   POST /api/v1/domains/market/checkout             — creates new purchase (SKIP)
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const API_KEY  = process.env.API_KEY;
const APP_ID   = process.env.APP_ID;

const TEST_DOMAIN = "sabpatahai.guru"; // already purchased — safe to search/query

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function log(icon, label, ...args) {
  console.log(icon, `[${label}]`, ...args);
}

function ok(label, ...args)   { passed++; log("✅", label, ...args); }
function fail(label, ...args) { failed++; log("❌", label, ...args); }
function warn(label, ...args) {          log("⚠️ ", label, ...args); }
function info(label, ...args) {          log("ℹ️ ", label, ...args); }

async function req(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }

  return { status: res.status, body: json, raw: text, headers: Object.fromEntries(res.headers) };
}

// ── Schema checks ──────────────────────────────────────────────────

function checkRateHeaders(headers, test) {
  if (headers["x-ratelimit-limit"]) {
    ok(test, `Rate-limit headers present (limit=${headers["x-ratelimit-limit"]})`);
  } else {
    warn(test, "Missing X-RateLimit-Limit header");
  }
}

function checkDomainShape(domain, test) {
  const required = [
    "id","app_id","domain","status","verification_method","verification_token",
    "verified_at","activated_at","ssl_status","is_primary","redirect_to_primary",
    "last_error","last_check_at","created_at","updated_at",
  ];
  const missing = required.filter(k => !(k in domain));
  if (missing.length) {
    fail(test, `Domain object missing OpenAPI fields: ${missing.join(", ")}`);
  } else {
    ok(test, "Domain object matches OpenAPI DomainSchema fields");
  }

  if ("user_id" in domain) {
    fail(test, "SECURITY: user_id is leaking in domain response!");
  } else {
    ok(test, "user_id correctly stripped from domain response");
  }
}

function checkOperationShape(op, test) {
  const required = [
    "id","action","status","domain_id","error_code","error_message",
    "retryable","started_at","finished_at","created_at","updated_at",
  ];
  const missing = required.filter(k => !(k in op));
  if (missing.length) {
    fail(test, `Operation object missing OpenAPI fields: ${missing.join(", ")}`);
  } else {
    ok(test, "Operation object matches OpenAPI DomainOperationSchema fields");
  }

  const internal = ["user_id","idempotency_key","request_data","response_data","provider_request_id"];
  const leaked = internal.filter(k => k in op);
  if (leaked.length) {
    fail(test, `SECURITY: internal fields leaking in operation response: ${leaked.join(", ")}`);
  } else {
    ok(test, "Internal operation fields correctly stripped");
  }
}

function checkPurchaseRequestShape(pr, test) {
  const required = [
    "id","app_id","domain","status","purchase_price","renewal_price",
    "currency","provider","last_error",
    "metadata","created_at","updated_at",
  ];
  const missing = required.filter(k => !(k in pr));
  if (missing.length) {
    fail(test, `PurchaseRequest missing OpenAPI fields: ${missing.join(", ")}`);
  } else {
    ok(test, "PurchaseRequest matches OpenAPI public marketplace schema");
  }

  const leakedInternal = ["user_id", "idempotency_key", "provider_request_id"].filter((k) => k in pr);
  if (leakedInternal.length) {
    fail(test, `SECURITY: internal purchase fields leaking: ${leakedInternal.join(", ")}`);
  }
}

// ──────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────

async function testUnauth() {
  const test = "GET /api/v1/domains — unauthenticated";
  const { status, body } = await fetch(`${BASE_URL}/api/v1/domains?app_id=00000000-0000-0000-0000-000000000000`).then(async r => ({ status: r.status, body: await r.json() }));
  if (status === 401 && body?.error) {
    ok(test, `Correctly returns 401 (error=${body.error})`);
  } else {
    fail(test, `Expected 401, got ${status}`);
  }
}

async function testMissingAppId() {
  const test = "GET /api/v1/domains — missing app_id → 400";
  const { status, body } = await req("GET", "/api/v1/domains");
  if (status === 400) {
    ok(test, "Returns 400 for missing required app_id");
  } else {
    fail(test, `Expected 400, got ${status}: ${JSON.stringify(body)}`);
  }
}

async function testListDomains() {
  if (!APP_ID) { warn("GET /api/v1/domains", "Skipped — APP_ID not set"); return null; }
  const test = "GET /api/v1/domains";
  const { status, body, headers } = await req("GET", `/api/v1/domains?app_id=${APP_ID}`);
  if (status !== 200) {
    fail(test, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    return null;
  }
  ok(test, `Status 200, total=${body?.meta?.total}`);
  checkRateHeaders(headers, test);
  if (Array.isArray(body?.data) && body.data.length > 0) {
    checkDomainShape(body.data[0], `${test} — domain shape`);
    // Verify dns_* fields are present (new in updated schema)
    const first = body.data[0];
    if ("dns_ready" in first) {
      ok(test, `dns_ready field present (value=${first.dns_ready})`);
    } else {
      warn(test, "dns_ready field absent from list response (may be empty list)");
    }
  } else {
    info(test, "No domains in app yet — shape check skipped");
  }
  return body?.data?.[0];
}

async function testMarketSummary() {
  const test = "GET /api/v1/domains/market/summary";
  const { status, body, headers } = await req("GET", "/api/v1/domains/market/summary");
  if (status !== 200) {
    fail(test, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    return;
  }
  const d = body?.data;
  const summaryFields = ["channel","configured","mode","capabilities","notes"];
  const missing = summaryFields.filter(k => !(k in (d || {})));
  if (missing.length) {
    fail(test, `Summary missing fields: ${missing.join(", ")}`);
  } else {
    ok(test, `Summary OK — channel=${d?.channel}, configured=${d?.configured}`);
  }
  checkRateHeaders(headers, test);
}

async function testMarketProviders() {
  const test = "GET /api/v1/domains/market/providers (deprecated)";
  const { status, body } = await req("GET", "/api/v1/domains/market/providers");
  if (status !== 200) {
    fail(test, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    return;
  }
  if (body?.deprecated === true && typeof body?.message === "string") {
    ok(test, "Returns deprecated=true and message as documented");
  } else {
    fail(test, "Missing deprecated or message fields in response");
  }
}

async function testMarketSearch() {
  const test = "POST /api/v1/domains/market/search";

  // Test 1: search by keyword
  const { status: s1, body: b1 } = await req("POST", "/api/v1/domains/market/search", {
    query: "sabpatahai",
    tlds: ["guru", "com", "net"],
  });
  if (s1 !== 200) {
    fail(test, `Keyword search — Expected 200, got ${s1}: ${JSON.stringify(b1)}`);
  } else {
    ok(test, `Keyword search — status 200, results=${b1?.data?.results?.length}`);
    const r = b1?.data?.results?.[0];
    if (r) {
      const resultFields = ["domainName","available","premium","purchasePrice","renewalPrice","currency","purchaseType","reason","fulfillment"];
      const missing = resultFields.filter(k => !(k in r));
      if (missing.length) {
        fail(test, `Search result missing OpenAPI fields: ${missing.join(", ")}`);
      } else {
        ok(test, "Search result matches DomainMarketplaceResult schema");
      }
    }
  }

  // Test 2: search exact domain (already purchased)
  const { status: s2, body: b2 } = await req("POST", "/api/v1/domains/market/search", {
    query: TEST_DOMAIN,
  });
  if (s2 !== 200) {
    fail(`${test} (exact)`, `Expected 200, got ${s2}: ${JSON.stringify(b2)}`);
  } else {
    const exact = b2?.data?.results?.find(r => r.domainName === TEST_DOMAIN);
    if (exact) {
      ok(`${test} (exact)`, `${TEST_DOMAIN} — available=${exact.available}, price=${exact.purchasePrice} ${exact.currency}`);
    } else {
      warn(`${test} (exact)`, `${TEST_DOMAIN} not found in results`);
    }
  }

  // Test 3: invalid payload → 400
  const { status: s3, body: b3 } = await req("POST", "/api/v1/domains/market/search", { query: "" });
  if (s3 === 400) {
    ok(`${test} (validation)`, "Empty query correctly returns 400");
  } else {
    fail(`${test} (validation)`, `Expected 400 for empty query, got ${s3}: ${JSON.stringify(b3)}`);
  }
}

async function testListPurchaseRequests() {
  const test = "GET /api/v1/domains/market/purchase-requests";
  const url = APP_ID
    ? `/api/v1/domains/market/purchase-requests?app_id=${APP_ID}`
    : "/api/v1/domains/market/purchase-requests";
  const { status, body, headers } = await req("GET", url);
  if (status !== 200) {
    fail(test, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    return null;
  }
  ok(test, `Status 200, total=${body?.meta?.total}`);
  checkRateHeaders(headers, test);
  if (Array.isArray(body?.data) && body.data.length > 0) {
    checkPurchaseRequestShape(body.data[0], `${test} — record shape`);
  } else {
    info(test, "No purchase requests yet — shape check skipped");
  }
  return body?.data?.[0];
}

async function testGetPurchaseRequestById(requestId) {
  if (!requestId) { info("GET /api/v1/domains/market/purchase-requests/{id}", "Skipped — no existing request id"); return; }
  const test = `GET /api/v1/domains/market/purchase-requests/${requestId}`;
  const { status, body } = await req("GET", `/api/v1/domains/market/purchase-requests/${requestId}`);
  if (status !== 200) {
    fail(test, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    return;
  }
  ok(test, "Status 200");
  checkPurchaseRequestShape(body?.data, test);
}

async function testGetPurchaseRequestNotFound() {
  const test = "GET /api/v1/domains/market/purchase-requests/{id} — not found";
  const { status, body } = await req("GET", "/api/v1/domains/market/purchase-requests/00000000-0000-0000-0000-000000000000");
  if (status === 404) {
    ok(test, "Returns 404 for unknown id");
  } else {
    fail(test, `Expected 404, got ${status}: ${JSON.stringify(body)}`);
  }
}

async function testOperationNotFound() {
  const test = "GET /api/v1/domain-operations/{id} — not found";
  const { status, body } = await req("GET", "/api/v1/domain-operations/00000000-0000-0000-0000-000000000000");
  if (status === 404) {
    ok(test, "Returns 404 for unknown operation id");
  } else {
    fail(test, `Expected 404, got ${status}: ${JSON.stringify(body)}`);
  }
}

async function testBadUuidFormat() {
  const test = "GET /api/v1/domain-operations/{id} — invalid uuid → 400";
  const { status } = await req("GET", "/api/v1/domain-operations/not-a-uuid");
  if (status === 400) {
    ok(test, "Returns 400 for malformed UUID");
  } else {
    fail(test, `Expected 400, got ${status}`);
  }
}

// ──────────────────────────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log(" Domain API — Safe Endpoint Test");
  console.log(`   BASE_URL : ${BASE_URL}`);
  console.log(`   APP_ID   : ${APP_ID ?? "(not set — some tests skipped)"}`);
  console.log(`   API_KEY  : ${API_KEY ? API_KEY.slice(0, 10) + "…" : "(missing!)"}`);
  console.log("══════════════════════════════════════════════════\n");

  if (!API_KEY) {
    console.error("❌  API_KEY env var is required. Exiting.");
    process.exit(1);
  }

  await testUnauth();
  await testMissingAppId();
  await testMarketSummary();
  await testMarketProviders();
  await testMarketSearch();
  const firstDomain = await testListDomains();
  void firstDomain; // available for additional state-based tests if needed
  const firstRequest = await testListPurchaseRequests();
  await testGetPurchaseRequestById(firstRequest?.id);
  await testGetPurchaseRequestNotFound();
  await testOperationNotFound();
  await testBadUuidFormat();

  console.log("\n══════════════════════════════════════════════════");
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log("══════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
