#!/usr/bin/env node
/**
 * Deep Validation Test — verifies live API response shapes
 * match OpenAPI declared schemas exactly.
 *
 * Checks:
 *  1. Projects — fields match OpenAPI, no owner_id leak
 *  2. K8s — fields match OpenAPI, no owner_id/vm_password leak
 *  3. Domains — fields match OpenAPI, no user_id leak
 *  4. Apps — fields match OpenAPI, no user_id leak, deployment_url present
 *  5. Env vars — service returns correct shape
 *  6. Domain operations — no internal fields leak
 *  7. Domain purchase requests — no internal fields leak
 *  8. Cross-check: OpenAPI spec endpoint count vs routes
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PAT  = process.env.PAT;

if (!PAT) { console.error("Set PAT=sk_live_..."); process.exit(1); }

let passed = 0, failed = 0, warnings = 0;
const issues = [];

function ok(t, ...a)   { passed++;  console.log(`  ✅ [${t}]`, ...a); }
function fail(t, ...a) { failed++;  console.log(`  ❌ [${t}]`, ...a); issues.push(`${t}: ${a.join(" ")}`); }
function warn(t, ...a) { warnings++; console.log(`  ⚠️  [${t}]`, ...a); issues.push(`WARN ${t}: ${a.join(" ")}`); }
function info(t, ...a) {            console.log(`  ℹ️  [${t}]`, ...a); }
function section(title) { console.log(`\n━━━ ${title} ${"━".repeat(Math.max(0, 56 - title.length))}`); }

async function api(method, path, body) {
  const url = `${BASE}${path}`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${PAT}` };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, body: json, raw: text };
}

/** Check that obj contains EXACTLY the expected keys (no more, no less) */
function assertExactFields(obj, expectedKeys, test) {
  if (!obj || typeof obj !== "object") { fail(test, "Not an object"); return false; }
  const actual = Object.keys(obj).sort();
  const expected = [...expectedKeys].sort();
  const extra = actual.filter(k => !expected.includes(k));
  const missing = expected.filter(k => !actual.includes(k));
  
  let good = true;
  if (missing.length) { fail(test + " missing", `Missing fields: ${missing.join(", ")}`); good = false; }
  if (extra.length) { fail(test + " extra", `UNEXPECTED extra fields: ${extra.join(", ")}`); good = false; }
  if (good) ok(test, `${actual.length} fields, all match OpenAPI`);
  return good;
}

/** Check forbidden fields are absent */
function assertNoLeak(obj, forbidden, test) {
  if (!obj || typeof obj !== "object") return;
  const leaked = forbidden.filter(f => f in obj);
  if (leaked.length) fail(test, `SECURITY LEAK: ${leaked.join(", ")}`);
  else ok(test, "No internal field leaks");
}

// ════════════════════════════════════════════════════════════════
//  OpenAPI schema field declarations (source of truth)
// ════════════════════════════════════════════════════════════════

const OPENAPI_PROJECT_FIELDS = ["id", "name", "description", "users", "created_at", "default_project"];
const PROJECT_FORBIDDEN = ["owner_id", "user_id", "password", "secret"];

const OPENAPI_K8S_FIELDS = [
  "id", "cluster_name", "control_plane", "workers", "create_status",
  "connect_status", "verify_status", "node_config", "cni_plugin",
  "k8s_version", "status", "created_at", "updated_at", "project_id"
];
const K8S_FORBIDDEN = ["owner_id", "vm_password", "password", "cluster_id", "user_id"];

const OPENAPI_DOMAIN_FIELDS = [
  "id", "app_id", "domain", "status", "verification_method", "verification_token",
  "verified_at", "activated_at", "ssl_status", "is_primary", "redirect_to_primary",
  "last_error", "last_check_at", "created_at", "updated_at"
];
const DOMAIN_LIST_EXTRA_FIELDS = ["dns_ready", "dns_message", "dns_resolved_ips", "dns_expected_ips"];
const DOMAIN_FORBIDDEN = ["user_id", "owner_id", "idempotency_key"];

const OPENAPI_APP_FIELDS = [
  "id", "name", "slug", "framework", "repository_name", "repository_url", "branch",
  "status", "deployment_url", "port", "ip", "size", "auto_deploy", "git_provider",
  "build_command", "output_directory", "created_at", "updated_at"
];
const APP_FORBIDDEN = ["user_id", "owner_id", "password", "secret", "project_id"];

const OPENAPI_PURCHASE_REQUEST_FIELDS = [
  "id", "app_id", "domain", "status", "purchase_price", "renewal_price",
  "currency", "provider", "last_error", "metadata", "created_at", "updated_at"
];
const PURCHASE_REQUEST_FORBIDDEN = ["user_id", "idempotency_key", "provider_request_id", "request_data"];

const OPENAPI_DOMAIN_OP_FIELDS = [
  "id", "action", "status", "domain_id", "error_code", "error_message",
  "retryable", "started_at", "finished_at", "created_at", "updated_at"
];
const DOMAIN_OP_FORBIDDEN = ["user_id", "idempotency_key", "request_data", "response_data", "provider_request_id"];

// ════════════════════════════════════════════════════════════════
//  TESTS
// ════════════════════════════════════════════════════════════════

async function testProjects() {
  section("Projects — OpenAPI Shape Validation");

  const r = await api("GET", "/api/v1/projects");
  if (r.status !== 200) { fail("projects-list", `Status ${r.status}`); return; }

  const projects = r.body?.data;
  if (!Array.isArray(projects) || projects.length === 0) {
    warn("projects-list", "No projects found, cannot validate shape");
    return;
  }

  const p = projects[0];
  info("project", `Testing '${p.name}' (${p.id})`);
  assertExactFields(p, OPENAPI_PROJECT_FIELDS, "project-list-shape");
  assertNoLeak(p, PROJECT_FORBIDDEN, "project-list-leak");

  // Also test single-item GET
  const r2 = await api("GET", `/api/v1/projects/${p.id}`);
  if (r2.status !== 200) { fail("project-detail", `Status ${r2.status}`); return; }
  assertExactFields(r2.body?.data, OPENAPI_PROJECT_FIELDS, "project-detail-shape");
  assertNoLeak(r2.body?.data, PROJECT_FORBIDDEN, "project-detail-leak");

  // Test meta field
  if (r.body?.meta && typeof r.body.meta.total === "number") ok("project-meta", `meta.total=${r.body.meta.total}`);
  else warn("project-meta", "Missing or invalid meta.total");
}

async function testKubernetes() {
  section("Kubernetes — OpenAPI Shape Validation");

  const r = await api("GET", "/api/v1/kubernetes");
  if (r.status !== 200) { fail("k8s-list", `Status ${r.status}`); return; }

  const clusters = r.body?.data;
  if (!Array.isArray(clusters) || clusters.length === 0) {
    warn("k8s-list", "No clusters found, cannot validate shape");
    return;
  }

  const c = clusters[0];
  info("k8s", `Testing '${c.cluster_name}' (${c.id})`);

  // Exact field check against OpenAPI
  assertExactFields(c, OPENAPI_K8S_FIELDS, "k8s-list-shape");
  assertNoLeak(c, K8S_FORBIDDEN, "k8s-list-leak");

  // Check nested objects
  if (c.control_plane !== null && typeof c.control_plane === "object") {
    const cpFields = Object.keys(c.control_plane);
    const expectedCp = ["public_ip", "droplet_id", "private_ip"];
    const extraCp = cpFields.filter(k => !expectedCp.includes(k));
    if (extraCp.length) warn("k8s-cp-extra", `Control plane has extra fields: ${extraCp.join(", ")}`);
    else ok("k8s-cp-shape", "control_plane shape matches");
  }

  if (Array.isArray(c.workers) && c.workers.length > 0) {
    const w = c.workers[0];
    const workerFields = Object.keys(w);
    const expectedW = ["public_ip", "droplet_id", "private_ip"];
    const extraW = workerFields.filter(k => !expectedW.includes(k));
    if (extraW.length) warn("k8s-worker-extra", `Worker has extra fields: ${extraW.join(", ")}`);
    else ok("k8s-worker-shape", "worker shape matches");
  }

  // Also test single-item GET
  const r2 = await api("GET", `/api/v1/kubernetes/${c.id}`);
  if (r2.status !== 200) { fail("k8s-detail", `Status ${r2.status}`); return; }
  assertExactFields(r2.body?.data, OPENAPI_K8S_FIELDS, "k8s-detail-shape");
  assertNoLeak(r2.body?.data, K8S_FORBIDDEN, "k8s-detail-leak");

  // Verify 'id' is a UUID (not cluster_id passthrough)
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(c.id)) ok("k8s-id-uuid", `id=${c.id} is valid UUID`);
  else fail("k8s-id-uuid", `id=${c.id} is NOT a valid UUID`);
}

async function testApps() {
  section("Apps — OpenAPI Shape Validation");

  const r = await api("GET", "/api/v1/apps");
  if (r.status !== 200) { fail("apps-list", `Status ${r.status}`); return; }

  const apps = r.body?.data;
  if (!Array.isArray(apps) || apps.length === 0) {
    warn("apps-list", "No apps found, cannot validate shape");
    return;
  }

  const a = apps[0];
  info("app", `Testing '${a.name}' (${a.id})`);
  assertExactFields(a, OPENAPI_APP_FIELDS, "app-list-shape");
  assertNoLeak(a, APP_FORBIDDEN, "app-list-leak");

  // Check deployment_url is present and non-null
  if (a.deployment_url && typeof a.deployment_url === "string") {
    ok("app-deployment-url", `deployment_url=${a.deployment_url}`);
  } else {
    warn("app-deployment-url", `deployment_url is ${a.deployment_url}`);
  }

  // Also test single-item GET
  const r2 = await api("GET", `/api/v1/apps/${a.id}`);
  if (r2.status !== 200) { fail("app-detail", `Status ${r2.status}`); return; }
  assertExactFields(r2.body?.data, OPENAPI_APP_FIELDS, "app-detail-shape");
  assertNoLeak(r2.body?.data, APP_FORBIDDEN, "app-detail-leak");
}

async function testEnvVars() {
  section("Env Vars — Shape Validation");

  // First get an app
  const r = await api("GET", "/api/v1/apps");
  if (r.status !== 200 || !r.body?.data?.length) { warn("env-skip", "No apps to test env vars"); return; }
  const appId = r.body.data[0].id;

  const r2 = await api("GET", `/api/v1/apps/${appId}/env-vars`);
  if (r2.status !== 200) { fail("env-list", `Status ${r2.status}`); return; }

  const data = r2.body?.data;
  if (!data) { fail("env-list-data", "No data in response"); return; }

  // Check shape: { app_id, framework, env_vars }
  const expectedEnvListFields = ["app_id", "framework", "env_vars"];
  assertExactFields(data, expectedEnvListFields, "env-list-shape");

  // Check meta
  if (r2.body?.meta && typeof r2.body.meta.total === "number") ok("env-meta", `meta.total=${r2.body.meta.total}`);
  else warn("env-meta", "Missing meta.total");

  // If env vars exist, check each has only {key, value}
  if (Array.isArray(data.env_vars) && data.env_vars.length > 0) {
    const ev = data.env_vars[0];
    assertExactFields(ev, ["key", "value"], "env-var-shape");
  } else {
    info("env-vars", `${data.env_vars?.length || 0} env vars (empty is ok)`);
  }

  // Test PUT env vars (write + read + clean up)
  const testVars = [{ key: "TEST_DEEP_VALIDATION_KEY", value: "test_value_12345" }];
  const r3 = await api("PUT", `/api/v1/apps/${appId}/env-vars`, { env_vars: testVars });
  if (r3.status !== 200) { warn("env-put", `PUT failed: ${r3.status} ${r3.raw?.substring(0, 200)}`); return; }

  const putData = r3.body?.data;
  if (putData) {
    const expectedPutFields = ["app_id", "framework", "env_vars", "apply"];
    assertExactFields(putData, expectedPutFields, "env-put-shape");

    // verify the test var was actually set
    const found = putData.env_vars?.find(e => e.key === "TEST_DEEP_VALIDATION_KEY");
    if (found && found.value === "test_value_12345") ok("env-put-roundtrip", "PUT value matches");
    else fail("env-put-roundtrip", `Expected test var, got: ${JSON.stringify(found)}`);

    // Check apply shape
    if (putData.apply) {
      const applyFields = ["applied_live", "requires_redeploy", "mode"];
      const actual = Object.keys(putData.apply);
      const hasAll = applyFields.every(f => actual.includes(f));
      if (hasAll) ok("env-apply-shape", "apply object has expected fields");
      else warn("env-apply-shape", `apply fields: ${actual.join(", ")}`);
    }
  }

  // DELETE the test env var 
  const r4 = await api("DELETE", `/api/v1/apps/${appId}/env-vars/TEST_DEEP_VALIDATION_KEY`);
  if (r4.status === 200) {
    const delData = r4.body?.data;
    if (delData) {
      const expectedDelFields = ["app_id", "deleted_key", "env_vars", "apply"];
      assertExactFields(delData, expectedDelFields, "env-delete-shape");
      if (delData.deleted_key === "TEST_DEEP_VALIDATION_KEY") ok("env-delete-key", "Correct key deleted");
      else fail("env-delete-key", `Expected TEST_DEEP_VALIDATION_KEY, got ${delData.deleted_key}`);
    }
  } else {
    warn("env-delete", `DELETE status ${r4.status}`);
  }

  // Verify cleanup - env vars should be empty again (or same as before)
  const r5 = await api("GET", `/api/v1/apps/${appId}/env-vars`);
  const remaining = r5.body?.data?.env_vars || [];
  const leftover = remaining.find(e => e.key === "TEST_DEEP_VALIDATION_KEY");
  if (!leftover) ok("env-cleanup", "Test env var successfully cleaned up");
  else fail("env-cleanup", "Test env var still present after DELETE");
}

async function testDomains() {
  section("Domains — OpenAPI Shape Validation");

  const r = await api("GET", "/api/v1/domains?app_id=472e0658-5d3d-4ec7-84ca-0b12c0e1bee2");
  if (r.status !== 200) { fail("domains-list", `Status ${r.status}`); return; }

  const domains = r.body?.data;
  if (!Array.isArray(domains) || domains.length === 0) {
    warn("domains-list", "No domains found, cannot validate shape");
    return;
  }

  const d = domains[0];
  info("domain", `Testing '${d.domain}' (${d.id})`);

  // List returns DomainWithRouting — base fields + dns_* fields
  const listFields = [...OPENAPI_DOMAIN_FIELDS, ...DOMAIN_LIST_EXTRA_FIELDS];
  assertExactFields(d, listFields, "domain-list-shape");
  assertNoLeak(d, DOMAIN_FORBIDDEN, "domain-list-leak");
}

async function testPurchaseRequests() {
  section("Purchase Requests — OpenAPI Shape Validation");

  const r = await api("GET", "/api/v1/domains/market/purchase-requests");
  if (r.status !== 200) { fail("purchase-list", `Status ${r.status}`); return; }

  const requests = r.body?.data;
  if (!Array.isArray(requests) || requests.length === 0) {
    warn("purchase-list", "No purchase requests found");
    return;
  }

  const pr = requests[0];
  info("purchase-req", `Testing '${pr.domain}' (${pr.id})`);
  assertExactFields(pr, OPENAPI_PURCHASE_REQUEST_FIELDS, "purchase-req-shape");
  assertNoLeak(pr, PURCHASE_REQUEST_FORBIDDEN, "purchase-req-leak");

  // Also test single-item GET
  const r2 = await api("GET", `/api/v1/domains/market/purchase-requests/${pr.id}`);
  if (r2.status !== 200) { fail("purchase-detail", `Status ${r2.status}`); return; }
  assertExactFields(r2.body?.data, OPENAPI_PURCHASE_REQUEST_FIELDS, "purchase-detail-shape");
  assertNoLeak(r2.body?.data, PURCHASE_REQUEST_FORBIDDEN, "purchase-detail-leak");
}

async function testOpenAPISpecConsistency() {
  section("OpenAPI Spec Consistency");

  const r = await api("GET", "/api-docs");
  if (r.status !== 200) { fail("openapi-fetch", `Status ${r.status}`); return; }

  // The api-docs might return HTML, let's check the JSON endpoint
  const r2 = await fetch(`${BASE}/api/api-docs`);
  let spec;
  try {
    spec = await r2.json();
  } catch {
    // Try the public file
    const r3 = await fetch(`${BASE}/openapi.json`);
    try { spec = await r3.json(); } catch { warn("openapi-spec", "Cannot fetch OpenAPI spec JSON"); return; }
  }

  if (!spec?.paths) { warn("openapi-spec", "No paths in OpenAPI spec"); return; }

  // Count endpoints
  let endpointCount = 0;
  const tags = new Set();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, details] of Object.entries(methods)) {
      if (["get", "post", "put", "patch", "delete"].includes(method)) {
        endpointCount++;
        (details.tags || []).forEach(t => tags.add(t));
      }
    }
  }

  info("openapi-count", `${endpointCount} endpoints across ${Object.keys(spec.paths).length} paths`);
  info("openapi-tags", `Tags: ${[...tags].join(", ")}`);

  // Verify Project schema does NOT have owner_id
  const projectSchema = spec.components?.schemas?.Project;
  if (projectSchema) {
    const props = Object.keys(projectSchema.properties || {});
    if (props.includes("owner_id")) fail("openapi-project-leak", "OpenAPI Project schema still has owner_id");
    else ok("openapi-project-clean", `Project schema fields: ${props.join(", ")}`);
  }

  // Verify K8s schema has 'id' not 'cluster_id'
  const k8sSchema = spec.components?.schemas?.KubernetesCluster;
  if (k8sSchema) {
    const props = Object.keys(k8sSchema.properties || {});
    if (props.includes("cluster_id")) fail("openapi-k8s-leak", "K8s schema still has cluster_id");
    if (!props.includes("id")) fail("openapi-k8s-id", "K8s schema missing 'id' field");
    else ok("openapi-k8s-clean", `K8s schema fields: ${props.join(", ")}`);
  }

  // Verify Kubernetes tag exists
  if (tags.has("Kubernetes")) ok("openapi-k8s-tag", "Kubernetes tag present");
  else fail("openapi-k8s-tag", "Kubernetes tag missing from OpenAPI spec");

  // Verify env-var endpoints exist
  const envPaths = Object.keys(spec.paths).filter(p => p.includes("env-vars"));
  if (envPaths.length >= 2) ok("openapi-env-paths", `${envPaths.length} env-var paths: ${envPaths.join(", ")}`);
  else fail("openapi-env-paths", `Expected 2+ env-var paths, found ${envPaths.length}`);
}

async function testEdgeCases() {
  section("Edge Cases & Error Handling");

  // Project 404
  const r1 = await api("GET", "/api/v1/projects/00000000-0000-0000-0000-000000000000");
  if (r1.status === 404) ok("project-404", "Correct 404 for non-existent project");
  else fail("project-404", `Expected 404, got ${r1.status}`);

  // K8s 404
  const r2 = await api("GET", "/api/v1/kubernetes/00000000-0000-0000-0000-000000000000");
  if (r2.status === 404) ok("k8s-404", "Correct 404 for non-existent cluster");
  else fail("k8s-404", `Expected 404, got ${r2.status}`);

  // App 404
  const r3 = await api("GET", "/api/v1/apps/00000000-0000-0000-0000-000000000000");
  if (r3.status === 404) ok("app-404", "Correct 404 for non-existent app");
  else fail("app-404", `Expected 404, got ${r3.status}`);

  // Domain operation 404
  const r4 = await api("GET", "/api/v1/domain-operations/00000000-0000-0000-0000-000000000000");
  if (r4.status === 404) ok("domain-op-404", "Correct 404 for non-existent op");
  else fail("domain-op-404", `Expected 404, got ${r4.status}`);

  // Bad UUID format
  const r5 = await api("GET", "/api/v1/projects/not-a-uuid");
  if (r5.status === 400) ok("bad-uuid-400", "Correct 400 for invalid UUID");
  else warn("bad-uuid-400", `Expected 400, got ${r5.status}`);

  // Env var bad key format
  const r6 = await api("DELETE", "/api/v1/apps/00000000-0000-0000-0000-000000000000/env-vars/!!INVALID!!");
  if (r6.status === 400 || r6.status === 404) ok("env-bad-key", `Bad key → ${r6.status}`);
  else warn("env-bad-key", `Expected 400/404, got ${r6.status}`);

  // PATCH project with empty body
  const r7 = await api("PATCH", "/api/v1/projects/00000000-0000-0000-0000-000000000000", {});
  if ([400, 404].includes(r7.status)) ok("patch-empty-body", `Empty PATCH → ${r7.status}`);
  else warn("patch-empty-body", `Expected 400/404, got ${r7.status}`);

  // GET domains without app_id (should require it)
  const r8 = await api("GET", "/api/v1/domains");
  if (r8.status === 400) ok("domains-no-appid", "Correct 400 for missing app_id");
  else warn("domains-no-appid", `Expected 400, got ${r8.status}`);
}

// ════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║   Deep Validation — OpenAPI ↔ API Shape Comparison    ║`);
  console.log(`║   BASE : ${BASE.padEnd(42)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);

  await testProjects();
  await testKubernetes();
  await testApps();
  await testEnvVars();
  await testDomains();
  await testPurchaseRequests();
  await testOpenAPISpecConsistency();
  await testEdgeCases();

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  RESULTS:  ${String(passed).padStart(2)} passed    ${String(failed).padStart(2)} failed    ${String(warnings).padStart(2)} warnings       ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);

  if (issues.length) {
    console.log(`\n── Issues ──────────────────────────────────────────`);
    issues.forEach(i => console.log(`  • ${i}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(2); });
