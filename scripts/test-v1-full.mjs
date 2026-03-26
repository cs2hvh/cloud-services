#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 *  Cloud Services — Full V1 API Endpoint Test Suite
 * ═══════════════════════════════════════════════════════════════
 *
 * Safe, read-only testing of all v1 API endpoints.
 * Mutating calls are only made against test/throwaway resources
 * or skipped (e.g. domain purchase).
 *
 * Usage:
 *   PAT=sk_live_... node scripts/test-v1-full.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PAT  = process.env.PAT;

// ── Counters ───────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0, warnings = 0;
const issues = [];

function ok(t, ...a)   { passed++;  console.log(`  ✅ [${t}]`, ...a); }
function fail(t, ...a) { failed++;  console.log(`  ❌ [${t}]`, ...a); issues.push(`${t}: ${a.join(" ")}`); }
function skip(t, ...a) { skipped++; console.log(`  ⏭️  [${t}]`, ...a); }
function warn(t, ...a) { warnings++; console.log(`  ⚠️  [${t}]`, ...a); issues.push(`WARN ${t}: ${a.join(" ")}`); }
function info(t, ...a) {            console.log(`  ℹ️  [${t}]`, ...a); }
function section(title) { console.log(`\n━━━ ${title} ${"━".repeat(Math.max(0, 56 - title.length))}`); }

// ── Fetch helper ───────────────────────────────────────────────
async function api(method, path, body, extraHeaders = {}) {
  const url = `${BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${PAT}`,
    ...extraHeaders,
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  const hdrs = Object.fromEntries(res.headers);
  return { status: res.status, body: json, raw: text, headers: hdrs };
}

// ── Schema assert helpers ──────────────────────────────────────
function assertFields(obj, fields, test) {
  if (!obj || typeof obj !== "object") { fail(test, "Response body is not an object"); return false; }
  const missing = fields.filter(f => !(f in obj));
  if (missing.length) { fail(test, `Missing fields: ${missing.join(", ")}`); return false; }
  ok(test, "All expected fields present");
  return true;
}

function assertNoLeak(obj, forbidden, test) {
  if (!obj || typeof obj !== "object") return;
  const leaked = forbidden.filter(f => f in obj);
  if (leaked.length) { fail(test, `SECURITY: Leaking internal fields: ${leaked.join(", ")}`); }
  else { ok(test, "No internal field leaks"); }
}

function checkRateHeaders(headers, test) {
  if (headers["x-ratelimit-limit"]) ok(test + " rate-hdrs", `limit=${headers["x-ratelimit-limit"]} remaining=${headers["x-ratelimit-remaining"]}`);
  else warn(test + " rate-hdrs", "Missing X-RateLimit-Limit header");
}

// ════════════════════════════════════════════════════════════════
//  TESTS
// ════════════════════════════════════════════════════════════════

// ── Auth ───────────────────────────────────────────────────────
async function testAuth() {
  section("Authentication & Error Handling");

  // No auth header
  const r1 = await fetch(`${BASE}/api/v1/projects`).then(async r => ({ s: r.status, b: await r.json().catch(() => null) }));
  if (r1.s === 401) ok("no-auth → 401", `error=${r1.b?.error}`);
  else fail("no-auth → 401", `Got ${r1.s}`);

  // Bad token
  const r2 = await api("GET", "/api/v1/projects", null, { Authorization: "Bearer sk_live_INVALID_TOKEN_123456" });
  if (r2.status === 401) ok("bad-token → 401", `error=${r2.body?.error}`);
  else fail("bad-token → 401", `Got ${r2.status}`);

  // Method not allowed (POST to GET-only route)
  const r3 = await api("PUT", "/api/v1/projects");
  if (r3.status === 405 || r3.status === 404 || r3.status === 400) ok("method-not-allowed", `status=${r3.status}`);
  else warn("method-not-allowed", `Expected 405/404, got ${r3.status}`);

  // Invalid JSON body
  const r4 = await fetch(`${BASE}/api/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PAT}` },
    body: "{broken-json",
  }).then(async r => ({ s: r.status, b: await r.json().catch(() => null) }));
  if (r4.s === 400) ok("invalid-json → 400", `error=${r4.b?.error}`);
  else warn("invalid-json", `Expected 400, got ${r4.s} — ${JSON.stringify(r4.b)}`);
}

// ── Projects ───────────────────────────────────────────────────
let PROJECT_ID = null;

async function testProjects() {
  section("Projects");

  // List
  const list = await api("GET", "/api/v1/projects");
  if (list.status !== 200) { fail("GET /projects", `${list.status}: ${JSON.stringify(list.body)}`); return; }
  ok("GET /projects", `200, count=${list.body?.data?.length}`);
  checkRateHeaders(list.headers, "GET /projects");

  if (Array.isArray(list.body?.data) && list.body.data.length > 0) {
    const p = list.body.data[0];
    assertFields(p, ["id", "name", "description", "created_at"], "project shape");
    assertNoLeak(p, ["user_id"], "project leak");
    PROJECT_ID = p.id;
    info("project-id", PROJECT_ID);

    // Get by ID
    const get = await api("GET", `/api/v1/projects/${PROJECT_ID}`);
    if (get.status === 200) {
      ok("GET /projects/:id", "200");
      assertFields(get.body?.data, ["id", "name"], "project detail shape");
    } else {
      fail("GET /projects/:id", `${get.status}`);
    }
  } else {
    info("projects", "No projects exist — creating test project");
    const create = await api("POST", "/api/v1/projects", { name: "api-test-project", description: "Automated test" });
    if (create.status === 201 || create.status === 200) {
      ok("POST /projects", `${create.status}`);
      PROJECT_ID = create.body?.data?.id;
      info("created project", PROJECT_ID);
    } else {
      fail("POST /projects", `${create.status}: ${JSON.stringify(create.body)}`);
    }
  }

  // Validation: empty name
  const bad = await api("POST", "/api/v1/projects", { name: "" });
  if (bad.status === 400) ok("POST /projects validation", "Empty name → 400");
  else warn("POST /projects validation", `Expected 400, got ${bad.status}`);

  // Not found
  const nf = await api("GET", "/api/v1/projects/00000000-0000-0000-0000-000000000000");
  if (nf.status === 404) ok("GET /projects/:id 404", "Returns 404");
  else warn("GET /projects/:id 404", `Expected 404, got ${nf.status}`);

  // Bad UUID
  const buid = await api("GET", "/api/v1/projects/not-a-uuid");
  if (buid.status === 400 || buid.status === 404) ok("GET /projects bad-uuid", `${buid.status}`);
  else warn("GET /projects bad-uuid", `Expected 400/404, got ${buid.status}`);
}

// ── Apps ───────────────────────────────────────────────────────
let APP_ID = null;

async function testApps() {
  section("Apps");

  const list = await api("GET", "/api/v1/apps");
  if (list.status !== 200) { fail("GET /apps", `${list.status}: ${JSON.stringify(list.body)}`); return; }
  ok("GET /apps", `200, count=${list.body?.data?.length}`);
  checkRateHeaders(list.headers, "GET /apps");

  if (Array.isArray(list.body?.data) && list.body.data.length > 0) {
    const a = list.body.data[0];
    assertFields(a, ["id", "name", "slug", "status", "created_at"], "app shape");
    assertNoLeak(a, ["user_id"], "app leak");
    APP_ID = a.id;
    info("app-id", APP_ID);

    // Get by ID
    const get = await api("GET", `/api/v1/apps/${APP_ID}`);
    if (get.status === 200) {
      ok("GET /apps/:id", "200");
      // Check env-vars
      const envList = await api("GET", `/api/v1/apps/${APP_ID}/env-vars`);
      if (envList.status === 200) {
        const envVars = envList.body?.data?.env_vars;
        if (Array.isArray(envVars)) {
          ok("GET /apps/:id/env-vars", `200, vars=${envVars.length}`);
        } else {
          warn("GET /apps/:id/env-vars", `Unexpected shape: ${JSON.stringify(envList.body)}`);
        }
      } else {
        warn("GET /apps/:id/env-vars", `${envList.status}: ${JSON.stringify(envList.body)}`);
      }
    } else {
      fail("GET /apps/:id", `${get.status}`);
    }
  } else {
    info("apps", "No apps found");
  }

  // Not found
  const nf = await api("GET", "/api/v1/apps/00000000-0000-0000-0000-000000000000");
  if (nf.status === 404) ok("GET /apps/:id 404", "Returns 404");
  else warn("GET /apps/:id 404", `Expected 404, got ${nf.status}`);
}

// ── Domains (safe only) ────────────────────────────────────────
async function testDomains() {
  section("Domains (safe operations only)");

  // Market summary
  const summary = await api("GET", "/api/v1/domains/market/summary");
  if (summary.status === 200) {
    ok("GET /domains/market/summary", "200");
    const d = summary.body?.data;
    assertFields(d, ["channel", "configured", "mode", "capabilities", "notes"], "summary shape");
    checkRateHeaders(summary.headers, "market/summary");
  } else {
    fail("GET /domains/market/summary", `${summary.status}`);
  }

  // Deprecated providers
  const provs = await api("GET", "/api/v1/domains/market/providers");
  if (provs.status === 200) {
    ok("GET /domains/market/providers", "200");
    if (provs.body?.meta?.deprecated === true) ok("providers deprecated flag", "deprecated=true");
    else warn("providers deprecated flag", "Missing deprecated=true");
  } else {
    fail("GET /domains/market/providers", `${provs.status}`);
  }

  // Search (keyword)
  const search1 = await api("POST", "/api/v1/domains/market/search", { query: "sabpatahai", tlds: ["guru", "com", "net"] });
  if (search1.status === 200) {
    ok("POST /domains/market/search (kw)", `200, results=${search1.body?.data?.results?.length}`);
    const r = search1.body?.data?.results?.[0];
    if (r) assertFields(r, ["domainName", "available", "purchasePrice", "currency", "fulfillment"], "search result shape");
    checkRateHeaders(search1.headers, "market/search");
  } else {
    fail("POST /domains/market/search (kw)", `${search1.status}: ${JSON.stringify(search1.body)}`);
  }

  // Search (exact — already purchased domain)
  const search2 = await api("POST", "/api/v1/domains/market/search", { query: "sabpatahai.guru" });
  if (search2.status === 200) {
    const r = search2.body?.data?.results?.find(x => x.domainName === "sabpatahai.guru");
    if (r) ok("search exact (sabpatahai.guru)", `available=${r.available}, price=${r.purchasePrice} ${r.currency}`);
    else warn("search exact", "Domain not in results");
  } else {
    fail("search exact", `${search2.status}`);
  }

  // Search — validation error
  const searchBad = await api("POST", "/api/v1/domains/market/search", { query: "" });
  if (searchBad.status === 400) ok("search validation", "Empty query → 400");
  else warn("search validation", `Expected 400, got ${searchBad.status}`);

  // List purchase requests
  const prList = await api("GET", "/api/v1/domains/market/purchase-requests");
  if (prList.status === 200) {
    ok("GET /domains/market/purchase-requests", `200, total=${prList.body?.meta?.total}`);
    const pr = prList.body?.data?.[0];
    if (pr) {
      assertFields(pr, ["id", "domain", "status", "purchase_price", "currency", "provider", "created_at"], "purchase-request shape");
      // Get by ID
      const prGet = await api("GET", `/api/v1/domains/market/purchase-requests/${pr.id}`);
      if (prGet.status === 200) ok("GET /purchase-requests/:id", "200");
      else fail("GET /purchase-requests/:id", `${prGet.status}`);
    }
  } else {
    fail("GET /purchase-requests", `${prList.status}`);
  }

  // Purchase request not found
  const prNF = await api("GET", "/api/v1/domains/market/purchase-requests/00000000-0000-0000-0000-000000000000");
  if (prNF.status === 404) ok("purchase-request 404", "Returns 404");
  else warn("purchase-request 404", `Expected 404, got ${prNF.status}`);

  // List domains (needs app_id)
  if (APP_ID) {
    const domList = await api("GET", `/api/v1/domains?app_id=${APP_ID}`);
    if (domList.status === 200) {
      ok("GET /domains", `200, total=${domList.body?.meta?.total}`);
      const d = domList.body?.data?.[0];
      if (d) {
        assertFields(d, ["id", "app_id", "domain", "status", "ssl_status", "is_primary", "created_at"], "domain shape");
        assertNoLeak(d, ["user_id"], "domain leak");
        // Check dns routing fields
        if ("dns_ready" in d) ok("domain dns_ready field", `present (${d.dns_ready})`);
        else warn("domain dns_ready", "Missing from list response");
      }
    } else {
      fail("GET /domains", `${domList.status}: ${JSON.stringify(domList.body)}`);
    }
  } else {
    skip("GET /domains", "No APP_ID available");
  }

  // Missing app_id
  const domBad = await api("GET", "/api/v1/domains");
  if (domBad.status === 400) ok("GET /domains no app_id", "Returns 400");
  else warn("GET /domains no app_id", `Expected 400, got ${domBad.status}`);

  // Domain operations — not found
  const opNF = await api("GET", "/api/v1/domain-operations/00000000-0000-0000-0000-000000000000");
  if (opNF.status === 404) ok("domain-op 404", "Returns 404");
  else warn("domain-op 404", `Expected 404, got ${opNF.status}`);

  // Bad UUID
  const opBad = await api("GET", "/api/v1/domain-operations/not-a-uuid");
  if (opBad.status === 400) ok("domain-op bad-uuid", "Returns 400");
  else warn("domain-op bad-uuid", `Expected 400, got ${opBad.status}`);

  // SKIP: POST /domains (adds domain), POST /verify,activate,set-primary, DELETE, purchase/checkout
  skip("POST /domains", "Write operation — skipped");
  skip("POST /domains/:id/verify", "Write operation — skipped");
  skip("POST /domains/:id/activate", "Write operation — skipped");
  skip("POST /domains/:id/set-primary", "Write operation — skipped");
  skip("DELETE /domains/:id", "Write operation — skipped");
  skip("POST /purchase-requests", "Would spend money — skipped");
  skip("POST /market/checkout", "Would spend money — skipped");
}

// ── Databases ──────────────────────────────────────────────────
async function testDatabases() {
  section("Databases");

  const list = await api("GET", "/api/v1/databases");
  if (list.status !== 200) { fail("GET /databases", `${list.status}: ${JSON.stringify(list.body)}`); return; }
  ok("GET /databases", `200, count=${list.body?.data?.length}`);
  checkRateHeaders(list.headers, "GET /databases");

  if (Array.isArray(list.body?.data) && list.body.data.length > 0) {
    const db = list.body.data[0];
    assertFields(db, ["id", "name", "engine", "status", "created_at"], "database shape");
    assertNoLeak(db, ["user_id"], "database leak");
    const DB_ID = db.id;
    info("db-id", DB_ID);

    // Get by ID
    const get = await api("GET", `/api/v1/databases/${DB_ID}`);
    if (get.status === 200) {
      ok("GET /databases/:id", "200");
    } else {
      fail("GET /databases/:id", `${get.status}`);
    }

    // List DBs within cluster
    const dbs = await api("GET", `/api/v1/databases/${DB_ID}/dbs`);
    if (dbs.status === 200) {
      ok("GET /databases/:id/dbs", `200, count=${dbs.body?.data?.length}`);
    } else {
      warn("GET /databases/:id/dbs", `${dbs.status}`);
    }

    // List users within cluster
    const users = await api("GET", `/api/v1/databases/${DB_ID}/users`);
    if (users.status === 200) {
      ok("GET /databases/:id/users", `200, count=${users.body?.data?.length}`);
    } else {
      warn("GET /databases/:id/users", `${users.status}`);
    }
  } else {
    info("databases", "No databases exist");
  }

  // Not found
  const nf = await api("GET", "/api/v1/databases/00000000-0000-0000-0000-000000000000");
  if (nf.status === 404) ok("GET /databases/:id 404", "Returns 404");
  else warn("GET /databases/:id 404", `Expected 404, got ${nf.status}`);

  // SKIP mutations
  skip("POST /databases", "Would create resource — skipped");
  skip("DELETE /databases/:id", "Would delete resource — skipped");
}

// ── Kubernetes ─────────────────────────────────────────────────
async function testKubernetes() {
  section("Kubernetes");

  const list = await api("GET", "/api/v1/kubernetes");
  if (list.status !== 200) { fail("GET /kubernetes", `${list.status}: ${JSON.stringify(list.body)}`); return; }
  ok("GET /kubernetes", `200, count=${list.body?.data?.length}`);
  checkRateHeaders(list.headers, "GET /kubernetes");

  if (Array.isArray(list.body?.data) && list.body.data.length > 0) {
    const k = list.body.data[0];
    assertFields(k, ["id", "cluster_name", "status", "created_at"], "k8s shape");
    assertNoLeak(k, ["user_id", "vm_password", "password", "owner_id"], "k8s leak");
    const K8S_ID = k.id;

    const get = await api("GET", `/api/v1/kubernetes/${K8S_ID}`);
    if (get.status === 200) ok("GET /kubernetes/:id", "200");
    else fail("GET /kubernetes/:id", `${get.status}`);
  } else {
    info("kubernetes", "No clusters exist");
  }

  // Not found
  const nf = await api("GET", "/api/v1/kubernetes/00000000-0000-0000-0000-000000000000");
  if (nf.status === 404) ok("GET /kubernetes/:id 404", "Returns 404");
  else warn("GET /kubernetes/:id 404", `Expected 404, got ${nf.status}`);

  skip("POST /kubernetes", "Would create resource — skipped");
  skip("DELETE /kubernetes/:id", "Would delete resource — skipped");
}

// ── Network / Spectrum ─────────────────────────────────────────
async function testNetwork() {
  section("Network / Spectrum");

  const list = await api("GET", "/api/v1/network/spectrum");
  if (list.status !== 200) { fail("GET /network/spectrum", `${list.status}: ${JSON.stringify(list.body)}`); return; }
  ok("GET /network/spectrum", `200, count=${list.body?.data?.length}`);
  checkRateHeaders(list.headers, "GET /network/spectrum");

  if (Array.isArray(list.body?.data) && list.body.data.length > 0) {
    const s = list.body.data[0];
    assertFields(s, ["id", "name", "protocol", "status", "created_at"], "spectrum shape");
    assertNoLeak(s, ["user_id"], "spectrum leak");

    const get = await api("GET", `/api/v1/network/spectrum/${s.id}`);
    if (get.status === 200) ok("GET /network/spectrum/:id", "200");
    else fail("GET /network/spectrum/:id", `${get.status}`);
  } else {
    info("spectrum", "No spectrum apps exist");
  }

  // Not found
  const nf = await api("GET", "/api/v1/network/spectrum/00000000-0000-0000-0000-000000000000");
  if (nf.status === 404) ok("GET /spectrum/:id 404", "Returns 404");
  else warn("GET /spectrum/:id 404", `Expected 404, got ${nf.status}`);

  skip("POST /network/spectrum", "Would create resource — skipped");
  skip("DELETE /network/spectrum/:id", "Would delete resource — skipped");
}

// ── Storage ────────────────────────────────────────────────────
async function testStorage() {
  section("Storage / Buckets");

  const list = await api("GET", "/api/v1/storage/buckets");
  if (list.status !== 200) { fail("GET /storage/buckets", `${list.status}: ${JSON.stringify(list.body)}`); return; }
  ok("GET /storage/buckets", `200, count=${list.body?.data?.length}`);
  checkRateHeaders(list.headers, "GET /storage/buckets");

  if (Array.isArray(list.body?.data) && list.body.data.length > 0) {
    const b = list.body.data[0];
    assertFields(b, ["id", "name", "status", "created_at"], "bucket shape");
    assertNoLeak(b, ["user_id"], "bucket leak");

    const get = await api("GET", `/api/v1/storage/buckets/${b.id}`);
    if (get.status === 200) ok("GET /storage/buckets/:id", "200");
    else fail("GET /storage/buckets/:id", `${get.status}`);
  } else {
    info("storage", "No buckets exist");
  }

  // Not found
  const nf = await api("GET", "/api/v1/storage/buckets/00000000-0000-0000-0000-000000000000");
  if (nf.status === 404) ok("GET /buckets/:id 404", "Returns 404");
  else warn("GET /buckets/:id 404", `Expected 404, got ${nf.status}`);

  skip("DELETE /storage/buckets/:id", "Would delete resource — skipped");
}

// ── Rate Limit (burst test) ────────────────────────────────────
async function testRateLimit() {
  section("Rate Limiting (burst)");

  // Send 5 rapid requests to a cheap endpoint
  const results = await Promise.all(
    Array.from({ length: 5 }, () => api("GET", "/api/v1/projects"))
  );
  const statuses = results.map(r => r.status);
  const got429 = statuses.includes(429);
  const allOk = statuses.every(s => s === 200 || s === 429);

  info("burst statuses", statuses.join(", "));
  if (allOk) ok("burst test", `All responses are 200 or 429`);
  else warn("burst test", `Unexpected statuses: ${statuses.join(", ")}`);

  if (got429) {
    const r429 = results.find(r => r.status === 429);
    if (r429.body?.error === "RATE_LIMIT_EXCEEDED") ok("429 body format", `error=RATE_LIMIT_EXCEEDED retry_after=${r429.body?.details?.retry_after ?? r429.body?.retry_after}`);
    else warn("429 body format", JSON.stringify(r429.body));
  } else {
    info("rate-limit", "No 429 hit in 5 requests — limit is high enough");
  }
}

// ── OpenAPI Spec Availability ──────────────────────────────────
async function testOpenApiSpec() {
  section("OpenAPI Spec Endpoint");

  const r = await fetch(`${BASE}/api-docs`).then(async res => ({ s: res.status, url: res.url }));
  if (r.s === 200) ok("GET /api-docs", `200 (url=${r.url})`);
  else warn("GET /api-docs", `status=${r.s}`);
}

// ════════════════════════════════════════════════════════════════
//  Summary: OpenAPI ↔ Route Coverage
// ════════════════════════════════════════════════════════════════
function openApiCoverageSummary() {
  section("OpenAPI ↔ Route File Coverage");

  const openApiPaths = [
    "GET    /api/v1/projects",
    "POST   /api/v1/projects",
    "GET    /api/v1/projects/{id}",
    "PATCH  /api/v1/projects/{id}",
    "DELETE /api/v1/projects/{id}",
    "GET    /api/v1/apps",
    "GET    /api/v1/apps/{id}",
    "PATCH  /api/v1/apps/{id}",
    "DELETE /api/v1/apps/{id}",
    "GET    /api/v1/apps/{id}/env-vars",
    "PUT    /api/v1/apps/{id}/env-vars",
    "DELETE /api/v1/apps/{id}/env-vars/{key}",
    "GET    /api/v1/databases",
    "POST   /api/v1/databases",
    "GET    /api/v1/databases/{id}",
    "DELETE /api/v1/databases/{id}",
    "GET    /api/v1/databases/{id}/dbs",
    "POST   /api/v1/databases/{id}/dbs",
    "GET    /api/v1/databases/{id}/dbs/{name}",
    "DELETE /api/v1/databases/{id}/dbs/{name}",
    "PUT    /api/v1/databases/{id}/storage",
    "PUT    /api/v1/databases/{id}/storage/upsize",
    "GET    /api/v1/databases/{id}/users",
    "POST   /api/v1/databases/{id}/users",
    "DELETE /api/v1/databases/{id}/users/{username}",
    "POST   /api/v1/databases/{id}/users/{username}/reset-password",
    "GET    /api/v1/kubernetes",
    "POST   /api/v1/kubernetes",
    "GET    /api/v1/kubernetes/{id}",
    "PATCH  /api/v1/kubernetes/{id}",
    "DELETE /api/v1/kubernetes/{id}",
    "GET    /api/v1/domains",
    "POST   /api/v1/domains",
    "POST   /api/v1/domains/{id}/verify",
    "POST   /api/v1/domains/{id}/activate",
    "POST   /api/v1/domains/{id}/set-primary",
    "DELETE /api/v1/domains/{id}",
    "GET    /api/v1/domain-operations/{operationId}",
    "GET    /api/v1/domains/market/summary",
    "GET    /api/v1/domains/market/providers",
    "POST   /api/v1/domains/market/search",
    "GET    /api/v1/domains/market/purchase-requests",
    "POST   /api/v1/domains/market/purchase-requests",
    "GET    /api/v1/domains/market/purchase-requests/{requestId}",
    "POST   /api/v1/domains/market/checkout",
    "GET    /api/v1/network/spectrum",
    "POST   /api/v1/network/spectrum",
    "GET    /api/v1/network/spectrum/{id}",
    "PATCH  /api/v1/network/spectrum/{id}",
    "DELETE /api/v1/network/spectrum/{id}",
    "GET    /api/v1/storage/buckets",
    "GET    /api/v1/storage/buckets/{id}",
    "DELETE /api/v1/storage/buckets/{id}",
  ];

  // Routes that exist in files but NOT in OpenAPI
  const routesNotInOpenApi = [
    "POST   /api/v1/agents/{endpointId}/chat",
  ];

  console.log(`  Documented in OpenAPI: ${openApiPaths.length} endpoints`);
  console.log(`  Route files without OpenAPI docs: ${routesNotInOpenApi.length} endpoints:`);
  for (const r of routesNotInOpenApi) {
    console.log(`    ⚠️  ${r}`);
    issues.push(`MISSING_OPENAPI: ${r}`);
  }
  warnings += routesNotInOpenApi.length;
}

// ════════════════════════════════════════════════════════════════
//  Runner
// ════════════════════════════════════════════════════════════════
async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   Cloud Services — Full V1 API Test Suite            ║");
  console.log(`║   BASE : ${BASE.padEnd(43)}║`);
  console.log(`║   PAT  : ${PAT ? PAT.slice(0,12) + "…" : "(MISSING!)"}${"".padEnd(PAT ? 31 : 32)}║`);
  console.log("╚══════════════════════════════════════════════════════╝");

  if (!PAT) { console.error("\n❌ PAT env var required. Exiting."); process.exit(1); }

  await testAuth();
  await testProjects();
  await testApps();
  await testDomains();
  await testDatabases();
  await testKubernetes();
  await testNetwork();
  await testStorage();
  await testRateLimit();
  await testOpenApiSpec();
  openApiCoverageSummary();

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log(`║  RESULTS: ${String(passed).padStart(3)} passed  ${String(failed).padStart(3)} failed  ${String(warnings).padStart(3)} warnings  ${String(skipped).padStart(3)} skipped ║`);
  console.log("╚══════════════════════════════════════════════════════╝");

  if (issues.length) {
    console.log("\n── Issues ──────────────────────────────────────────");
    for (const i of issues) console.log(`  • ${i}`);
  }

  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
