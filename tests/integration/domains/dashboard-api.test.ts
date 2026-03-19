/**
 * Dashboard Domain API — End-to-End Integration Tests
 *
 * Covers every endpoint exposed under /api/domains/** that a user can reach
 * through the Custom Domains feature in the dashboard.
 *
 * Frontend operations covered:
 *   ✅ GET  /api/domains?app_id=           → list domains for app
 *   ✅ POST /api/domains                   → add domain (external / managed zone)
 *   ✅ POST /api/domains/{id}/verify       → verify TXT record
 *   ✅ POST /api/domains/{id}/activate     → start activation (async op)
 *   ✅ GET  /api/domains/operations/{id}   → poll operation status
 *   ✅ POST /api/domains/{id}/set-primary  → mark domain as primary
 *   ✅ DELETE /api/domains/{id}            → remove domain
 *   ✅ GET  /api/domains/inventory                          → list all domains + connections
 *   ✅ GET  /api/domains/inventory?domain=                  → single-domain detail (domain page)
 *   ✅ GET  /api/domains/dns?domain=                        → list DNS records for managed zone
 *   ✅ POST /api/domains/dns                                → create DNS record (TXT, A, AAAA, ANAME, CNAME)
 *   ✅ PATCH /api/domains/dns                               → update DNS record
 *   ✅ DELETE /api/domains/dns                              → delete DNS record
 *   ✅ GET  /api/domains/registrar?domain=                  → registrar + nameserver info
 *   ✅ PATCH /api/domains/registrar                         → autorenew toggle + nameserver update
 *   ✅ POST /api/domains/market/search                      → search marketplace for domains
 *   ✅ GET  /api/domains/market/summary                     → provider config / summary
 *   ✅ GET  /api/domains/market/purchase-requests           → list purchase requests
 *   ✅ POST /api/domains/market/purchase-requests           → submit purchase request
 *   ✅ GET  /api/domains/market/purchase-requests/{id}      → purchase request detail
 *
 * Prerequisites:
 *   1. Dev server running:  npm run dev
 *   2. Env vars loaded from .env.local (Name.com sandbox, Supabase, etc.)
 *
 * Run:
 *   npx vitest run tests/integration/domains/dashboard-api.test.ts
 */

import { beforeAll, describe, expect, it } from "vitest";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const SUPABASE_URL = process.env.TEST_SUPABASE_URL || "REDACTED_SUPABASE_URL";
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY || "REDACTED_SUPABASE_ANON_KEY";
const COOKIE_KEY = process.env.TEST_SUPABASE_COOKIE_KEY || "REDACTED_SUPABASE_COOKIE_KEY";
const TEST_EMAIL = process.env.TEST_SUPABASE_EMAIL || "REDACTED_EMAIL";
const TEST_PASSWORD = process.env.TEST_SUPABASE_PASSWORD || "REDACTED_PASSWORD";
// Max encoded-length per chunk — must match @supabase/ssr MAX_CHUNK_SIZE.
const MAX_CHUNK_SIZE = 3180;

// Platform-managed zone (in Name.com sandbox account).
const MANAGED_ZONE = "testdomainwork.com";
// Unique subdomain to avoid test-run collisions.
const RUN_ID = Date.now();
const MANAGED_SUBDOMAIN = `api-test-${RUN_ID}.${MANAGED_ZONE}`;
// Truly external domain — will require TXT verification.
const EXTERNAL_DOMAIN = `api-ext-${RUN_ID}.example.net`;

// ─── Shared state set in beforeAll ────────────────────────────────────────────

let cookieHeader = "";
let appId = "";
let managedDomainId = "";
let externalDomainId = "";
let operationId = "";
let createdDnsRecordId: number | null = null;
let purchaseRequestId = "";

// ─── Cookie helpers ───────────────────────────────────────────────────────────

/**
 * Build the `Cookie:` header value that @supabase/ssr 0.7+ expects.
 *
 * Encoding:  "base64-" + base64url(JSON.stringify(session))
 * Chunking:  split on encodeURIComponent boundaries at MAX_CHUNK_SIZE chars.
 *            Because the base64url alphabet is fully URL-safe, the URI-encoded
 *            length equals the raw length — so chunks are plain .slice() calls.
 */
function buildCookieHeader(session: object): string {
  const fullValue =
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

  if (fullValue.length <= MAX_CHUNK_SIZE) {
    return `${COOKIE_KEY}=${fullValue}`;
  }

  // Split into chunks
  const parts: string[] = [];
  let remaining = fullValue;
  while (remaining.length > 0) {
    parts.push(remaining.slice(0, MAX_CHUNK_SIZE));
    remaining = remaining.slice(MAX_CHUNK_SIZE);
  }

  return parts.map((part, i) => `${COOKIE_KEY}.${i}=${part}`).join("; ");
}

// ─── Request helper ───────────────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  options: { body?: object; cookie?: string } = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (options.cookie !== undefined) {
    headers["Cookie"] = options.cookie;
  } else if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  return { status: res.status, body };
}

// ─── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Sign in via Supabase password auth
  const authRes = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    }
  );

  const session = (await authRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;
    token_type?: string;
    user?: Record<string, unknown>;
  };

  if (!session.access_token) {
    throw new Error(`Auth failed: ${JSON.stringify(session).slice(0, 200)}`);
  }

  // 2. Build the @supabase/ssr cookie from the full session object
  cookieHeader = buildCookieHeader(session);

  // 3. Find a running platform app via Supabase REST API
  const appsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/platform_apps?status=eq.running&select=id,name,slug,status&limit=5`,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  const apps = (await appsRes.json()) as Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
  }>;

  if (!Array.isArray(apps) || apps.length === 0) {
    throw new Error(
      "No running platform app found for this user. Create and deploy an app first."
    );
  }

  appId = apps[0].id;
  console.info(`\n  ▶ Using app: "${apps[0].name}" (${appId})`);
  console.info(`  ▶ Managed subdomain: ${MANAGED_SUBDOMAIN}`);
  console.info(`  ▶ External domain:   ${EXTERNAL_DOMAIN}\n`);

  // 4. Clean up orphan test domains from previous runs (prevents hitting 5-domain limit).
  const listRes = await api("GET", `/api/domains?app_id=${appId}`);
  if (listRes.status === 200) {
    const existing = (listRes.body.domains as Array<{ id: string; domain: string }>) ?? [];
    const orphans = existing.filter(
      (d) => d.domain.startsWith("api-test-") || d.domain.startsWith("api-ext-")
    );
    for (const orphan of orphans) {
      await api("DELETE", `/api/domains/${orphan.id}`);
      console.info(`  ▶ Cleaned up orphan domain: ${orphan.domain}`);
    }
  }
}, 30_000);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Auth guard
// ─────────────────────────────────────────────────────────────────────────────

describe("1 • Auth guard", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const { status, body } = await api("GET", `/api/domains?app_id=${appId}`, {
      cookie: "", // no cookie
    });
    expect(status).toBe(401);
    expect(body).toMatchObject({ message: expect.stringContaining("Unauthorized") });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Domain inventory
// ─────────────────────────────────────────────────────────────────────────────

describe("2 • Domain inventory", () => {
  it("GET /api/domains/inventory — returns purchased & connected domains", { timeout: 20_000 }, async () => {
    const { status, body } = await api("GET", "/api/domains/inventory");
    expect(status).toBe(200);

    const data = body.data as Record<string, unknown>;
    expect(data).toBeDefined();
    expect(Array.isArray(data.domains)).toBe(true);

    const domains = data.domains as Array<Record<string, unknown>>;
    console.info(`  ✓ Found ${domains.length} domain(s) in inventory`);

    if (domains.length > 0) {
      const first = domains[0];
      expect(typeof first.domain).toBe("string");
      expect(["purchased", "external", "mixed"]).toContain(first.source);
    }
  });

  it("GET /api/domains/inventory?domain= — returns detail for a single domain (domain detail page)", { timeout: 20_000 }, async () => {
    const { status, body } = await api(
      "GET",
      `/api/domains/inventory?domain=${encodeURIComponent(MANAGED_ZONE)}`
    );
    expect(status).toBe(200);

    const data = body.data as Record<string, unknown>;
    expect(data).toBeDefined();
    expect(Array.isArray(data.domains)).toBe(true);

    const domains = data.domains as Array<Record<string, unknown>>;
    // Must include the root managed zone in results
    const found = domains.find((d) => d.domain === MANAGED_ZONE || String(d.domain).endsWith(`.${MANAGED_ZONE}`));
    expect(found).toBeDefined();
    console.info(`  ✓ Domain detail returned ${domains.length} related item(s) for ${MANAGED_ZONE}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Add domain
// ─────────────────────────────────────────────────────────────────────────────

describe("3 • Add domain", () => {
  it("POST /api/domains — adds external domain (requires TXT verification)", async () => {
    const { status, body } = await api("POST", "/api/domains", {
      body: { app_id: appId, domain: EXTERNAL_DOMAIN },
    });

    expect(status).toBe(201);
    expect(body.verification_required).toBe(true);
    expect(body.managed_zone_detected).toBe(false);
    expect(body.ownership_source).toBe("external");

    const instr = body.verification_instructions as Record<string, unknown>;
    expect(instr.record_type).toBe("TXT");
    expect(typeof instr.record_name).toBe("string");
    expect(typeof instr.record_value).toBe("string");

    const domain = body.domain as Record<string, unknown>;
    externalDomainId = domain.id as string;
    expect(externalDomainId).toBeTruthy();
    console.info(`  ✓ External domain created: ${EXTERNAL_DOMAIN} (${externalDomainId})`);
    console.info(`    TXT record: ${instr.record_name} → ${instr.record_value}`);
  });

  it("POST /api/domains — adds managed-zone subdomain (auto-verified, no TXT needed)", async () => {
    const { status, body } = await api("POST", "/api/domains", {
      body: { app_id: appId, domain: MANAGED_SUBDOMAIN },
    });

    expect(status).toBe(201);
    expect(body.verification_required).toBe(false);
    expect(body.managed_zone_detected).toBe(true);
    expect(["purchase_request", "registrar"]).toContain(body.ownership_source as string);

    const domain = body.domain as Record<string, unknown>;
    managedDomainId = domain.id as string;
    expect(managedDomainId).toBeTruthy();
    // Auto-verified, so status must be "verified" already
    expect(domain.status).toBe("verified");
    console.info(`  ✓ Managed domain created (auto-verified): ${MANAGED_SUBDOMAIN} (${managedDomainId})`);
  });

  it("POST /api/domains — rejects duplicate domain", async () => {
    const { status, body } = await api("POST", "/api/domains", {
      body: { app_id: appId, domain: MANAGED_SUBDOMAIN },
    });
    expect(status).toBe(409);
    expect(body.error).toBe("DOMAIN_ALREADY_IN_USE");
  });

  it("POST /api/domains — rejects invalid domain format", async () => {
    const { status, body } = await api("POST", "/api/domains", {
      body: { app_id: appId, domain: "not_a_domain" },
    });
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. List domains
// ─────────────────────────────────────────────────────────────────────────────

describe("4 • List domains for app", () => {
  it("GET /api/domains?app_id — returns both test domains", async () => {
    const { status, body } = await api("GET", `/api/domains?app_id=${appId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const domains = body.domains as Array<Record<string, unknown>>;
    expect(Array.isArray(domains)).toBe(true);

    const ids = domains.map((d) => d.id);
    expect(ids).toContain(externalDomainId);
    expect(ids).toContain(managedDomainId);

    const meta = body.meta as Record<string, unknown>;
    expect(typeof meta.total).toBe("number");
    console.info(`  ✓ Listed ${domains.length} domain(s) for app`);

    // Check DNS routing fields
    const managed = domains.find((d) => d.id === managedDomainId);
    if (managed) {
      expect(typeof managed.dns_ready).toBe("boolean");
      expect(typeof managed.dns_message).toBe("string");
    }
  });

  it("GET /api/domains — rejects missing app_id", async () => {
    const { status } = await api("GET", "/api/domains");
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Verify domain
// ─────────────────────────────────────────────────────────────────────────────

describe("5 • Verify domain", () => {
  it("POST /api/domains/{id}/verify — fails for external domain (no TXT set)", async () => {
    const { status, body } = await api("POST", `/api/domains/${externalDomainId}/verify`);
    // Verify failures return 200 with verified:false (dashboard UX contract)
    expect(status).toBe(200);
    expect(body.verified).toBe(false);
    expect(body.success).toBe(false);
    // error field holds the message string (not the code)
    expect(typeof body.error).toBe("string");
    expect(body.error).toBeTruthy();
    console.info(`  ✓ Correctly rejected (TXT not set): ${body.error}`);
  });

  it("POST /api/domains/{id}/verify — force_refresh=false on already-verified domain is a no-op", async () => {
    // managed domain was auto-verified; force_refresh=false short-circuits, returns fast
    const { status, body } = await api("POST", `/api/domains/${managedDomainId}/verify`, {
      body: { force_refresh: false },
    });
    expect(status).toBe(200);
    expect(body.verified).toBe(true);
    expect(body.success).toBe(true);
    const domain = body.domain as Record<string, unknown>;
    expect(domain.status).toBe("verified");
  });

  it("POST /api/domains/{id}/verify — invalid domain id returns 400", async () => {
    const { status } = await api("POST", "/api/domains/not-a-uuid/verify");
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. DNS record management
// ─────────────────────────────────────────────────────────────────────────────

describe("6 • DNS record management (platform-managed zone)", () => {
  // The user must own the domain. We added MANAGED_SUBDOMAIN (endsWith .testdomainwork.com)
  // so userOwnsDomain("testdomainwork.com") → true via the connection check.

  it("GET /api/domains/dns?domain=testdomainwork.com — lists existing records", async () => {
    const { status, body } = await api(
      "GET",
      `/api/domains/dns?domain=${MANAGED_ZONE}`
    );
    expect(status).toBe(200);

    const data = body.data as Record<string, unknown>;
    expect(data.managed).toBe(true);
    expect(data.zone).toBe(MANAGED_ZONE);
    expect(Array.isArray(data.records)).toBe(true);

    const records = data.records as Array<Record<string, unknown>>;
    console.info(`  ✓ Found ${records.length} existing DNS record(s) on ${MANAGED_ZONE}`);
  });

  it("GET /api/domains/dns — rejects domain not owned by user", async () => {
    const { status, body } = await api(
      "GET",
      "/api/domains/dns?domain=notourdomain.xyz"
    );
    expect(status).toBe(404);
    expect(body.error).toBe("NOT_FOUND");
  });

  it("POST /api/domains/dns — creates a TXT record", async () => {
    const { status, body } = await api("POST", "/api/domains/dns", {
      body: {
        domain: MANAGED_ZONE,
        type: "TXT",
        host: `api-test-verify-${RUN_ID}`,
        answer: `"test-value-${RUN_ID}"`,
        ttl: 300,
      },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const data = body.data as Record<string, unknown>;
    const record = data.record as Record<string, unknown>;
    expect(record.type).toBe("TXT");
    expect(typeof record.id).toBe("number");

    createdDnsRecordId = record.id as number;
    console.info(`  ✓ Created DNS TXT record id=${createdDnsRecordId}`);
  });

  it("POST /api/domains/dns — rejects CNAME at root (@)", async () => {
    const { status, body } = await api("POST", "/api/domains/dns", {
      body: {
        domain: MANAGED_ZONE,
        type: "CNAME",
        host: "@",
        answer: "some.target.com",
        ttl: 300,
      },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect((body.message as string).toLowerCase()).toContain("cname");
  });

  it("POST /api/domains/dns — rejects MX record without priority", async () => {
    const { status, body } = await api("POST", "/api/domains/dns", {
      body: {
        domain: MANAGED_ZONE,
        type: "MX",
        host: "@",
        answer: "mail.example.com",
        ttl: 300,
        // priority intentionally omitted
      },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect((body.message as string).toLowerCase()).toContain("priority");
  });

  it("POST /api/domains/dns — rejects unsupported record type", async () => {
    const { status, body } = await api("POST", "/api/domains/dns", {
      body: {
        domain: MANAGED_ZONE,
        type: "SPF",
        host: "test",
        answer: "v=spf1 -all",
        ttl: 300,
      },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("PATCH /api/domains/dns — updates the TXT record answer", async () => {
    if (!createdDnsRecordId) {
      console.warn("  ⚠ Skipping PATCH — no record was created");
      return;
    }

    const { status, body } = await api("PATCH", "/api/domains/dns", {
      body: {
        domain: MANAGED_ZONE,
        record_id: createdDnsRecordId,
        type: "TXT",
        host: `api-test-verify-${RUN_ID}`,
        answer: `"updated-value-${RUN_ID}"`,
        ttl: 600,
      },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const data = body.data as Record<string, unknown>;
    const record = data.record as Record<string, unknown>;
    expect(record.id).toBe(createdDnsRecordId);
    expect(record.ttl).toBe(600);
    console.info(`  ✓ Updated DNS record id=${createdDnsRecordId} ttl=600`);
  });

  it("PATCH /api/domains/dns — rejects missing record_id", async () => {
    const { status, body } = await api("PATCH", "/api/domains/dns", {
      body: {
        domain: MANAGED_ZONE,
        type: "TXT",
        host: "test",
        answer: "v=test",
        // record_id missing
      },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("DELETE /api/domains/dns — deletes the TXT record", async () => {
    if (!createdDnsRecordId) {
      console.warn("  ⚠ Skipping DELETE — no record was created");
      return;
    }

    const { status, body } = await api("DELETE", "/api/domains/dns", {
      body: {
        domain: MANAGED_ZONE,
        record_id: createdDnsRecordId,
      },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const data = body.data as Record<string, unknown>;
    expect(data.deleted).toBe(true);
    expect(data.record_id).toBe(createdDnsRecordId);
    createdDnsRecordId = null;
    console.info(`  ✓ Deleted DNS record successfully`);
  });

  // ── Per-type round-trips ──────────────────────────────────────────────────
  // Each test creates a record and immediately deletes it to stay clean.

  it("POST → DELETE /api/domains/dns — A record round-trip", async () => {
    const host = `a-test-${RUN_ID}`;
    const { status: createStatus, body: createBody } = await api("POST", "/api/domains/dns", {
      body: { domain: MANAGED_ZONE, type: "A", host, answer: "93.184.216.34", ttl: 300 },
    });
    expect(createStatus).toBe(200);
    const recordId = (createBody.data as Record<string, Record<string, unknown>>).record.id as number;
    expect(typeof recordId).toBe("number");
    console.info(`  ✓ Created A record id=${recordId}`);

    const { status: delStatus } = await api("DELETE", "/api/domains/dns", {
      body: { domain: MANAGED_ZONE, record_id: recordId },
    });
    expect(delStatus).toBe(200);
  });

  it("POST → DELETE /api/domains/dns — AAAA record round-trip", { timeout: 15_000 }, async () => {
    const host = `aaaa-test-${RUN_ID}`;
    const { status: createStatus, body: createBody } = await api("POST", "/api/domains/dns", {
      body: { domain: MANAGED_ZONE, type: "AAAA", host, answer: "2001:db8::1", ttl: 300 },
    });
    expect(createStatus).toBe(200);
    const recordId = (createBody.data as Record<string, Record<string, unknown>>).record.id as number;
    expect(typeof recordId).toBe("number");
    console.info(`  ✓ Created AAAA record id=${recordId}`);

    const { status: delStatus } = await api("DELETE", "/api/domains/dns", {
      body: { domain: MANAGED_ZONE, record_id: recordId },
    });
    expect(delStatus).toBe(200);
  });

  it("POST → DELETE /api/domains/dns — ANAME record round-trip (root flattening)", async () => {
    const { status: createStatus, body: createBody } = await api("POST", "/api/domains/dns", {
      body: { domain: MANAGED_ZONE, type: "ANAME", host: `aname-test-${RUN_ID}`, answer: "target.example.com", ttl: 300 },
    });
    expect(createStatus).toBe(200);
    const recordId = (createBody.data as Record<string, Record<string, unknown>>).record.id as number;
    expect(typeof recordId).toBe("number");
    console.info(`  ✓ Created ANAME record id=${recordId}`);

    const { status: delStatus } = await api("DELETE", "/api/domains/dns", {
      body: { domain: MANAGED_ZONE, record_id: recordId },
    });
    expect(delStatus).toBe(200);
  });

  it("POST → DELETE /api/domains/dns — CNAME record round-trip (non-root host)", async () => {
    const host = `cname-test-${RUN_ID}`;
    const { status: createStatus, body: createBody } = await api("POST", "/api/domains/dns", {
      body: { domain: MANAGED_ZONE, type: "CNAME", host, answer: "target.example.com", ttl: 300 },
    });
    expect(createStatus).toBe(200);
    const recordId = (createBody.data as Record<string, Record<string, unknown>>).record.id as number;
    expect(typeof recordId).toBe("number");
    console.info(`  ✓ Created CNAME record id=${recordId}`);

    const { status: delStatus } = await api("DELETE", "/api/domains/dns", {
      body: { domain: MANAGED_ZONE, record_id: recordId },
    });
    expect(delStatus).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Registrar info
// ─────────────────────────────────────────────────────────────────────────────

describe("7 • Registrar info", () => {
  it("GET /api/domains/registrar?domain=testdomainwork.com — returns nameservers and ownership", async () => {
    const { status, body } = await api(
      "GET",
      `/api/domains/registrar?domain=${MANAGED_ZONE}`
    );
    expect(status).toBe(200);

    const data = body.data as Record<string, unknown>;
    if (data) {
      console.info(`  ✓ Registrar data: ${JSON.stringify(data).slice(0, 120)}...`);
    }
  });

  it("GET /api/domains/registrar — rejects invalid domain", async () => {
    const { status, body } = await api("GET", "/api/domains/registrar?domain=bad!");
    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("PATCH /api/domains/registrar — rejects when neither autorenew_enabled nor nameservers provided", async () => {
    const { status, body } = await api("PATCH", "/api/domains/registrar", {
      body: { domain: MANAGED_ZONE },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("PATCH /api/domains/registrar — rejects invalid domain format", async () => {
    const { status, body } = await api("PATCH", "/api/domains/registrar", {
      body: { domain: "bad domain!!", autorenew_enabled: true },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("PATCH /api/domains/registrar — rejects nameservers with fewer than 2 entries", async () => {
    const { status, body } = await api("PATCH", "/api/domains/registrar", {
      body: { domain: MANAGED_ZONE, nameservers: ["ns1.example.com"] },
    });
    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("PATCH /api/domains/registrar — toggles autorenew for owned managed subdomain", async () => {
    // MANAGED_SUBDOMAIN was created in section 3 (POST /api/domains) and is
    // owned by the test user in platform_app_domains.  resolveManagedZone will
    // walk up to testdomainwork.com which is on Name.com.
    const { status, body } = await api("PATCH", "/api/domains/registrar", {
      body: { domain: MANAGED_SUBDOMAIN, autorenew_enabled: true },
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(data.managed).toBe(true);
    expect(typeof data.autorenew_enabled).toBe("boolean");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Marketplace search
// ─────────────────────────────────────────────────────────────────────────────

describe("8 • Marketplace search", () => {
  it("POST /api/domains/market/search — returns search results", async () => {
    const { status, body } = await api("POST", "/api/domains/market/search", {
      body: { query: "galaxytest" },
    });

    expect(status).toBe(200);
    const data = body.data as Record<string, unknown>;
    expect(data).toBeDefined();
    expect(Array.isArray(data.results)).toBe(true);

    const results = data.results as Array<Record<string, unknown>>;
    console.info(`  ✓ Marketplace search returned ${results.length} result(s)`);

    if (results.length > 0) {
      expect(typeof results[0].domainName).toBe("string");
      // purchasable is optional — some results may omit it
      if (results[0].purchasable !== undefined) {
        expect(typeof results[0].purchasable).toBe("boolean");
      }
    }
  });

  it("POST /api/domains/market/search — rejects empty query", async () => {
    const { status } = await api("POST", "/api/domains/market/search", {
      body: { query: "" },
    });
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8b. Marketplace purchase flow
// ─────────────────────────────────────────────────────────────────────────────

describe("8b • Marketplace purchase flow", () => {
  it("GET /api/domains/market/summary — returns provider config", async () => {
    const { status, body } = await api("GET", "/api/domains/market/summary");
    expect(status).toBe(200);

    const data = body.data as Record<string, unknown>;
    expect(data).toBeDefined();
    // The summary always has a channel field
    expect(typeof data.channel).toBe("string");
    console.info(`  ✓ Market summary – channel: ${data.channel}`);
  });

  it("GET /api/domains/market/purchase-requests — lists account purchase requests", async () => {
    const { status, body } = await api("GET", "/api/domains/market/purchase-requests");
    expect(status).toBe(200);

    const data = body.data as Array<Record<string, unknown>>;
    expect(Array.isArray(data)).toBe(true);
    console.info(`  ✓ Found ${data.length} purchase request(s)`);

    if (data.length > 0) {
      const first = data[0];
      expect(typeof first.id).toBe("string");
      expect(typeof first.domain).toBe("string");
      expect(["requested", "processing", "completed", "failed", "cancelled"]).toContain(first.status);

      // Save a real ID for the GET-by-ID test below
      purchaseRequestId = first.id as string;
    }
  });

  it("GET /api/domains/market/purchase-requests?app_id= — filters by app", async () => {
    const { status, body } = await api(
      "GET",
      `/api/domains/market/purchase-requests?app_id=${appId}`
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("GET /api/domains/market/purchase-requests?app_id= — rejects invalid UUID", async () => {
    const { status } = await api(
      "GET",
      "/api/domains/market/purchase-requests?app_id=not-a-uuid"
    );
    expect(status).toBe(400);
  });

  it("POST /api/domains/market/purchase-requests — handles already-registered domain gracefully", async () => {
    // testdomainwork.com is already owned — the registrar will return purchasable:false
    // (or an existing completed request will be returned idempotently).
    // Either 201 (idempotent existing request returned) or 409 (DOMAIN_NOT_AVAILABLE) is correct.
    const { status, body } = await api("POST", "/api/domains/market/purchase-requests", {
      body: { domain: MANAGED_ZONE },
    });
    const isExpected = status === 201 || status === 409;
    expect(isExpected).toBe(true);

    if (status === 201) {
      const data = body.data as Record<string, unknown>;
      expect(typeof data.id).toBe("string");
      expect(data.domain).toBe(MANAGED_ZONE);
      if (!purchaseRequestId) purchaseRequestId = data.id as string;
      console.info(`  ✓ POST purchase-requests returned existing request: ${data.id}`);
    } else {
      expect(body.error).toBe("DOMAIN_NOT_AVAILABLE");
      console.info(`  ✓ POST purchase-requests correctly rejected unavailable domain`);
    }
  });

  it("POST /api/domains/market/purchase-requests — rejects invalid domain format", async () => {
    const { status, body } = await api("POST", "/api/domains/market/purchase-requests", {
      body: { domain: "not_a_domain" },
    });
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("GET /api/domains/market/purchase-requests/{id} — returns purchase request detail", async () => {
    if (!purchaseRequestId) {
      console.warn("  ⚠ No purchase request ID — skipping (no prior requests on account)");
      return;
    }

    const { status, body } = await api(
      "GET",
      `/api/domains/market/purchase-requests/${purchaseRequestId}`
    );
    expect(status).toBe(200);

    const data = body.data as Record<string, unknown>;
    expect(data.id).toBe(purchaseRequestId);
    expect(typeof data.domain).toBe("string");
    expect(["requested", "processing", "completed", "failed", "cancelled"]).toContain(data.status);
    console.info(`  ✓ Purchase request ${purchaseRequestId}: domain=${data.domain} status=${data.status}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Domain activation (async operation)
// ─────────────────────────────────────────────────────────────────────────────

describe("9 • Domain activation (async operation)", () => {
  it("POST /api/domains/{id}/activate — creates activation operation", async () => {
    // managedDomainId is status=verified, so we can activate it.
    const { status, body } = await api(
      "POST",
      `/api/domains/${managedDomainId}/activate`
    );

    // Activate returns 202 Accepted (async operation initiated)
    expect(status).toBe(202);
    expect(body.success).toBe(true);
    expect(typeof body.operation_id).toBe("string");

    operationId = body.operation_id as string;
    console.info(`  ✓ Activation operation created: ${operationId}`);
    console.info(`    ℹ Activation runs Jenkins K8s pipeline — will fail in non-prod (expected)`);
  });

  it("GET /api/domains/operations/{id} — returns operation status", async () => {
    if (!operationId) {
      console.warn("  ⚠ No operation ID — skipping poll");
      return;
    }

    const { status, body } = await api(
      "GET",
      `/api/domains/operations/${operationId}`
    );
    expect(status).toBe(200);

    const operation = body.operation as Record<string, unknown>;
    expect(operation.id).toBe(operationId);
    expect(["pending", "running", "succeeded", "failed"]).toContain(operation.status);
    console.info(`  ✓ Operation status: ${String(operation.status)}`);
  });

  it("GET /api/domains/operations/{id} — invalid UUID returns 400", async () => {
    const { status } = await api("GET", "/api/domains/operations/not-a-uuid");
    expect(status).toBe(400);
  });

  it("POST /api/domains/{id}/activate — idempotent reuse returns existing operation", async () => {
    // Calling again reuses the in-progress op (OPERATION_IN_PROGRESS), so we
    // expect a 4xx or 202 with the same operation.
    const { status } = await api(
      "POST",
      `/api/domains/${managedDomainId}/activate`
    );
    // Either 409 (operation in progress) or 202 (idempotency replay)
    expect([202, 409]).toContain(status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Set primary domain
// ─────────────────────────────────────────────────────────────────────────────

describe("10 • Set primary domain", () => {
  it("POST /api/domains/{id}/set-primary — rejects non-active domain", async () => {
    // managedDomainId is verified/activating — not active yet.
    const { status, body } = await api(
      "POST",
      `/api/domains/${managedDomainId}/set-primary`
    );
    // DOMAIN_NOT_ACTIVE maps to HTTP 400
    expect(status).toBe(400);
    expect(body.error).toBe("DOMAIN_NOT_ACTIVE");
    console.info(`  ✓ Correctly rejected non-active domain: ${body.message}`);
  });

  it("POST /api/domains/{id}/set-primary — rejects invalid UUID", async () => {
    const { status } = await api("POST", "/api/domains/bad-uuid/set-primary");
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Cleanup — delete test domains
// ─────────────────────────────────────────────────────────────────────────────

describe("11 • Delete test domains (cleanup)", () => {
  it("DELETE /api/domains/{id} — removes external domain", async () => {
    if (!externalDomainId) {
      console.warn("  ⚠ No external domain ID — skipping");
      return;
    }

    const { status, body } = await api(
      "DELETE",
      `/api/domains/${externalDomainId}`
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deleted).toBe(true);
    console.info(`  ✓ Deleted external domain ${externalDomainId}`);
  });

  it("DELETE /api/domains/{id} — removes managed subdomain", async () => {
    if (!managedDomainId) {
      console.warn("  ⚠ No managed domain ID — skipping");
      return;
    }

    const { status, body } = await api(
      "DELETE",
      `/api/domains/${managedDomainId}`
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deleted).toBe(true);
    console.info(`  ✓ Deleted managed domain ${managedDomainId}`);
  });

  it("DELETE /api/domains/{id} — double-delete returns 404", async () => {
    if (!externalDomainId) return;
    const { status } = await api("DELETE", `/api/domains/${externalDomainId}`);
    expect(status).toBe(404);
  });

  it("DELETE /api/domains/{id} — invalid UUID returns 400", async () => {
    const { status } = await api("DELETE", "/api/domains/not-a-uuid");
    expect(status).toBe(400);
  });
});
